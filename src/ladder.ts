// The ladder: eight opponents, one per rank. Reach the eighth rank to face the Pawn Master.

import type { Personality } from './personality';

export interface Boss {
  rank: number;
  name: string;
  elo: number;
  style: Personality;
  /** One line of character, shown on the ladder. */
  blurb: string;
  /** Board theme unlocked by beating this opponent. */
  reward?: string;
}

export const BOSSES: Boss[] = [
  { rank: 1, name: 'Pip', elo: 400, style: 'balanced', blurb: 'A wandering pawn. Moves first, thinks later.' },
  { rank: 2, name: 'Sir Clatter', elo: 650, style: 'aggressive', blurb: 'Charges at your king with whatever is nearby.' },
  { rank: 3, name: 'Old Mossback', elo: 900, style: 'fortress', blurb: 'Hides behind pawns and waits for you to slip.' },
  { rank: 4, name: 'The Jester', elo: 1150, style: 'trickster', blurb: 'Lives for checks and cheeky forks.', reward: 'marble' },
  { rank: 5, name: 'Captain Rook', elo: 1400, style: 'fortress', blurb: 'Castles early and never leaves a piece loose.' },
  { rank: 6, name: 'Lady Vex', elo: 1700, style: 'aggressive', blurb: 'Sacrifices first, asks questions never.' },
  { rank: 7, name: 'The Archbishop', elo: 2000, style: 'trickster', blurb: 'Every move hides a second threat.' },
  { rank: 8, name: 'The Pawn Master', elo: 2400, style: 'balanced', blurb: 'The one at the top. Promotion awaits.', reward: 'crown' },
];

export interface LadderProgress {
  /** Ranks you have beaten. */
  beaten: number[];
  /** Games played against each rank. */
  tries: Record<number, number>;
}

const KEY = 'chess-trainer:ladder';

export function loadLadder(): LadderProgress {
  try {
    return { beaten: [], tries: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { beaten: [], tries: {} };
  }
}

function saveLadder(p: LadderProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function isUnlocked(rank: number, p = loadLadder()) {
  return rank === 1 || p.beaten.includes(rank - 1);
}

/** Record a finished ladder game. Returns true if this win was new. */
export function recordLadderGame(rank: number, won: boolean): boolean {
  const p = loadLadder();
  p.tries[rank] = (p.tries[rank] ?? 0) + 1;
  const fresh = won && !p.beaten.includes(rank);
  if (fresh) p.beaten.push(rank);
  saveLadder(p);
  return fresh;
}

/** Highest rank reached (the next one to beat, or 8 when all are done). */
export function currentRank(p = loadLadder()) {
  for (const b of BOSSES) if (!p.beaten.includes(b.rank)) return b.rank;
  return 8;
}

/** Themes won on the ladder. */
export function unlockedRewards(p = loadLadder()) {
  return BOSSES.filter((b) => b.reward && p.beaten.includes(b.rank)).map((b) => b.reward!);
}
