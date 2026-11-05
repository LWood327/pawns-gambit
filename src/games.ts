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
}

const KEY = 'chess-trainer:games';
const MAX = 30;

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
