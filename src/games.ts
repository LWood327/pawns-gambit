// Finished games, kept so you can review them later.

import type { Color } from 'chess.js';

export interface SavedGame {
  id: string;
  date: number;
  /** All moves in SAN, from the starting position. */
  moves: string[];
  /** Which side you played. */
  player: Color;
  opponent: string;
  mode: 'bot' | 'online';
  /** Short result line, e.g. "Checkmate. You won in 23 moves." */
  result: string;
  /** From your side. Older saved games may not have it. */
  outcome?: 'win' | 'loss' | 'draw';
  /** The computer's strength, for bot and ladder games. */
  botElo?: number;
  ladderRank?: number;
  /** Filled in later by the progress page's background analysis. */
  stats?: { accuracy: number; mistakes: number; blunders: number };
}

const KEY = 'chess-trainer:games';
const MAX = 100;

export function loadGames(): SavedGame[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveGame(g: Omit<SavedGame, 'id' | 'date'>): SavedGame | null {
  if (g.moves.length < 2) return null; // nothing worth reviewing
  const game: SavedGame = { ...g, id: `${Date.now()}`, date: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify([game, ...loadGames()].slice(0, MAX)));
  } catch {
    /* ignore */
  }
  return game;
}

/** Store background-analysis results on a saved game. */
export function setGameStats(id: string, stats: NonNullable<SavedGame['stats']>) {
  const games = loadGames();
  const g = games.find((x) => x.id === id);
  if (!g) return;
  g.stats = stats;
  try {
    localStorage.setItem(KEY, JSON.stringify(games));
  } catch {
    /* ignore */
  }
}

/** Your result in a saved game, including older games saved before `outcome` existed. */
export function outcomeOf(g: SavedGame): 'win' | 'loss' | 'draw' {
  if (g.outcome) return g.outcome;
  if (/You won|You win|You beat/.test(g.result)) return 'win';
  if (/Draw|Stalemate|draw/.test(g.result)) return 'draw';
  return 'loss';
}

/** The computer's rating in older saved games, read from "The Pawn Master (1000)". */
export function botEloOf(g: SavedGame): number | null {
  if (g.mode !== 'bot') return null;
  if (g.botElo) return g.botElo;
  const m = g.opponent.match(/\((\d+)\)$/);
  return m ? Number(m[1]) : null;
}

export interface Rival {
  name: string;
  wins: number;
  losses: number;
  draws: number;
  last: number;
}

/** Your record against each online opponent, most recently played first. */
export function rivals(games = loadGames()): Rival[] {
  const by = new Map<string, Rival>();
  for (const g of games) {
    if (g.mode !== 'online') continue;
    const r = by.get(g.opponent) ?? { name: g.opponent, wins: 0, losses: 0, draws: 0, last: 0 };
    const o = outcomeOf(g);
    if (o === 'win') r.wins++;
    else if (o === 'loss') r.losses++;
    else r.draws++;
    r.last = Math.max(r.last, g.date);
    by.set(g.opponent, r);
  }
  return [...by.values()].sort((a, b) => b.last - a.last);
}

/** "3–1–0" style record line (wins–losses–draws). */
export function recordLine(r: Pick<Rival, 'wins' | 'losses' | 'draws'>) {
  return `${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ''}`;
}

/** Elo-style rating estimate from games against the computer, oldest first. */
export function ratingHistory(games = loadGames()) {
  const chrono = games.filter((g) => botEloOf(g) !== null).sort((a, b) => a.date - b.date);
  let rating = 800;
  const points: { date: number; rating: number }[] = [];
  chrono.forEach((g, i) => {
    const opp = botEloOf(g)!;
    const expected = 1 / (1 + Math.pow(10, (opp - rating) / 400));
    const o = outcomeOf(g);
    const score = o === 'win' ? 1 : o === 'draw' ? 0.5 : 0;
    // Move faster at first so a few games find your level.
    const k = i < 8 ? 64 : 32;
    rating = Math.max(100, Math.round(rating + k * (score - expected)));
    points.push({ date: g.date, rating });
  });
  return points;
}
