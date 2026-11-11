// Playing styles for ladder opponents. A style adds a small bonus (in centipawns)
// to moves that fit its character, so it changes *which* reasonable move gets
// played, not how strong the opponent is.

import { Chess, type Move, type Square } from 'chess.js';

export type Personality = 'balanced' | 'aggressive' | 'fortress' | 'trickster';

export const PERSONALITY_LABEL: Record<Personality, string> = {
  balanced: 'Balanced',
  aggressive: 'Aggressive',
  fortress: 'Fortress',
  trickster: 'Trickster',
};

export const PERSONALITY_HINT: Record<Personality, string> = {
  balanced: 'Plays solid, sensible chess.',
  aggressive: 'Loves captures, checks and charging at your king.',
  fortress: 'Castles early, guards everything and waits for you to slip.',
  trickster: 'Hunts for checks, knight jumps and double attacks.',
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const dist = (a: Square, b: Square) =>
  Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));

function kingSquare(g: Chess, color: 'w' | 'b'): Square | null {
  for (const row of g.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

/** How many valuable enemy pieces the moved piece attacks afterwards. */
function targetsAfter(g: Chess, m: Move) {
  let n = 0;
  for (const row of g.board()) {
    for (const p of row) {
      if (!p || p.color === m.color || (VALUE[p.type] < 3 && p.type !== 'k')) continue;
      if (g.attackers(p.square, m.color).includes(m.to)) n++;
    }
  }
  return n;
}

/** Style bonus for a move, in centipawns. */
export function styleBonus(fen: string, uci: string, style: Personality): number {
  if (style === 'balanced') return 0;
  const g = new Chess(fen);
  let m: Move;
  try {
    m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return 0;
  }
  const enemy = m.color === 'w' ? 'b' : 'w';
  const enemyKing = kingSquare(g, enemy);
  const forward = m.color === 'w' ? Number(m.to[1]) >= 5 : Number(m.to[1]) <= 4;
  const check = g.inCheck();
  const castle = m.flags.includes('k') || m.flags.includes('q');
  const nowHanging =
    g.attackers(m.to, enemy).length > 0 && g.attackers(m.to, m.color).length === 0 && m.piece !== 'k';

  switch (style) {
    case 'aggressive':
      return (
        (m.captured ? 45 : 0) +
        (check ? 35 : 0) +
        (forward ? 15 : 0) +
        (enemyKing && dist(m.to, enemyKing) <= 2 ? 25 : 0) +
        (m.piece === 'q' && forward ? 10 : 0)
      );
    case 'fortress':
      return (castle ? 60 : 0) + (forward ? -10 : 12) + (nowHanging ? -45 : 0) + (check ? -15 : 0) + (m.piece === 'p' && !forward ? 8 : 0);
    case 'trickster':
      return (check ? 45 : 0) + (m.piece === 'n' ? 20 : 0) + (targetsAfter(g, m) >= 2 ? 55 : 0) + (m.captured ? 10 : 0);
  }
}
