import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { Board, type Arrow, type LastMove } from './Board';
import { Engine, type Analysis } from './engine';
import { IconBack, IconSound } from './icons';
import { chances, review } from './coach';
import { play } from './sound';
import { dailyStatus, recordDaily, todaysPuzzle } from './daily';
import {
  OPENINGS,
  STARTER,
  duePuzzles,
  recordAttempt,
  saveOpeningStars,
  type Puzzle,
} from './trainer';

export type TrainerMode = { kind: 'mistakes' } | { kind: 'starter' } | { kind: 'daily' } | { kind: 'opening'; id: string };

interface Props {
  mode: TrainerMode;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
}

const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black');

function toArrow(uci: string, kind: Arrow['kind']): Arrow {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, kind };
}

function moveSound(game: Chess, captured?: boolean) {
  if (game.isCheckmate()) play('end');
  else if (game.inCheck()) play('check');
  else if (captured) play('capture');
  else play('move');
}

function Shell({
  title,
  backLabel = 'Trainer',
  muted,
  onToggleMute,
  onExit,
  board,
  side,
}: {
  title: string;
  backLabel?: string;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  board: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <div className="game-screen trainer-screen">
      <header className="topbar">
        <button className="text-btn" onClick={onExit}>
          <IconBack /> {backLabel}
        </button>
        <span className="topbar-title">{title}</span>
        <button className="icon-btn" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          <IconSound muted={muted} />
        </button>
      </header>
      <div className="game-body">
        <div className="board-col">{board}</div>
        <aside className="side">{side}</aside>
      </div>
    </div>
  );
}

/* ======================= Puzzles ======================= */

function PuzzleSession({ source, ...shell }: { source: 'mistakes' | 'starter' | 'daily' } & Omit<Props, 'mode'>) {
  const queue = useMemo<Puzzle[]>(
    () => (source === 'starter' ? STARTER : source === 'daily' ? [todaysPuzzle().puzzle] : duePuzzles()),
    [source],
  );
  const sourceTitle = source === 'starter' ? 'Starter puzzles' : source === 'daily' ? `Daily puzzle #${todaysPuzzle().number}` : 'Your mistakes';
  const engineRef = useRef<Engine | null>(null);
  const [index, setIndex] = useState(0);
  const [game, setGame] = useState(() => new Chess(queue[0]?.fen));
  const [version, setVersion] = useState(0);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [phase, setPhase] = useState<'solve' | 'checking' | 'reply' | 'wrong' | 'solved'>('solve');
  const [message, setMessage] = useState('');
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [hint, setHint] = useState(false);
  const [missed, setMissed] = useState(false);
  const [score, setScore] = useState({ firstTry: 0, done: 0 });
  const moveId = useRef(0);
  const beforeRef = useRef<Promise<Analysis> | null>(null);

  const puzzle = queue[index];
  const player: Color | null = puzzle ? (new Chess(puzzle.fen).turn() as Color) : null;

  useEffect(() => {
    engineRef.current = new Engine();
    return () => engineRef.current?.destroy();
  }, []);

  // Load each puzzle; start analyzing it in the background for "also good" checks.
  useEffect(() => {
    if (!puzzle) return;
    setGame(new Chess(puzzle.fen));
    setVersion((v) => v + 1);
    setLastMove(null);
    setPhase('solve');
    setMessage('');
    setArrows([]);
    setHint(false);
    setMissed(false);
    beforeRef.current = source !== 'starter' ? engineRef.current?.analyze(puzzle.fen, 900) ?? null : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = (correct: boolean) => {
    if (source === 'mistakes' && !missed) recordAttempt(puzzle.id, correct);
    setScore((s) => ({ firstTry: s.firstTry + (correct && !missed ? 1 : 0), done: s.done + 1 }));
  };

  const fail = (text: string) => {
    if (source === 'mistakes' && !missed) recordAttempt(puzzle.id, false);
    setMissed(true);
    setPhase('checking'); // board locked until the piece goes back
    setMessage(text);
    // Put the piece back after a beat so you can see what you tried.
    setTimeout(() => {
      game.undo();
      const h = game.history({ verbose: true });
      const prev = h[h.length - 1];
      setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: ++moveId.current } : null);
      setVersion((v) => v + 1);
      setPhase('wrong');
    }, 700);
  };

  const succeed = (text: string) => {
    setPhase('solved');
    let extra = '';
    if (source === 'daily') {
      const before = dailyStatus();
      const after = recordDaily(!missed);
      if (!before.solvedToday) {
        extra = after.streak > 1 ? ` That’s a ${after.streak}-day streak.` : ' Your streak starts today.';
      }
    }
    setMessage(text + extra);
    setArrows([]);
    finish(true);
  };

  const daily = source === 'daily' ? dailyStatus() : null;
  const dailyNote = daily?.solvedToday
    ? `Solved today${daily.firstTryToday ? ' on the first try' : ''}. A new puzzle arrives tomorrow.`
    : daily && daily.streak > 0
      ? `Solve it to keep your ${daily.streak}-day streak going.`
      : 'A new puzzle every day, the same one for everyone. Solve it to start a streak.';

  const onMove = (from: Square, to: Square, promotion?: PieceSymbol) => {
    if (!puzzle || (phase !== 'solve' && phase !== 'wrong')) return;
    if (phase === 'wrong') setPhase('solve');
    const fenBefore = game.fen();
    let move;
    try {
      move = game.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = move.lan;
    setLastMove({ from, to, animate: false, id: ++moveId.current });
    setVersion((v) => v + 1);
    moveSound(game, Boolean(move.captured));
    setArrows([]);

    if (puzzle.mateIn) {
      if (game.isCheckmate()) return succeed(`Checkmate. ${move.san} is the finish.`);
      const firstMove = game.history().length === 1;
      if (puzzle.mateIn === 2 && firstMove && uci.startsWith(puzzle.best)) {
        // Right first move: let the opponent reply, then you finish.
        setPhase('reply');
        setMessage('Good start. Now finish it.');
        const fen = game.fen();
        engineRef.current?.analyze(fen, 400).then((a) => {
          setTimeout(() => {
            const r = game.move({ from: a.best.slice(0, 2), to: a.best.slice(2, 4), promotion: a.best[4] });
            setLastMove({ from: r.from, to: r.to, animate: true, id: ++moveId.current });
            setVersion((v) => v + 1);
            moveSound(game, Boolean(r.captured));
            setPhase('solve');
          }, 450);
        });
        return;
      }
      return fail(
        game.history().length === 1
          ? `${move.san} doesn’t force mate. ${puzzle.hint ?? 'Look for checks first.'}`
          : `${move.san} isn’t mate yet. Look again.`,
      );
    }

    // Your-mistakes puzzle: the engine's move, or anything nearly as good, counts.
    if (uci.startsWith(puzzle.best)) return succeed(`Correct. ${puzzle.bestSan} was the move.`);
    setPhase('checking');
    setMessage('Checking your move…');
    const fenAfter = game.fen();
    Promise.all([beforeRef.current ?? engineRef.current!.analyze(fenBefore, 900), engineRef.current!.analyze(fenAfter, 700)]).then(
      ([before, after]) => {
        const drop = chances(before) + chances(after);
        if (drop < 0.07) return succeed(`That works too. The Pawn Master’s first choice was ${puzzle.bestSan}, but yours is just as good.`);
        const r = review(fenBefore, fenAfter, uci, move.san, before, after, player!);
        fail(`Not this one. ${r.text.replace(/ ?(A better move was|Try|Stockfish slightly preferred) [^.]+\.?$/, '')}`.trim());
      },
    );
  };

  const showSolution = () => {
    if (!puzzle) return;
    if (!missed) {
      if (source === 'mistakes') recordAttempt(puzzle.id, false);
      setMissed(true);
    }
    setArrows([toArrow(puzzle.best, 'best')]);
    setPhase('wrong');
    setMessage(`The move is ${puzzle.bestSan}. Play it to continue.`);
  };

  const next = () => setIndex((i) => i + 1);

  if (!puzzle) {
    return (
      <Shell
        {...shell}
        title={sourceTitle}
        backLabel={source === 'daily' ? 'Menu' : 'Trainer'}
        board={
          <Board game={new Chess()} version={0} orientation="w" interactiveColor={null} lastMove={null} onMove={() => {}} className="main-board">
            <div className="result">
              <h2>{score.done ? 'All done' : 'Nothing due'}</h2>
              <p>
                {score.done
                  ? `You solved ${score.firstTry} of ${score.done} on the first try.`
                  : 'Play coached games against the Pawn Master. Every mistake you make is saved here as a puzzle.'}
              </p>
              <div className="result-actions">
                <button className="primary" onClick={shell.onExit}>
                  Back to Trainer
                </button>
              </div>
            </div>
          </Board>
        }
        side={<p className="turn-status">{score.done ? 'Session complete' : 'No puzzles due right now'}</p>}
      />
    );
  }

  const solved = phase === 'solved';
  return (
    <Shell
      {...shell}
      backLabel={source === 'daily' ? 'Menu' : 'Trainer'}
      title={source === 'daily' ? sourceTitle : `${sourceTitle}, ${index + 1} of ${queue.length}`}
      board={
        <Board
          game={game}
          version={version}
          orientation={player ?? 'w'}
          interactiveColor={(phase === 'solve' || phase === 'wrong') && player ? player : null}
          lastMove={lastMove}
          onMove={onMove}
          className="main-board"
          arrows={arrows}
        />
      }
      side={
        <>
          <p className="turn-status">
            {puzzle.mateIn
              ? `${sideName(player!)} to move. Checkmate in ${puzzle.mateIn}.`
              : `${sideName(player!)} to move. Find the best move.`}
          </p>
          <section className={`coach ${solved ? 'best' : missed ? 'mistake' : 'idle'}`} aria-live="polite">
            <div className="coach-head">
              <span className="grade-dot" aria-hidden />
              <span className="grade-label">{solved ? 'Solved' : puzzle.title ?? 'Your mistake'}</span>
            </div>
            <p className="coach-text">
              {message ||
                (puzzle.played
                  ? `In a game you played ${puzzle.played}, which was a ${puzzle.grade}. What should you have played?`
                  : 'Take your time. Checks, captures and threats first.')}
            </p>
            {hint && !solved && puzzle.hint && <p className="coach-text hint-line">{puzzle.hint}</p>}
            <div className="coach-actions">
              {solved ? (
                <button className="primary small" onClick={next}>
                  {index + 1 < queue.length ? 'Next puzzle' : 'Finish'}
                </button>
              ) : (
                <>
                  {puzzle.hint && !hint && (
                    <button className="secondary small" onClick={() => setHint(true)}>
                      Hint
                    </button>
                  )}
                  <button className="text-btn" onClick={showSolution}>
                    Show solution
                  </button>
                </>
              )}
            </div>
          </section>
          <div className="trainer-progress" aria-label="Progress">
            {queue.map((_, i) => (
              <span key={i} className={i < index ? 'done' : i === index ? 'current' : ''} />
            ))}
          </div>
          <p className="trainer-note">
            {source === 'daily'
              ? dailyNote
              : source === 'mistakes'
              ? 'Solve it on the first try and it comes back less often. Miss it and you’ll see it again soon.'
              : 'Classic checkmate patterns that come up in real games.'}
          </p>
        </>
      }
    />
  );
}

/* ======================= Opening practice ======================= */

function OpeningDrill({ id, ...shell }: { id: string } & Omit<Props, 'mode'>) {
  const opening = OPENINGS.find((o) => o.id === id)!;
  const [game, setGame] = useState(() => new Chess());
  const [version, setVersion] = useState(0);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [slips, setSlips] = useState(0);
  const [stepSlips, setStepSlips] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(0);
  const moveId = useRef(0);
  /** True while a wrong move is on the board waiting to slide back. */
  const undoPending = useRef(false);

  const ply = game.history().length;
  const done = ply >= opening.line.length;
  const yourTurn = !done && game.turn() === opening.side;

  // Play the other side's book moves automatically.
  useEffect(() => {
    if (done || game.turn() === opening.side || undoPending.current) return;
    setBusy(true);
    const t = setTimeout(() => {
      const m = game.move(opening.line[ply]);
      setLastMove({ from: m.from, to: m.to, animate: true, id: ++moveId.current });
      setVersion((v) => v + 1);
      moveSound(game, Boolean(m.captured));
      setBusy(false);
    }, 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, run]);

  useEffect(() => {
    if (!done) return;
    const stars = slips === 0 ? 3 : slips === 1 ? 2 : 1;
    saveOpeningStars(opening.id, stars);
    play('end');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const expected = opening.line[ply];
  const expectedMove = useMemo(() => {
    if (!expected) return null;
    try {
      return new Chess(game.fen()).move(expected);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, expected]);

  const onMove = (from: Square, to: Square, promotion?: PieceSymbol) => {
    if (!yourTurn || busy) return;
    let move;
    try {
      move = game.move({ from, to, promotion });
    } catch {
      return;
    }
    const right = move.san === expected;
    undoPending.current = !right;
    setLastMove({ from, to, animate: false, id: ++moveId.current });
    setVersion((v) => v + 1);
    if (right) {
      moveSound(game, Boolean(move.captured));
      setStepSlips(0);
      setMessage('');
      return;
    }
    // Not the book move: slide it back and nudge.
    setSlips((s) => s + 1);
    setStepSlips((s) => s + 1);
    setMessage(
      stepSlips >= 1
        ? `The ${opening.name} move here is ${expected}. The arrow shows it.`
        : `${move.san} is playable, but it isn’t the ${opening.name} move. Try again.`,
    );
    setBusy(true);
    setTimeout(() => {
      game.undo();
      undoPending.current = false;
      const h = game.history({ verbose: true });
      const prev = h[h.length - 1];
      setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: ++moveId.current } : null);
      setVersion((v) => v + 1);
      setBusy(false);
    }, 650);
  };

  const restart = () => {
    undoPending.current = false;
    setGame(new Chess());
    setLastMove(null);
    setSlips(0);
    setStepSlips(0);
    setMessage('');
    setRun((r) => r + 1);
    setVersion((v) => v + 1);
  };

  const arrows: Arrow[] = yourTurn && stepSlips >= 2 && expectedMove ? [{ from: expectedMove.from, to: expectedMove.to, kind: 'best' }] : [];
  const stars = slips === 0 ? 3 : slips === 1 ? 2 : 1;
  const history = game.history();

  return (
    <Shell
      {...shell}
      title={`Opening practice, ${opening.name}`}
      board={
        <Board
          game={game}
          version={version}
          orientation={opening.side}
          interactiveColor={yourTurn && !busy ? opening.side : null}
          lastMove={lastMove}
          onMove={onMove}
          className="main-board"
          arrows={arrows}
        >
          {done && (
            <div className="result won">
              <h2>{'★'.repeat(stars) + '☆'.repeat(3 - stars)}</h2>
              <p>
                {slips === 0
                  ? `You played the ${opening.name} perfectly from memory.`
                  : `You finished the ${opening.name} with ${slips} ${slips === 1 ? 'slip' : 'slips'}. Go again for three stars.`}
              </p>
              <div className="result-actions">
                <button className="primary" onClick={restart}>
                  Practice again
                </button>
                <button className="secondary" onClick={shell.onExit}>
                  Back
                </button>
              </div>
            </div>
          )}
        </Board>
      }
      side={
        <>
          <p className="turn-status">
            {done ? 'Line complete' : yourTurn ? `Your move as ${sideName(opening.side)}` : 'Opponent is playing the book move'}
          </p>
          <section className={`coach ${message ? 'inaccuracy' : 'idle'}`} aria-live="polite">
            <div className="coach-head">
              <span className="grade-dot" aria-hidden />
              <span className="grade-label">{opening.name}</span>
            </div>
            <p className="coach-text">{message || opening.idea}</p>
          </section>
          <div className="trainer-progress" aria-label="Progress">
            {opening.line.map((_, i) => (
              <span key={i} className={i < ply ? 'done' : i === ply ? 'current' : ''} />
            ))}
          </div>
          <ol className="scoresheet">
            {Array.from({ length: Math.ceil(opening.line.length / 2) }, (_, r) => (
              <li key={r}>
                <span className="n">{r + 1}</span>
                <span>{history[r * 2] ?? (r * 2 === ply ? '…' : '')}</span>
                <span>{history[r * 2 + 1] ?? (r * 2 + 1 === ply ? '…' : '')}</span>
              </li>
            ))}
          </ol>
        </>
      }
    />
  );
}

export function TrainerScreen({ mode, ...rest }: Props) {
  if (mode.kind === 'opening') return <OpeningDrill id={mode.id} {...rest} />;
  return <PuzzleSession source={mode.kind} {...rest} />;
}
