// The daily puzzle: the same position for everyone on a given day, plus your streak.

import PUZZLES from './daily-puzzles.json';
import type { Puzzle } from './trainer';

interface DailyPuzzleData {
  fen: string;
  best: string;
  bestSan: string;
  mateIn?: number;
}

const ALL = PUZZLES as DailyPuzzleData[];
/** Day 1 of the daily puzzle. */
const START = new Date(2026, 10, 1);
const DAY = 24 * 60 * 60 * 1000;

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayNumber(d = new Date()) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((local.getTime() - START.getTime()) / DAY) + 1;
}

/** Today's puzzle and its number ("Daily puzzle #12"). */
export function todaysPuzzle(d = new Date()): { number: number; puzzle: Puzzle } {
  const n = Math.max(1, dayNumber(d));
  const data = ALL[(n - 1) % ALL.length];
  return {
    number: n,
    // The answer is a single move; any other move is checked by the engine.
    puzzle: { id: `daily-${dateKey(d)}`, fen: data.fen, best: data.best, bestSan: data.bestSan, title: `Daily puzzle #${n}` },
  };
}

interface DailyRecord {
  /** Last date you solved it. */
  last: string | null;
  streak: number;
  best: number;
  /** Dates solved, and whether on the first try. */
  history: Record<string, boolean>;
}

const KEY = 'chess-trainer:daily';

function load(): DailyRecord {
  try {
    return { last: null, streak: 0, best: 0, history: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { last: null, streak: 0, best: 0, history: {} };
  }
}

function yesterdayKey(d = new Date()) {
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

/** Streak as of today: it only counts if you solved today or yesterday. */
export function dailyStatus(d = new Date()) {
  const r = load();
  const today = dateKey(d);
  const alive = r.last === today || r.last === yesterdayKey(d);
  return {
    solvedToday: r.last === today,
    firstTryToday: r.history[today] === true,
    streak: alive ? r.streak : 0,
    best: r.best,
    solvedCount: Object.keys(r.history).length,
  };
}

/** Record today's solve. Replays on the same day don't change anything. */
export function recordDaily(firstTry: boolean, d = new Date()) {
  const r = load();
  const today = dateKey(d);
  if (r.last === today) return dailyStatus(d);
  r.streak = r.last === yesterdayKey(d) ? r.streak + 1 : 1;
  r.best = Math.max(r.best, r.streak);
  r.last = today;
  r.history[today] = firstTry;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
  return dailyStatus(d);
}
