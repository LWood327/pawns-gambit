// Thin wrapper around the Stockfish web worker (UCI protocol).

import { Chess } from 'chess.js';
import { styleBonus, type Personality } from './personality';

type Listener = (line: string) => void;

export interface Strength {
  /** Roughly the rating the bot plays at. */
  elo: number;
  /** Playing style (ladder opponents). Changes which good move gets played, not strength. */
  style?: Personality;
}

export interface Analysis {
  cp: number | null;
  mate: number | null;
  best: string;
  pv: string[];
  depth: number;
}

/** One candidate move and its score for the side to move (centipawns; mates are huge). */
export interface Candidate {
  move: string;
  score: number;
}

/*
 * Difficulty.
 * From NATIVE_MIN_ELO up, Stockfish's own rating limiter is used.
 * Below that, Stockfish's "Skill Level" still plays like a steady ~1100 player,
 * so instead the bot imitates how beginners actually lose games:
 *   - some moves are made without really seeing the board (a random legal move,
 *     leaning toward captures and checks, as beginners grab material),
 *   - the rest are picked among many candidates from a shallow search, with
 *     "temperature": the lower the rating, the more willing to play a worse move.
 * The numbers below were tuned by measuring average centipawn loss per level.
 */
const NATIVE_MIN_ELO = 1350;

interface WeakStyle {
  elo: number;
  /** Chance of a move made without really calculating. */
  random: number;
  /** How far below the best move (in centipawns) a pick can wander. */
  temp: number;
  depth: number;
  lines: number;
}

const WEAK_STYLES: WeakStyle[] = [
  { elo: 400, random: 0.5, temp: 520, depth: 1, lines: 20 },
  { elo: 700, random: 0.26, temp: 260, depth: 2, lines: 14 },
  { elo: 1000, random: 0.12, temp: 140, depth: 3, lines: 10 },
  { elo: 1350, random: 0.03, temp: 55, depth: 6, lines: 8 },
];

export function weakStyle(elo: number): WeakStyle {
  const s = WEAK_STYLES;
  if (elo <= s[0].elo) return s[0];
  for (let i = 1; i < s.length; i++) {
    if (elo <= s[i].elo) {
      const a = s[i - 1];
      const b = s[i];
      const t = (elo - a.elo) / (b.elo - a.elo);
      const mix = (x: number, y: number) => x + (y - x) * t;
      return {
        elo,
        random: mix(a.random, b.random),
        temp: mix(a.temp, b.temp),
        depth: Math.round(mix(a.depth, b.depth)),
        lines: Math.round(mix(a.lines, b.lines)),
      };
    }
  }
  return s[s.length - 1];
}

/** A move made without calculating: any legal move, captures and checks a bit more likely. */
function impulsiveMove(fen: string, style: Personality = 'balanced'): string {
  const moves = new Chess(fen).moves({ verbose: true });
  const weights = moves.map(
    (m) => (m.captured ? 3 : 1) * (m.san.includes('+') ? 2 : 1) * Math.exp(styleBonus(fen, m.lan, style) / 60),
  );
  let r = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i];
    if (r <= 0) return moves[i].lan;
  }
  return moves[moves.length - 1].lan;
}

/** Pick among candidates: the further below the best, the less likely. */
function temperedPick(cands: Candidate[], temp: number): string {
  const best = Math.max(...cands.map((c) => c.score));
  const weights = cands.map((c) => Math.exp(-Math.min(2000, best - c.score) / temp));
  let r = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i].move;
  }
  return cands[0].move;
}

const scoreOf = (kind: string, value: number) =>
  kind === 'mate' ? (value > 0 ? 100000 - value * 100 : -100000 - value * 100) : value;

export class Engine {
  private worker: Worker;
  private listeners = new Set<Listener>();
  private ready: Promise<void>;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(onError?: () => void) {
    this.worker = new Worker(new URL('engine/stockfish-nnue-16-single.js', document.baseURI));
    this.worker.onerror = (e) => {
      console.error('Stockfish failed to load', e.message);
      onError?.();
    };
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      this.listeners.forEach((l) => l(line));
    };
    this.ready = (async () => {
      await this.sendAndWait('uci', (l) => l === 'uciok');
      await this.sendAndWait('isready', (l) => l === 'readyok');
      console.info('Stockfish ready');
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private sendAndWait(cmd: string, done: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const l: Listener = (line) => {
        if (done(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
      this.send(cmd);
    });
  }

  /** Runs jobs one at a time so two searches never overlap. */
  private queue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.busy.then(job, job);
    this.busy = next.catch(() => undefined);
    return next;
  }

  /** Returns the bot's move in UCI form, e.g. "e2e4" or "e7e8q". */
  bestMove(fen: string, { elo, style = 'balanced' }: Strength, maxMs = 800): Promise<string> {
    if (elo < NATIVE_MIN_ELO) return this.weakMove(fen, weakStyle(elo), style);
    const native = this.nativeMove(fen, elo, maxMs);
    if (style === 'balanced') return native;
    // Swap the calibrated move for an in-character one only if it's just as good.
    return native.then(async (move) => {
      const cands = await this.candidates(fen, 10, 5);
      const mine = cands.find((c) => c.move === move);
      if (!mine) return move;
      let pick = move;
      let bestFit = styleBonus(fen, move, style);
      for (const c of cands) {
        if (c.score < mine.score - 15) continue;
        const fit = styleBonus(fen, c.move, style);
        if (fit > bestFit) {
          bestFit = fit;
          pick = c.move;
        }
      }
      return pick;
    });
  }

  private nativeMove(fen: string, elo: number, maxMs: number): Promise<string> {
    return this.queue(async () => {
      await this.ready;
      this.send('setoption name MultiPV value 1');
      this.send('setoption name Skill Level value 20');
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${Math.min(elo, 3190)}`);
      await this.sendAndWait('isready', (l) => l === 'readyok');
      this.send(`position fen ${fen}`);
      const line = await this.sendAndWait(`go movetime ${Math.round(maxMs)}`, (l) => l.startsWith('bestmove'));
      return line.split(' ')[1];
    });
  }

  /** A human-like move for ratings below what Stockfish's limiter covers. */
  async weakMove(fen: string, level: WeakStyle, style: Personality = 'balanced'): Promise<string> {
    if (Math.random() < level.random) return impulsiveMove(fen, style);
    const cands = await this.candidates(fen, level.depth, level.lines);
    if (!cands.length) return impulsiveMove(fen, style);
    const styled = style === 'balanced' ? cands : cands.map((c) => ({ ...c, score: c.score + styleBonus(fen, c.move, style) }));
    return temperedPick(styled, level.temp);
  }

  /**
   * The top `lines` moves at a fixed depth, each with its score for the side to move.
   * Also used at higher depth to judge every move in a position.
   */
  candidates(fen: string, depth: number, lines: number): Promise<Candidate[]> {
    return this.queue(async () => {
      await this.ready;
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
      this.send(`setoption name MultiPV value ${lines}`);
      await this.sendAndWait('isready', (l) => l === 'readyok');
      this.send(`position fen ${fen}`);
      const byLine = new Map<number, Candidate>();
      const onInfo: Listener = (line) => {
        if (!line.startsWith('info') || !line.includes(' pv ') || line.includes('bound')) return;
        const t = line.split(' ');
        const at = (k: string) => t.indexOf(k);
        const n = at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1;
        byLine.set(n, { move: t[at('pv') + 1], score: scoreOf(t[at('score') + 1], Number(t[at('score') + 2])) });
      };
      this.listeners.add(onInfo);
      await this.sendAndWait(`go depth ${depth}`, (l) => l.startsWith('bestmove'));
      this.listeners.delete(onInfo);
      this.send('setoption name MultiPV value 1');
      return [...byLine.values()];
    });
  }

  /**
   * Full-strength look at a position. Scores are from the side to move:
   * positive is good for them. `mate` is moves to mate (negative = getting mated).
   */
  analyze(fen: string, movetime = 700, maxDepth = 16): Promise<Analysis> {
    return this.queue(async () => {
      await this.ready;
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
      this.send('setoption name MultiPV value 1');
      await this.sendAndWait('isready', (l) => l === 'readyok');
      this.send(`position fen ${fen}`);
      let latest: Analysis = { cp: 0, mate: null, best: '', pv: [], depth: 0 };
      const onInfo: Listener = (line) => {
        if (!line.startsWith('info') || !line.includes(' pv ') || line.includes('bound')) return;
        const t = line.split(' ');
        const at = (k: string) => t.indexOf(k);
        const depth = Number(t[at('depth') + 1]);
        const kind = t[at('score') + 1];
        const value = Number(t[at('score') + 2]);
        const pv = t.slice(at('pv') + 1);
        latest = {
          cp: kind === 'cp' ? value : null,
          mate: kind === 'mate' ? value : null,
          best: pv[0],
          pv,
          depth,
        };
      };
      this.listeners.add(onInfo);
      const line = await this.sendAndWait(`go depth ${maxDepth} movetime ${movetime}`, (l) => l.startsWith('bestmove'));
      this.listeners.delete(onInfo);
      const best = line.split(' ')[1];
      if (best && best !== '(none)') latest.best = best;
      return latest;
    });
  }

  newGame() {
    this.send('ucinewgame');
  }

  stop() {
    this.send('stop');
  }

  destroy() {
    this.worker.terminate();
  }
}
