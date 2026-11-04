import type { Color, PieceSymbol } from 'chess.js';

// Custom flat silhouettes on a 45×45 grid. Fill and outline come from CSS
// variables so each board theme can recolor (or make glow) the pieces.

const BASE = 'M10 36.5h25a1.5 1.5 0 0 1 1.5 1.5v3H8.5v-3a1.5 1.5 0 0 1 1.5-1.5z';

const BODY: Record<PieceSymbol, string[]> = {
  p: [
    'M22.5 8a5.5 5.5 0 0 1 3.4 9.8c2.3 1.2 3.9 3.4 4.1 5.7h-3.4c.7 4.3 3.4 8.3 6.4 11V36.5H12V34.5c3-2.7 5.7-6.7 6.4-11H15c.2-2.3 1.8-4.5 4.1-5.7A5.5 5.5 0 0 1 22.5 8z',
  ],
  r: ['M11 8.5h5v3.5h4.3V8.5h4.4V12H29V8.5h5v7.5l-3.2 3v13l3.2 3.5v2H11v-2l3.2-3.5V19L11 16z'],
  n: [
    'M23.5 7.5c8 .6 13.5 7.5 13.5 17.5v11.5H15.5c-.3-4.6 1.7-7.8 5.5-10.6 2.3-1.7 3-3.6 2.5-5.6-1.7 2.1-4.3 2.8-6.6 3.3l-2.7 2.9-3.6-.8c-1.4-1.1-1.7-3.1-.6-5l6.7-8.6c1.2-1.6 1.8-3.3 2.1-5l2.4 2.1z',
  ],
  b: [
    'M22.5 9.5c-5 3.4-8 8-8 12.3 0 3 1.6 5.1 4 6.1l-2.3 5.6h12.6l-2.3-5.6c2.4-1 4-3.1 4-6.1 0-4.3-3-8.9-8-12.3z',
    'M22.5 4.3a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
    'M14 33.5h17l1 3H13z',
  ],
  q: [
    'M8.5 13.5l6 9.2 2.4-11.6 3.6 11 2-12 2 12 3.6-11 2.4 11.6 6-9.2-4 17.5H12.5z',
    'M12 31h21l1 5.5H11z',
  ],
  k: [
    'M21 3.5h3v3h3v3h-3V14h-3V9.5h-3v-3h3z',
    'M22.5 14c-2.6 0-3.8 2.6-3.8 4.6-5.4-3.6-12.2-1.3-12.2 4.1 0 4 3.6 7 6 8.8h20c2.4-1.8 6-4.8 6-8.8 0-5.4-6.8-7.7-12.2-4.1 0-2-1.2-4.6-3.8-4.6z',
    'M12.5 31.5h20l.9 5h-21.8z',
  ],
};

// Thin details drawn in the outline color.
const DETAIL: Partial<Record<PieceSymbol, string>> = {
  b: 'M25 14.5l-4.5 6.5M18.5 27.9h8',
  n: 'M18.6 14.8h.01',
  k: 'M19 22.7c1.5 2.5 2.5 5 3.5 8.8 1-3.8 2-6.3 3.5-8.8',
};

export function Piece({ type, color }: { type: PieceSymbol; color: Color }) {
  const side = color === 'w' ? 'white' : 'black';
  return (
    <svg className={`piece-svg ${side}`} viewBox="0 0 45 45" aria-hidden>
      <g className="body">
        {BODY[type].map((d, i) => (
          <path key={i} d={d} />
        ))}
        <path d={BASE} />
      </g>
      {DETAIL[type] && <path className={type === 'n' ? 'eye' : 'detail'} d={DETAIL[type]} />}
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
