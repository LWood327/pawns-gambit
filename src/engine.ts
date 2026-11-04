// Thin wrapper around the Stockfish web worker (UCI protocol).

type Listener = (line: string) => void;

export interface Strength {
  /** Roughly the rating the bot plays at. */
  elo: number;
}

// Stockfish's own rating limiter only goes down to 1320.
// Below that we use its "Skill Level" setting plus a shallow search instead.
const STOCKFISH_MIN_ELO = 1320;

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
  bestMove(fen: string, { elo }: Strength, maxMs = 800): Promise<string> {
    return this.queue(async () => {
      await this.ready;
      let go: string;
      if (elo >= STOCKFISH_MIN_ELO) {
        this.send('setoption name Skill Level value 20');
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${Math.min(elo, 3190)}`);
        go = `go movetime ${Math.round(maxMs)}`;
      } else {
        // 400 → skill 0 / depth 1, ~1300 → skill 6 / depth 6
        const t = Math.max(0, Math.min(1, (elo - 400) / (STOCKFISH_MIN_ELO - 400)));
        const skill = Math.round(t * 6);
        const depth = 1 + Math.round(t * 5);
        this.send('setoption name UCI_LimitStrength value false');
        this.send(`setoption name Skill Level value ${skill}`);
        go = `go depth ${depth}`;
      }
      await this.sendAndWait('isready', (l) => l === 'readyok');
      this.send(`position fen ${fen}`);
      const line = await this.sendAndWait(go, (l) => l.startsWith('bestmove'));
      return line.split(' ')[1];
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
