// Shared game analysis: accuracy and mistake counts for a finished game.

import { Chess, type Color } from 'chess.js';
import { chances, review, terminalAnalysis } from './coach';
import type { Analysis, Engine } from './engine';

/** Lichess-style move accuracy from the drop in winning chances (0..100 scale). */
export function moveAccuracy(winBefore: number, winAfter: number) {
  const drop = Math.max(0, winBefore - winAfter);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

/** A quick pass over a whole game: your accuracy, mistakes and blunders. */
export async function quickGameStats(engine: Engine, moves: string[], player: Color, msPerPosition = 250) {
  const g = new Chess();
  const fens = [g.fen()];
  const played = [];
  for (const san of moves) {
    try {
      played.push(g.move(san));
      fens.push(g.fen());
    } catch {
      break;
    }
  }
  const analyses: Analysis[] = [];
  for (const fen of fens) {
    analyses.push(terminalAnalysis(new Chess(fen)) ?? (await engine.analyze(fen, msPerPosition, 12)));
  }
  const accs: number[] = [];
  let mistakes = 0;
  let blunders = 0;
  played.forEach((m, i) => {
    if (m.color !== player) return;
    const sign = m.color === 'w' ? 1 : -1;
    const turnSign = (fen: string) => (new Chess(fen).turn() === 'w' ? 1 : -1);
    const before = chances(analyses[i]) * turnSign(fens[i]) * sign;
    const after = chances(analyses[i + 1]) * turnSign(fens[i + 1]) * sign;
    accs.push(moveAccuracy(50 + 50 * before, 50 + 50 * after));
    const r = review(fens[i], fens[i + 1], m.lan, m.san, analyses[i], analyses[i + 1], m.color);
    if (r.grade === 'mistake') mistakes++;
    if (r.grade === 'blunder') blunders++;
  });
  return {
    accuracy: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 0,
    mistakes,
    blunders,
  };
}
