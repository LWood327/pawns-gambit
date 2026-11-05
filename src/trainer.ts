// Trainer data: puzzles saved from your own mistakes (with spaced repetition),
// starter checkmate puzzles, and opening lines. All positions and lines here
// were checked with chess.js: each starter's first move is the only one that works.

import type { Color } from 'chess.js';

export interface Puzzle {
  id: string;
  fen: string;
  /** Best move in UCI, e.g. "g1f3". For mate puzzles, the required first move. */
  best: string;
  bestSan: string;
  /** For starter puzzles: checkmate in this many of your moves. */
  mateIn?: number;
  title?: string;
  hint?: string;
  /** For your mistakes: what you actually played, and how bad it was. */
  played?: string;
  grade?: 'mistake' | 'blunder';
  createdAt?: number;
}

export interface SavedPuzzle extends Puzzle {
  /** Spaced-repetition box: 0 = new or missed, 4 = well learned. */
  box: number;
  due: number;
  solved: number;
  failed: number;
}

export const STARTER: Puzzle[] = [
  { id: 's-back-rank', title: 'Back-rank mate', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', best: 'a1a8', bestSan: 'Ra8#', mateIn: 1, hint: 'The king is trapped behind its own pawns.' },
  { id: 's-scholars', title: 'Scholar’s mate', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', best: 'f3f7', bestSan: 'Qxf7#', mateIn: 1, hint: 'f7 is only guarded by the king.' },
  { id: 's-fools', title: 'Fool’s mate', fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', best: 'd8h4', bestSan: 'Qh4#', mateIn: 1, hint: 'White opened the diagonal to their king.' },
  { id: 's-smothered', title: 'Smothered mate', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', best: 'g5f7', bestSan: 'Nf7#', mateIn: 1, hint: 'The king is boxed in by its own pieces.' },
  { id: 's-ladder', title: 'Rook ladder', fen: '7k/R7/1R6/8/8/8/8/6K1 w - - 0 1', best: 'b6b8', bestSan: 'Rb8#', mateIn: 1, hint: 'One rook already guards the seventh rank.' },
  { id: 's-queen-king', title: 'Queen and king', fen: '7k/Q7/6K1/8/8/8/8/8 w - - 0 1', best: 'a7g7', bestSan: 'Qg7#', mateIn: 1, hint: 'Your king covers the squares next to it.' },
  { id: 's-arabian', title: 'Arabian mate', fen: '7k/7p/5N2/8/8/8/8/6RK w - - 0 1', best: 'g1g8', bestSan: 'Rg8#', mateIn: 1, hint: 'The knight guards the rook’s landing square.' },
  { id: 's-queen-sac', title: 'Queen sacrifice', fen: 'r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 1 1', best: 'd5d8', bestSan: 'Qd8+', mateIn: 2, hint: 'Give up the queen to open the e-file.' },
  { id: 's-philidor', title: 'Philidor’s legacy', fen: 'r6k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1', best: 'b3g8', bestSan: 'Qg8+', mateIn: 2, hint: 'Force the rook onto g8, then the knight finishes.' },
];

export interface Opening {
  id: string;
  name: string;
  side: Color;
  /** Moves in SAN, both sides, from the start. */
  line: string[];
  idea: string;
}

const L = (s: string) => s.split(' ');

export const OPENINGS: Opening[] = [
  { id: 'italian', name: 'Italian Game', side: 'w', line: L('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+'), idea: 'Aim the bishop at f7, then build a big pawn center with c3 and d4.' },
  { id: 'ruy', name: 'Ruy Lopez', side: 'w', line: L('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'), idea: 'Pressure the knight that defends e5, castle early, and prepare d4.' },
  { id: 'qgd', name: 'Queen’s Gambit', side: 'w', line: L('d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6'), idea: 'Offer the c-pawn to pull Black’s pawn away from the center.' },
  { id: 'london', name: 'London System', side: 'w', line: L('d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6'), idea: 'A solid setup you can play against almost anything: Bf4, e3, c3.' },
  { id: 'najdorf', name: 'Sicilian Najdorf', side: 'b', line: L('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'), idea: 'Trade a side pawn for White’s center pawn, then a6 keeps knights and bishops off b5.' },
  { id: 'french', name: 'French Defense', side: 'b', line: L('e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7'), idea: 'Challenge e4 with d5 behind a solid pawn chain.' },
  { id: 'caro', name: 'Caro-Kann', side: 'b', line: L('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6'), idea: 'Like the French, but the light bishop gets out before e6.' },
  { id: 'kid', name: 'King’s Indian', side: 'b', line: L('d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5'), idea: 'Let White take the center, castle fast, then strike back with e5.' },
];

/* ---------- Your-mistakes bank (localStorage) ---------- */

const KEY = 'chess-trainer:puzzles';
const DAY = 24 * 60 * 60 * 1000;
/** Days until a puzzle comes back, by box. */
const INTERVALS = [0, 1, 3, 7, 21];

export function loadBank(): SavedPuzzle[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveBank(bank: SavedPuzzle[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bank.slice(-300)));
  } catch {
    /* ignore */
  }
}

/** Save a position where you went wrong, so it can come back as a puzzle. */
export function addMistake(p: Omit<Puzzle, 'id'>) {
  const bank = loadBank();
  const id = `${p.fen}|${p.best}`;
  if (bank.some((b) => b.id === id)) return;
  bank.push({ ...p, id, box: 0, due: Date.now(), solved: 0, failed: 0, createdAt: Date.now() });
  saveBank(bank);
}

export function duePuzzles(now = Date.now()) {
  return loadBank()
    .filter((p) => p.due <= now)
    .sort((a, b) => a.due - b.due);
}

/** Record an attempt: right moves the puzzle up a box, wrong sends it back to the start. */
export function recordAttempt(id: string, correct: boolean) {
  const bank = loadBank();
  const p = bank.find((b) => b.id === id);
  if (!p) return;
  if (correct) {
    p.solved++;
    p.box = Math.min(p.box + 1, INTERVALS.length - 1);
    p.due = Date.now() + INTERVALS[p.box] * DAY;
  } else {
    p.failed++;
    p.box = 0;
    p.due = Date.now() + 10 * 60 * 1000; // try again in ten minutes
  }
  saveBank(bank);
}

export function nextDueLabel() {
  const bank = loadBank();
  if (!bank.length) return null;
  const soonest = Math.min(...bank.map((p) => p.due));
  const days = Math.ceil((soonest - Date.now()) / DAY);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

/* ---------- Opening progress ---------- */

const OKEY = 'chess-trainer:openings';

export function loadOpeningStars(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(OKEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Stars: 1 = finished, 2 = finished with one slip, 3 = perfect. Keeps the best. */
export function saveOpeningStars(id: string, stars: number) {
  const all = loadOpeningStars();
  all[id] = Math.max(all[id] ?? 0, stars);
  try {
    localStorage.setItem(OKEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
