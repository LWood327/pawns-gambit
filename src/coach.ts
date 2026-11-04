// Grades the player's moves and explains them in plain language.

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { Analysis } from './engine';

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface Review {
  grade: Grade;
  /** One or two sentences for the player. */
  text: string;
  playedSan: string;
  bestUci: string;
  bestSan: string;
  /** The opponent's strongest reply, shown as a red arrow for mistakes. */
  threatUci?: string;
}

export const GRADE_LABEL: Record<Grade, string> = {
  best: 'Best move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

export const GRADE_MARK: Partial<Record<Grade, string>> = {
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

const NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/** Score for the side to move, squashed to -1..1 (lichess's winning-chances curve). */
export function chances(a: Pick<Analysis, 'cp' | 'mate'>) {
  if (a.mate !== null) return a.mate > 0 ? 1 : -1;
  return 2 / (1 + Math.exp(-0.00368208 * (a.cp ?? 0))) - 1;
}

/** Analysis of a finished position, where the engine has nothing to say. */
export function terminalAnalysis(game: Chess): Analysis | null {
  if (game.isCheckmate()) return { cp: null, mate: -0, best: '', pv: [], depth: 0 };
  if (game.isGameOver()) return { cp: 0, mate: null, best: '', pv: [], depth: 0 };
  return null;
}

function uciToSan(fen: string, uci: string) {
  if (!uci) return '';
  try {
    const g = new Chess(fen);
    return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

function describeReply(fenAfter: string, replyUci: string, player: Color) {
  const g = new Chess(fenAfter);
  let move;
  try {
    move = g.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] });
  } catch {
    return null;
  }
  // Fork: the moved piece now attacks two or more valuable pieces of yours.
  const targets: { type: PieceSymbol; square: Square }[] = [];
  for (const row of g.board()) {
    for (const p of row) {
      if (!p || p.color !== player) continue;
      if (VALUE[p.type] < 3 && p.type !== 'k') continue;
      if (g.attackers(p.square, move.color).includes(move.to)) targets.push({ type: p.type, square: p.square });
    }
  }
  if (targets.length >= 2 && !move.captured) {
    const names = targets
      .sort((a, b) => VALUE[b.type] - VALUE[a.type])
      .slice(0, 2)
      .map((t) => NAME[t.type]);
    return `The bot can answer ${move.san}, attacking your ${names[0]} and ${names[1]} at once.`;
  }
  if (move.captured) {
    return `This leaves your ${NAME[move.captured]} on ${move.to} open, and the bot can take it with ${move.san}.`;
  }
  return null;
}

export function review(
  fenBefore: string,
  fenAfter: string,
  playedUci: string,
  playedSan: string,
  before: Analysis,
  after: Analysis,
  player: Color,
): Review {
  const bestUci = before.best;
  const bestSan = uciToSan(fenBefore, bestUci);
  const pBefore = chances(before);
  // `after` is from the opponent's side; flip it to the player's.
  const pAfter = -chances(after);
  const drop = pBefore - pAfter;

  let grade: Grade;
  if (playedUci === bestUci || drop <= 0.02) grade = 'best';
  else if (drop < 0.07) grade = 'good';
  else if (drop < 0.15) grade = 'inaccuracy';
  else if (drop < 0.3) grade = 'mistake';
  else grade = 'blunder';

  const hadMate = before.mate !== null && before.mate > 0;
  const allowsMate = after.mate !== null && after.mate > 0;
  const keptMate = after.mate !== null && after.mate < 0;
  // Missing a forced mate is at least a mistake if it throws away a clear win.
  if (hadMate && !keptMate && grade !== 'blunder' && pAfter < 0.6) grade = 'mistake';

  let text: string;
  let threatUci: string | undefined;
  const fenAfterGame = new Chess(fenAfter);

  if (fenAfterGame.isCheckmate()) {
    grade = 'best';
    text = 'Checkmate. Well played.';
  } else if (grade === 'best') {
    text = hadMate && before.mate === 1 ? 'You found the checkmate.' : 'That’s the move Stockfish would play.';
    if (hadMate && keptMate && before.mate !== 1) text = `You’re on track for checkmate in ${-after.mate!} more.`;
  } else if (grade === 'good') {
    text = `Solid. Stockfish slightly preferred ${bestSan}.`;
  } else if (allowsMate) {
    threatUci = after.best;
    const reply = uciToSan(fenAfter, after.best);
    text =
      after.mate === 1
        ? `This lets the bot checkmate you with ${reply}. ${bestSan} would have stopped it.`
        : `This lets the bot force checkmate in ${after.mate} moves, starting with ${reply}. Try ${bestSan} instead.`;
  } else if (hadMate && !keptMate) {
    text =
      before.mate === 1
        ? `You had checkmate with ${bestSan}.`
        : `You had a forced checkmate in ${before.mate}, starting with ${bestSan}.`;
  } else {
    const replyNote = grade !== 'inaccuracy' && after.best ? describeReply(fenAfter, after.best, player) : null;
    if (replyNote) threatUci = after.best;
    const bestMove = (() => {
      try {
        return new Chess(fenBefore).move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] });
      } catch {
        return null;
      }
    })();
    const missedCapture =
      bestMove?.captured && VALUE[bestMove.captured] >= 3 ? `You could have won a ${NAME[bestMove.captured]} with ${bestSan}.` : null;
    if (replyNote) text = `${replyNote} A better move was ${bestSan}.`;
    else if (missedCapture) text = missedCapture;
    else if (grade === 'inaccuracy') text = `Not bad, but ${bestSan} was more accurate here.`;
    else text = `This gives the bot the upper hand. ${bestSan} was the stronger move.`;
  }

  return { grade, text, playedSan, bestUci, bestSan, threatUci };
}

/** Your pieces that can be taken for free or by something cheaper. */
export function hangingPieces(game: Chess, player: Color): Square[] {
  const enemy: Color = player === 'w' ? 'b' : 'w';
  const out: Square[] = [];
  for (const row of game.board()) {
    for (const p of row) {
      if (!p || p.color !== player || p.type === 'k') continue;
      const attackers = game.attackers(p.square, enemy);
      if (attackers.length === 0) continue;
      const defenders = game.attackers(p.square, player);
      const cheapest = Math.min(...attackers.map((s) => VALUE[game.get(s)!.type]));
      if (defenders.length === 0 || cheapest < VALUE[p.type]) out.push(p.square);
    }
  }
  return out;
}

/** Engine score as a short label from White's side, e.g. "+1.4" or "M3". */
export function evalLabel(whiteCp: number | null, whiteMate: number | null) {
  if (whiteMate !== null) return `${whiteMate < 0 ? '-' : ''}M${Math.abs(whiteMate)}`;
  const v = (whiteCp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
