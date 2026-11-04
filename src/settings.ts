// Player choices for a game against the computer, remembered between sessions.

export type SideChoice = 'w' | 'b' | 'random';

export interface TimeControl {
  id: string;
  label: string;
  /** Starting time per side in ms; 0 means no clock. */
  base: number;
  /** Added after each of your moves, in ms. */
  increment: number;
  /** Plain explanation shown under the clock choices. */
  description: string;
}

const MIN = 60_000;

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'none', label: 'No clock', base: 0, increment: 0, description: 'Take as long as you like on each move.' },
  {
    id: '3+2',
    label: '3 + 2',
    base: 3 * MIN,
    increment: 2000,
    description: 'Fast. Each side starts with 3 minutes, and you get 2 extra seconds every time you move.',
  },
  { id: '5', label: '5 min', base: 5 * MIN, increment: 0, description: 'Each side has 5 minutes for the whole game.' },
  { id: '10', label: '10 min', base: 10 * MIN, increment: 0, description: 'Each side has 10 minutes for the whole game.' },
  {
    id: '15+10',
    label: '15 + 10',
    base: 15 * MIN,
    increment: 10_000,
    description: 'Relaxed. Each side starts with 15 minutes, and you get 10 extra seconds every time you move.',
  },
  { id: '30', label: '30 min', base: 30 * MIN, increment: 0, description: 'Each side has 30 minutes for the whole game.' },
];

export interface BotGameSettings {
  elo: number;
  side: SideChoice;
  timeId: string;
  /** Grade each of your moves and explain mistakes. */
  coach: boolean;
  /** After a mistake or blunder, offer to take it back before the bot replies. Untimed games only. */
  secondChances: boolean;
}

export const LEVELS = [
  { elo: 400, name: 'New to chess' },
  { elo: 800, name: 'Beginner' },
  { elo: 1200, name: 'Casual player' },
  { elo: 1600, name: 'Club player' },
  { elo: 2000, name: 'Strong club player' },
  { elo: 2400, name: 'Master' },
];

export function levelName(elo: number) {
  let name = LEVELS[0].name;
  for (const l of LEVELS) if (elo >= l.elo) name = l.name;
  return name;
}

export function timeControl(id: string) {
  return TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[0];
}

const KEY = 'chess-trainer:bot-settings';
const DEFAULTS: BotGameSettings = { elo: 1000, side: 'w', timeId: 'none', coach: true, secondChances: true };

export function loadSettings(): BotGameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable; use defaults */
  }
  return DEFAULTS;
}

export function saveSettings(s: BotGameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadMuted() {
  try {
    return localStorage.getItem('chess-trainer:muted') === '1';
  } catch {
    return false;
  }
}

export function saveMuted(m: boolean) {
  try {
    localStorage.setItem('chess-trainer:muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}
