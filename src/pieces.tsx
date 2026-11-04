import type { Color, PieceSymbol } from 'chess.js';

// Staunton-style pieces on a 45×45 grid, shaded like turned wood or ivory.
// Colors come from CSS variables so board themes can restyle them.

type Part = { d: string; trim?: boolean };

// Two-tier turned base shared by every piece.
const BASE: Part[] = [
  { d: 'M11 40h23a1.6 1.6 0 0 0 1.6-1.6v-.9a2.2 2.2 0 0 0-2.2-2.2H11.6a2.2 2.2 0 0 0-2.2 2.2v.9A1.6 1.6 0 0 0 11 40z' },
  { d: 'M13.2 35.3c0-1.7 1.3-2.8 2.9-2.8h12.8c1.6 0 2.9 1.1 2.9 2.8z', trim: true },
];

const PARTS: Record<PieceSymbol, Part[]> = {
  p: [
    { d: 'M16.4 32.5c1.5-3.1 3.1-6.4 3.6-10.3h5c.5 3.9 2.1 7.2 3.6 10.3z' },
    { d: 'M17.6 19.9h9.8a1.6 1.6 0 0 1 0 3.2h-9.8a1.6 1.6 0 0 1 0-3.2z', trim: true },
    { d: 'M22.5 8.6a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z' },
  ],
  r: [
    { d: 'M15 32.5l1.4-13.9h12.2l1.4 13.9z' },
    { d: 'M14.4 16.1h16.2a1.3 1.3 0 0 1 0 2.6H14.4a1.3 1.3 0 0 1 0-2.6z', trim: true },
    { d: 'M13 16.1V9.6a.6.6 0 0 1 .6-.6h3.1a.6.6 0 0 1 .6.6v2.3h2.9V9.6a.6.6 0 0 1 .6-.6h3.6a.6.6 0 0 1 .6.6v2.3h2.9V9.6a.6.6 0 0 1 .6-.6h3.1a.6.6 0 0 1 .6.6v6.5z' },
  ],
  n: [
    {
      d: 'M15.4 32.5c.5-3.4 1.5-5.4 3.2-7.3-2.3.2-5-.2-7.2-1.4-1.4-.6-2.1-1.6-1.8-2.9.3-1.3 1-2.3 2-3.3l4.4-5c.8-1.3 1.6-2.8 2.4-4.3l1.8-2.9 1.6 2.6c.8-.8 1.8-1.4 3-1.7l.6 2.7c5 1.6 8 6 8 12.6 0 4-.8 7.6-1.6 10.9z',
    },
  ],
  b: [
    { d: 'M16.4 32.5c.9-3 1.9-5.4 2.5-8.1h7.2c.6 2.7 1.6 5.1 2.5 8.1z' },
    { d: 'M17.8 22.2h9.4a1.3 1.3 0 0 1 0 2.6h-9.4a1.3 1.3 0 0 1 0-2.6z', trim: true },
    { d: 'M22.5 7.9c-4.6 3.2-7 7-7 10.4 0 2.3 1.4 3.8 3.2 3.9h7.6c1.8-.1 3.2-1.6 3.2-3.9 0-3.4-2.4-7.2-7-10.4z' },
    { d: 'M22.5 3.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2z', trim: true },
  ],
  q: [
    { d: 'M15 32.5c1.3-3.8 2.7-8 3.4-12.1h8.2c.7 4.1 2.1 8.3 3.4 12.1z' },
    { d: 'M16.3 18.2h12.4a1.3 1.3 0 0 1 0 2.6H16.3a1.3 1.3 0 0 1 0-2.6z', trim: true },
    { d: 'M14.6 18.2l-2.3-8.3 4.4 4.7 2.1-6.5 1.9 5.2 1.8-6.6 1.8 6.6 1.9-5.2 2.1 6.5 4.4-4.7-2.3 8.3z' },
    { d: 'M12.2 7.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM18.8 5.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM22.5 4.2a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM26.2 5.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM32.8 7.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z', trim: true },
  ],
  k: [
    { d: 'M14.8 32.5c1.3-4 2.7-8.4 3.4-12.6h8.6c.7 4.2 2.1 8.6 3.4 12.6z' },
    { d: 'M15.9 17.5h13.2a1.3 1.3 0 0 1 0 2.6H15.9a1.3 1.3 0 0 1 0-2.6z', trim: true },
    { d: 'M16.5 17.5c-.7-3.9 1.9-7.1 6-7.1s6.7 3.2 6 7.1z' },
    { d: 'M21.2 2.6h2.6v2.6h2.5v2.5h-2.5v3h-2.6v-3h-2.5V5.2h2.5z', trim: true },
  ],
};

// Thin carved lines and small features, drawn in the outline color.
const DETAIL: Partial<Record<PieceSymbol, string>> = {
  b: 'M25 11.6l-4.1 5.6',
  n: 'M25.6 9.6c3.6 1.6 6 5.2 6.2 10.4M18.6 25.2c-.6-.2-1.3-.4-1.9-.7',
  r: 'M17.6 21.6h9.8',
  k: 'M22.5 10.6v6.6',
};

// Solid dots (knight's eye and nostril).
const DOTS: Partial<Record<PieceSymbol, string>> = {
  n: 'M17.9 13.4a1.2 1.1 0 1 1 0 2.2 1.2 1.1 0 0 1 0-2.2zM11.6 20.1a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4z',
};

export function Piece({ type, color }: { type: PieceSymbol; color: Color }) {
  const side = color === 'w' ? 'white' : 'black';
  const parts = [...BASE, ...PARTS[type]];
  return (
    <svg className={`piece-svg ${side}`} viewBox="0 0 45 45" aria-hidden>
      <ellipse className="contact" cx="22.5" cy="40.2" rx="12.5" ry="1.6" />
      <g className="body">
        {parts.map((p, i) => (
          <path key={i} d={p.d} className={p.trim ? 'trim' : undefined} />
        ))}
      </g>
      {DETAIL[type] && <path className="detail" d={DETAIL[type]} />}
      {DOTS[type] && <path className="dots" d={DOTS[type]} />}
      <g className="sheen">
        {parts.map((p, i) => (
          <path key={i} d={p.d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Shared gradients for every piece. Rendered once near the app root.
 * Stops read CSS variables, so a theme can recolor pieces without new SVG.
 */
export function PieceDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {(['w', 'b'] as const).map((c) => (
          <g key={c}>
            <linearGradient id={`pg-${c}`} x1="0" y1="0" x2="1" y2="0.25">
              <stop offset="0" style={{ stopColor: `var(--piece-${c}-hi)` }} />
              <stop offset="0.45" style={{ stopColor: `var(--piece-${c}-mid)` }} />
              <stop offset="1" style={{ stopColor: `var(--piece-${c}-lo)` }} />
            </linearGradient>
            <linearGradient id={`pt-${c}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: `var(--piece-${c}-hi)` }} />
              <stop offset="0.35" style={{ stopColor: `var(--piece-${c}-trim)` }} />
              <stop offset="1" style={{ stopColor: `var(--piece-${c}-lo)` }} />
            </linearGradient>
          </g>
        ))}
        {/* Soft top-left light catching the rounded surfaces */}
        <radialGradient id="p-sheen" cx="0.3" cy="0.25" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};
