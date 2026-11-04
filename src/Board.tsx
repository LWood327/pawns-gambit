import { useMemo, useRef, useState } from 'react';
import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { Piece, PIECE_NAME } from './pieces';

const FILES = 'abcdefgh';

export interface LastMove {
  from: Square;
  to: Square;
  /** False for drag-and-drop moves, which are already where the user dropped them. */
  animate: boolean;
  id: number;
  /** The piece taken on this move, shown briefly fading out. */
  captured?: { type: PieceSymbol; color: Color; square: Square };
}

interface Props {
  game: Chess;
  /** Bumped by the parent whenever the position changes. */
  version: number;
  orientation: Color;
  /** Whether the user may move pieces of this color right now. */
  interactiveColor: Color | null;
  lastMove: LastMove | null;
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  className?: string;
  children?: React.ReactNode;
}

function toCoords(square: Square, orientation: Color) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return orientation === 'w'
    ? { col: file, row: 8 - rank }
    : { col: 7 - file, row: rank - 1 };
}

function toSquare(col: number, row: number, orientation: Color): Square {
  return (
    orientation === 'w'
      ? `${FILES[col]}${8 - row}`
      : `${FILES[7 - col]}${row + 1}`
  ) as Square;
}

export function Board({ game, version, orientation, interactiveColor, lastMove, onMove, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ square: Square; x: number; y: number } | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const board = useMemo(() => game.board(), [game, version]);

  const targets = useMemo(() => {
    if (!selected) return new Map<Square, boolean>();
    const moves = game.moves({ square: selected, verbose: true });
    return new Map(moves.map((m) => [m.to as Square, Boolean(m.captured)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, selected, version]);

  const checkSquare = useMemo(() => {
    if (!game.inCheck()) return null;
    const turn = game.turn();
    for (const row of board) for (const p of row) if (p && p.type === 'k' && p.color === turn) return p.square;
    return null;
  }, [board, game]);

  const squareFromEvent = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return toSquare(col, row, orientation);
  };

  const isOwnPiece = (sq: Square) => {
    const p = game.get(sq);
    return Boolean(p && interactiveColor && p.color === interactiveColor && game.turn() === interactiveColor);
  };

  const tryMove = (from: Square, to: Square) => {
    if (!targets.has(to)) return false;
    const piece = game.get(from);
    const lastRank = to[1] === '8' || to[1] === '1';
    if (piece?.type === 'p' && lastRank) {
      setPromo({ from, to });
    } else {
      onMove(from, to);
    }
    setSelected(null);
    return true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (promo || e.button !== 0) return;
    const sq = squareFromEvent(e);
    if (!sq) return;
    if (selected && sq !== selected && tryMove(selected, sq)) return;
    if (isOwnPiece(sq)) {
      setSelected(sq);
      const rect = ref.current!.getBoundingClientRect();
      setDrag({ square: sq, x: e.clientX - rect.left, y: e.clientY - rect.top });
      ref.current!.setPointerCapture(e.pointerId);
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = ref.current!.getBoundingClientRect();
    setDrag({ ...drag, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const sq = squareFromEvent(e);
    setDrag(null);
    if (sq && sq !== drag.square) tryMove(drag.square, sq);
  };

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = toSquare(col, row, orientation);
      const light = (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 1;
      const cls = ['sq', light ? 'light' : 'dark'];
      if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls.push('last');
      if (sq === selected) cls.push('selected');
      if (sq === checkSquare) cls.push('check');
      const target = targets.get(sq);
      squares.push(
        <div key={sq} className={cls.join(' ')}>
          {col === 0 && <span className="coord rank">{sq[1]}</span>}
          {row === 7 && <span className="coord file">{sq[0]}</span>}
          {target !== undefined && <span className={target ? 'hint capture' : 'hint'} />}
        </div>,
      );
    }
  }

  const pieces = [];
  for (const rowArr of board) {
    for (const p of rowArr) {
      if (!p) continue;
      const { col, row } = toCoords(p.square, orientation);
      const dragging = drag?.square === p.square;
      let style: React.CSSProperties & Record<`--${string}`, string> = {
        left: `${col * 12.5}%`,
        top: `${row * 12.5}%`,
      };
      let key: string = p.square;
      let cls = `piece ${p.color === 'w' ? 'white' : 'black'}`;
      if (lastMove?.animate && lastMove.to === p.square) {
        const from = toCoords(lastMove.from, orientation);
        style = { ...style, '--dx': `${(from.col - col) * 100}%`, '--dy': `${(from.row - row) * 100}%` };
        key = `${p.square}-${lastMove.id}`;
        cls += ' arrive';
      }
      if (dragging) cls += ' lifted';
      pieces.push(
        <div key={key} className={cls} style={style}>
          <Piece type={p.type} color={p.color} />
        </div>,
      );
    }
  }

  if (lastMove?.captured) {
    const c = lastMove.captured;
    const { col, row } = toCoords(c.square, orientation);
    pieces.unshift(
      <div
        key={`ghost-${lastMove.id}`}
        className={`piece ghost ${lastMove.animate ? 'delayed' : ''}`}
        style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%` }}
      >
        <Piece type={c.type} color={c.color} />
      </div>,
    );
  }

  const dragPiece = drag ? game.get(drag.square) : null;
  const promoColor = promo ? game.get(promo.from)?.color : null;

  return (
    <div
      ref={ref}
      className={`board ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="squares">{squares}</div>
      <div className="pieces">{pieces}</div>
      {drag && dragPiece && (
        <div
          className={`piece floating ${dragPiece.color === 'w' ? 'white' : 'black'}`}
          style={{ left: drag.x, top: drag.y }}
        >
          <Piece type={dragPiece.type} color={dragPiece.color} />
        </div>
      )}
      {promo && promoColor && (
        <div className="promo" onPointerDown={(e) => e.stopPropagation()}>
          <p>Promote to</p>
          <div className="promo-choices">
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((t) => (
              <button
                key={t}
                className="piece-btn"
                onClick={() => {
                  onMove(promo.from, promo.to, t);
                  setPromo(null);
                }}
                aria-label={PIECE_NAME[t]}
              >
                <Piece type={t} color={promoColor} />
              </button>
            ))}
          </div>
          <button className="link" onClick={() => setPromo(null)}>
            Cancel
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
