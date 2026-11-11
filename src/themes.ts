// Board themes. Colors live in styles.css under [data-theme="…"]; this file
// holds the names, the particle effect each theme uses, and preview swatches.

import { createContext, useContext } from 'react';

export type FxKind = 'none' | 'embers' | 'snow' | 'stars' | 'bubbles' | 'sparks' | 'fireflies' | 'glitter';

export interface Theme {
  id: string;
  name: string;
  description: string;
  fx: FxKind;
  /** 'under' draws effects behind see-through squares; 'over' floats them above the pieces. */
  fxLayer: 'under' | 'over';
  swatch: { light: string; dark: string; frame: string; white: string; black: string };
  /** Locked until this ladder rank is beaten. */
  unlockRank?: number;
}

export const THEMES: Theme[] = [
  {
    id: 'walnut',
    name: 'Walnut',
    description: 'The club board. Warm wood, ivory and ebony.',
    fx: 'none',
    fxLayer: 'over',
    swatch: { light: '#e4cda4', dark: '#a3714a', frame: '#4a2e1b', white: '#f1e6cf', black: '#2c2119' },
  },
  {
    id: 'lava',
    name: 'Lava',
    description: 'Cooling rock with glowing cracks. Captured pieces melt.',
    fx: 'embers',
    fxLayer: 'over',
    swatch: { light: '#5e3d2f', dark: '#2b1812', frame: '#160b07', white: '#ffbf5e', black: '#1a181d' },
  },
  {
    id: 'ice',
    name: 'Ice',
    description: 'Frosted glass under falling snow. Captured pieces shatter.',
    fx: 'snow',
    fxLayer: 'over',
    swatch: { light: '#e8f4fb', dark: '#8db7d3', frame: '#c9e4f3', white: '#f4fbff', black: '#284763' },
  },
  {
    id: 'space',
    name: 'Deep space',
    description: 'A see-through board over a starfield. Captures collapse into a point.',
    fx: 'stars',
    fxLayer: 'under',
    swatch: { light: '#6d6aa8', dark: '#1d1a40', frame: '#0b0a1c', white: '#e8ebff', black: '#3a2d6e' },
  },
  {
    id: 'reef',
    name: 'Underwater',
    description: 'Sand and sea glass with rippling light. Bubbles rise as you move.',
    fx: 'bubbles',
    fxLayer: 'over',
    swatch: { light: '#eadcb3', dark: '#2f7f7a', frame: '#1c4a4f', white: '#fbf6ef', black: '#123b44' },
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'A dark grid with glowing lines. Checks flash, captures glitch out.',
    fx: 'sparks',
    fxLayer: 'over',
    swatch: { light: '#1b1f3a', dark: '#0d0f1f', frame: '#06070f', white: '#7ff7ff', black: '#ff5fd2' },
  },
  {
    id: 'forest',
    name: 'Enchanted forest',
    description: 'Birch and moss with fireflies drifting over the board.',
    fx: 'fireflies',
    fxLayer: 'over',
    swatch: { light: '#ddd2a6', dark: '#556f3c', frame: '#2c3a1d', white: '#f6f0dc', black: '#2e2416' },
  },
  {
    id: 'marble',
    name: 'Marble hall',
    description: 'Polished stone with fine veins. Won by beating The Jester on the ladder.',
    fx: 'none',
    fxLayer: 'over',
    swatch: { light: '#eeebe4', dark: '#6d7a78', frame: '#2c3133', white: '#fbf9f4', black: '#22282a' },
    unlockRank: 4,
  },
  {
    id: 'crown',
    name: 'Crown',
    description: 'Gold and royal purple, sprinkled with glitter. Won by reaching the eighth rank.',
    fx: 'glitter',
    fxLayer: 'over',
    swatch: { light: '#ead39b', dark: '#5b2a6e', frame: '#8a6420', white: '#fff1bf', black: '#2a1236' },
    unlockRank: 8,
  },
];

/** Board-wide texture of cell edges (like cracked crust or stone veins), drawn once. */
function cellTexture(seedStart: number, count: number, paint: (edge: number) => [number, number, number, number]) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  // Seeded random so the board looks the same every time.
  let seed = seedStart;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = Array.from({ length: count }, () => [rand() * size, rand() * size]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of pts) {
        // wrap around so the edges tile
        const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px));
        const dy = Math.min(Math.abs(y - py), size - Math.abs(y - py));
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const [r, g, b, a] = paint(Math.sqrt(d2) - Math.sqrt(d1));
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return `url(${c.toDataURL('image/png')})`;
}

let marbleUrl: string | null = null;
/** Fine grey veins for the Marble hall theme. */
export function marbleVeins(): string {
  marbleUrl ??= cellTexture(7, 18, (edge) => {
    const core = Math.max(0, 1 - edge / 1.1);
    const haze = Math.exp(-edge / 10) * 0.22;
    return [70, 74, 76, Math.min(1, Math.max(core * 0.8, haze)) * 255];
  });
  return marbleUrl;
}

/**
 * Cooled-lava crust: glowing cracks along the edges between random cells.
 * Built once at runtime (about 50ms) and cached as an image URL.
 */
let lavaUrl: string | null = null;
export function lavaCracks(): string {
  lavaUrl ??= cellTexture(42, 46, (edge) => {
    const core = Math.max(0, 1 - edge / 1.6);
    const glow = Math.exp(-edge / 5) * 0.32;
    return [255, 110 + 120 * core, 30 + 90 * core, Math.min(1, Math.max(core, glow)) * 255];
  });
  return lavaUrl;
}

export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export interface ThemeState {
  theme: Theme;
  /** Calm mode: fewer particles and no move bursts. */
  calm: boolean;
}

export const ThemeContext = createContext<ThemeState>({ theme: THEMES[0], calm: false });
export const useTheme = () => useContext(ThemeContext);

const KEY = 'chess-trainer:theme';

export function loadThemePrefs(): { id: string; calm: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { id: 'walnut', calm: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { id: 'walnut', calm: false };
}

export function saveThemePrefs(p: { id: string; calm: boolean }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
