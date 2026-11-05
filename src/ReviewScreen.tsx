import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { Board, type Arrow, type LastMove } from './Board';
import { Engine, type Analysis } from './engine';
import { IconBack, IconSound } from './icons';
import { GRADE_LABEL, GRADE_MARK, chances, evalLabel, review, terminalAnalysis, type Grade, type Review } from './coach';
import type { SavedGame } from './games';
import { play } from './sound';

interface Props {
  game: SavedGame;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
}

/** Lichess-style move accuracy from the drop in winning chances (0..100 scale). */
function moveAccuracy(winBefore: number, winAfter: number) {
  const drop = Math.max(0, winBefore - winAfter);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

const GRAPH_W = 300;
const GRAPH_H = 84;

export function ReviewScreen({ game: saved, muted, onToggleMute, onExit }: Props) {
  // Replay the game once to get every position and move.
  const { fens, moves } = useMemo(() => {
    const g = new Chess();
    const fens = [g.fen()];
    const moves: Move[] = [];
    for (const san of saved.moves) {
      try {
        moves.push(g.move(san));
        fens.push(g.fen());
      } catch {
        break;
      }
    }
    return { fens, moves };
  }, [saved]);

  const [ply, setPly] = useState(fens.length - 1);
  const [analyses, setAnalyses] = useState<(Analysis | null)[]>(() => fens.map(() => null));
  const [orientation, setOrientation] = useState<Color>(saved.player);
  const [checking, setChecking] = useState(false);

  // Pass 1: a quick look at every position, filling in the graph as results arrive.
  // Pass 2: a much deeper look around any move that seemed like a mistake, since
  // a quick look can miss deep tactics and flag a strong move by accident.
  useEffect(() => {
    const engine = new Engine();
    let cancelled = false;
    const results: (Analysis | null)[] = fens.map(() => null);
    const store = (i: number, a: Analysis | null) => {
      results[i] = a;
      setAnalyses(results.slice());
    };
    (async () => {
      for (let i = 0; i < fens.length; i++) {
        const done = terminalAnalysis(new Chess(fens[i]));
        const a = done ?? (await engine.analyze(fens[i], 350, 14).catch(() => null));
        if (cancelled) return;
        store(i, a);
      }
      const suspects = new Set<number>();
      moves.forEach((m, i) => {
        const b = results[i];
        const a = results[i + 1];
        if (!b || !a) return;
        const r = review(fens[i], fens[i + 1], m.lan, m.san, b, a, m.color);
        if (r.grade === 'mistake' || r.grade === 'blunder') {
          suspects.add(i);
          suspects.add(i + 1);
        }
      });
      if (!suspects.size) return;
      setChecking(true);
      for (const i of [...suspects].sort((x, y) => x - y)) {
        if (terminalAnalysis(new Chess(fens[i]))) continue;
        const a = await engine.analyze(fens[i], 1600, 22).catch(() => null);
        if (cancelled) return;
        if (a) store(i, a);
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [fens]);

  /** White's winning chances (-1..1) at each position, once known. */
  const whiteChance = useMemo(
    () => analyses.map((a, i) => (a ? chances(a) * (new Chess(fens[i]).turn() === 'w' ? 1 : -1) : null)),
    [analyses, fens],
  );

  // Grade each move once the positions before and after it are analyzed.
  const reviews = useMemo(() => {
    return moves.map((m, i): Review | null => {
      const before = analyses[i];
      const after = analyses[i + 1];
      if (!before || !after) return null;
      return review(fens[i], fens[i + 1], m.lan, m.san, before, after, m.color);
    });
  }, [analyses, moves, fens]);

  const accuracy = (color: Color) => {
    const vals: number[] = [];
    moves.forEach((m, i) => {
      const b = whiteChance[i];
      const a = whiteChance[i + 1];
      if (m.color !== color || b === null || a === null) return;
      const sign = color === 'w' ? 1 : -1;
      vals.push(moveAccuracy(50 + 50 * b * sign, 50 + 50 * a * sign));
    });
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };

  const counts = (color: Color) => {
    const c: Partial<Record<Grade, number>> = {};
    reviews.forEach((r, i) => {
      if (r && moves[i].color === color) c[r.grade] = (c[r.grade] ?? 0) + 1;
    });
    return c;
  };

  const analyzedCount = analyses.filter(Boolean).length;
  const progress = Math.round((analyzedCount / fens.length) * 100);
  const opponentColor: Color = saved.player === 'w' ? 'b' : 'w';

  // Keyboard: arrows step through the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(fens.length - 1, p + 1));
      else if (e.key === 'Home') setPly(0);
      else if (e.key === 'End') setPly(fens.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fens.length]);

  // A soft click when stepping forward.
  const prevPly = useRef(ply);
  useEffect(() => {
    if (ply > prevPly.current && moves[ply - 1]) play(moves[ply - 1].captured ? 'capture' : 'move');
    prevPly.current = ply;
  }, [ply, moves]);

  const board = useMemo(() => new Chess(fens[ply]), [fens, ply]);
  const current = ply > 0 ? moves[ply - 1] : null;
  const currentReview = ply > 0 ? reviews[ply - 1] : null;
  const lastMove: LastMove | null = current
    ? {
        from: current.from,
        to: current.to,
        animate: true,
        id: ply,
        captured: current.captured
          ? {
              type: current.captured,
              color: current.color === 'w' ? 'b' : 'w',
              square: (current.flags.includes('e') ? `${current.to[0]}${current.from[1]}` : current.to) as Square,
            }
          : undefined,
      }
    : null;

  const arrows: Arrow[] = [];
  if (currentReview && currentReview.grade !== 'best' && currentReview.bestUci) {
    arrows.push({ from: currentReview.bestUci.slice(0, 2) as Square, to: currentReview.bestUci.slice(2, 4) as Square, kind: 'best' });
  }

  // Eval graph: White's share above the middle line.
  const n = fens.length - 1 || 1;
  const pts = whiteChance.map((c, i) => [(i / n) * GRAPH_W, ((1 - (c ?? 0)) / 2) * GRAPH_H] as const);
  const known = pts.filter((_, i) => whiteChance[i] !== null);
  const line = known.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = known.length ? `M0,${GRAPH_H} L${line.replace(/ /g, ' L')} L${known[known.length - 1][0].toFixed(1)},${GRAPH_H} Z` : '';

  const jumpFromGraph = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setPly(Math.round(x * (fens.length - 1)));
  };

  const evalNow = analyses[ply];
  const evalText = evalNow
    ? Object.is(evalNow.mate, -0)
      ? '#'
      : (() => {
          const sign = board.turn() === 'w' ? 1 : -1;
          return evalLabel(evalNow.cp === null ? null : evalNow.cp * sign, evalNow.mate === null ? null : evalNow.mate * sign);
        })()
    : '…';

  const summaryRow = (color: Color, name: string) => {
    const acc = accuracy(color);
    const c = counts(color);
    return (
      <div className="review-row">
        <span className="review-name">{name}</span>
        <span className="review-acc" title="Accuracy">
          {acc === null ? '…' : `${acc}%`}
        </span>
        <span className="review-marks">
          {(['inaccuracy', 'mistake', 'blunder'] as Grade[]).map((g) => (
            <span key={g} className={`mv ${g}`} title={GRADE_LABEL[g]}>
              {c[g] ?? 0}
              <sup>{GRADE_MARK[g]}</sup>
            </span>
          ))}
        </span>
      </div>
    );
  };

  const rows: { n: number; w: number; b: number | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ n: i / 2 + 1, w: i, b: i + 1 < moves.length ? i + 1 : null });

  const scoreRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    scoreRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const cell = (i: number | null) => {
    if (i === null) return <span />;
    const r = reviews[i];
    return (
      <button className={`mv ${r ? r.grade : ''} ${ply === i + 1 ? 'active' : ''}`} onClick={() => setPly(i + 1)}>
        {moves[i].san}
        {r && GRADE_MARK[r.grade] && <sup>{GRADE_MARK[r.grade]}</sup>}
      </button>
    );
  };

  const date = new Date(saved.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="game-screen trainer-screen review-screen">
      <header className="topbar">
        <button className="text-btn" onClick={onExit}>
          <IconBack /> Back
        </button>
        <span className="topbar-title">
          Review: you vs {saved.opponent}, {date}
        </span>
        <button className="icon-btn" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          <IconSound muted={muted} />
        </button>
      </header>
      <div className="game-body">
        <div className="board-col">
          <div className="board-wrap">
            <div className={`evalbar ${orientation === 'b' ? 'flipped' : ''}`} aria-label={`Evaluation ${evalText}`}>
              <div className="evalbar-white" style={{ height: `${((whiteChance[ply] ?? 0) + 1) * 50}%` }} />
              <span className={`evalbar-label ${(whiteChance[ply] ?? 0) >= 0 ? 'w' : 'b'}`}>{evalText}</span>
            </div>
            <Board
              game={board}
              version={ply}
              orientation={orientation}
              interactiveColor={null}
              lastMove={lastMove}
              onMove={() => {}}
              className="main-board"
              arrows={arrows}
            />
          </div>
        </div>
        <aside className="side">
          <p className="turn-status">{saved.result}</p>

          <section className="review-summary">
            {summaryRow(saved.player, 'You')}
            {summaryRow(opponentColor, saved.opponent)}
            {progress < 100 && <p className="trainer-note">Analyzing the game… {progress}%</p>}
            {progress === 100 && checking && <p className="trainer-note">Double-checking the big mistakes…</p>}
          </section>

          <svg
            className="eval-graph"
            viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
            preserveAspectRatio="none"
            onPointerDown={jumpFromGraph}
            role="img"
            aria-label="Who was winning over the game. Click to jump to a move."
          >
            <rect width={GRAPH_W} height={GRAPH_H} className="eg-bg" />
            {area && <path d={area} className="eg-white" />}
            <line x1="0" x2={GRAPH_W} y1={GRAPH_H / 2} y2={GRAPH_H / 2} className="eg-mid" />
            {reviews.map((r, i) =>
              r && (r.grade === 'mistake' || r.grade === 'blunder') && whiteChance[i + 1] !== null ? (
                <circle key={i} cx={pts[i + 1][0]} cy={pts[i + 1][1]} r="3.2" className={`eg-dot ${r.grade}`} />
              ) : null,
            )}
            <line x1={(ply / n) * GRAPH_W} x2={(ply / n) * GRAPH_W} y1="0" y2={GRAPH_H} className="eg-cursor" />
          </svg>

          <section className={`coach ${currentReview ? currentReview.grade : 'idle'}`} aria-live="polite">
            {current ? (
              <>
                <div className="coach-head">
                  <span className="grade-dot" aria-hidden />
                  <span className="grade-label">{currentReview ? GRADE_LABEL[currentReview.grade] : 'Analyzing…'}</span>
                  <span className="coach-move">
                    {Math.ceil(ply / 2)}
                    {current.color === 'w' ? '.' : '…'} {current.san}
                  </span>
                </div>
                <p className="coach-text">
                  {currentReview
                    ? `${current.color === saved.player ? '' : `${saved.opponent.replace(/ \(\d+\)$/, '')}: `}${currentReview.text}`
                    : 'The Pawn Master is still looking at this move.'}
                </p>
              </>
            ) : (
              <p className="coach-text">The starting position. Step forward with the arrow keys or the buttons below.</p>
            )}
          </section>

          <ol className="scoresheet" ref={scoreRef}>
            {rows.map((r) => (
              <li key={r.n}>
                <span className="n">{r.n}</span>
                {cell(r.w)}
                {cell(r.b)}
              </li>
            ))}
          </ol>

          <div className="tools review-nav">
            <button onClick={() => setPly(0)} disabled={ply === 0} aria-label="First move">
              ⏮
            </button>
            <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} aria-label="Previous move">
              ◀
            </button>
            <button onClick={() => setPly((p) => Math.min(fens.length - 1, p + 1))} disabled={ply === fens.length - 1} aria-label="Next move">
              ▶
            </button>
            <button onClick={() => setPly(fens.length - 1)} disabled={ply === fens.length - 1} aria-label="Last move">
              ⏭
            </button>
            <button onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} aria-label="Flip board">
              ⇅
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
