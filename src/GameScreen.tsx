import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { Board, type Arrow, type LastMove } from './Board';
import { Engine, type Analysis } from './engine';
import { Piece } from './pieces';
import { IconBack, IconEye, IconFlag, IconFlip, IconSound, IconUndo } from './icons';
import {
  GRADE_LABEL,
  GRADE_MARK,
  chances,
  evalLabel,
  hangingPieces,
  describeSquares,
  review,
  terminalAnalysis,
  type Grade,
  type Review,
} from './coach';
import { levelName, timeControl, type BotGameSettings } from './settings';
import { play } from './sound';
import { addMistake } from './trainer';

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const LOW_TIME = 10_000;

function pickSide(choice: BotGameSettings['side']): Color {
  if (choice === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return choice;
}

/** Pieces each side has captured, plus the material lead. */
export function captured(game: Chess) {
  const left: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const row of game.board()) for (const p of row) if (p) left[p.color][p.type]++;
  const takenBy = (taker: Color) => {
    const victim: Color = taker === 'w' ? 'b' : 'w';
    const list: PieceSymbol[] = [];
    for (const t of ['q', 'r', 'b', 'n', 'p'] as PieceSymbol[]) {
      const n = Math.max(0, START_COUNT[t] - left[victim][t]);
      for (let i = 0; i < n; i++) list.push(t);
    }
    return list;
  };
  const material = (c: Color) =>
    (Object.keys(left[c]) as PieceSymbol[]).reduce((s, t) => s + left[c][t] * PIECE_VALUE[t], 0);
  return { w: takenBy('w'), b: takenBy('b'), lead: material('w') - material('b') };
}

type Ending = { kind: 'resign' } | { kind: 'flag'; color: Color } | null;

function resultText(game: Chess, player: Color, ending: Ending) {
  const moves = Math.ceil(game.history().length / 2);
  if (ending?.kind === 'resign') return { title: 'Resigned', detail: 'The Pawn Master takes this one.', won: false };
  if (ending?.kind === 'flag') {
    return ending.color === player
      ? { title: 'Out of time', detail: 'Your clock ran out, so the Pawn Master wins.', won: false }
      : { title: 'Out of time', detail: "The Pawn Master's clock ran out. You win.", won: true };
  }
  if (game.isCheckmate()) {
    const won = game.turn() !== player;
    return { title: 'Checkmate', detail: won ? `You won in ${moves} moves.` : `The Pawn Master won in ${moves} moves.`, won };
  }
  if (game.isStalemate()) return { title: 'Stalemate', detail: 'No legal moves and no check, so it’s a draw.', won: false };
  if (game.isThreefoldRepetition()) return { title: 'Draw', detail: 'The same position came up three times.', won: false };
  if (game.isInsufficientMaterial()) return { title: 'Draw', detail: 'Neither side can checkmate with what’s left.', won: false };
  if (game.isDraw()) return { title: 'Draw', detail: '50 moves with no capture or pawn move.', won: false };
  return null;
}

export function formatClock(ms: number) {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) return (Math.floor(clamped / 100) / 10).toFixed(1);
  const total = Math.ceil(clamped / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  settings: BotGameSettings;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
}

export function GameScreen({ settings, muted, onToggleMute, onExit }: Props) {
  const tc = timeControl(settings.timeId);
  const timed = tc.base > 0;

  const gameRef = useRef(new Chess());
  const engineRef = useRef<Engine | null>(null);
  const gameIdRef = useRef(0);
  const moveIdRef = useRef(0);
  // Clock: banked time per side, and when the current turn started (null before the first move).
  const clockRef = useRef({ w: tc.base, b: tc.base, turnStart: null as number | null });
  const lowWarnedRef = useRef({ w: false, b: false });

  const [version, setVersion] = useState(0);
  const [player, setPlayer] = useState<Color>(() => pickSide(settings.side));
  const [orientation, setOrientation] = useState<Color>(player);
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [ending, setEnding] = useState<Ending>(null);
  const [engineError, setEngineError] = useState(false);
  const [now, setNow] = useState(() => performance.now());

  // Coach
  const coachOn = settings.coach;
  const secondChances = coachOn && settings.secondChances && !timed;
  const analystRef = useRef<Engine | null>(null);
  const analysisCache = useRef(new Map<string, Promise<Analysis>>());
  const [reviews, setReviews] = useState<Record<number, Review>>({});
  const [latestPly, setLatestPly] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  /** 'prompt' holds the bot back while you decide whether to retry a bad move. */
  const [gate, setGate] = useState<'none' | 'waiting' | 'prompt'>('none');
  const [showBest, setShowBest] = useState(false);
  const [threats, setThreats] = useState(false);
  /** Engine view from White's side: chance in -1..1 and a short label. */
  const [evalWhite, setEvalWhite] = useState<{ chance: number; label: string } | null>(null);
  const [retries, setRetries] = useState(0);

  const game = gameRef.current;
  const bump = () => setVersion((v) => v + 1);
  const botColor: Color = player === 'w' ? 'b' : 'w';
  const over = ending !== null || game.isGameOver();

  useEffect(() => {
    try {
      engineRef.current = new Engine(() => setEngineError(true));
      if (coachOn) analystRef.current = new Engine();
    } catch {
      setEngineError(true);
    }
    return () => {
      engineRef.current?.destroy();
      analystRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyzeFen = useCallback((fen: string): Promise<Analysis> => {
    const done = terminalAnalysis(new Chess(fen));
    if (done) return Promise.resolve(done);
    let p = analysisCache.current.get(fen);
    if (!p) {
      p = analystRef.current ? analystRef.current.analyze(fen) : Promise.reject(new Error('no analyst'));
      analysisCache.current.set(fen, p);
    }
    return p;
  }, []);

  // Keep the eval bar current.
  useEffect(() => {
    if (!coachOn) return;
    const fen = game.fen();
    const turn = game.turn();
    analyzeFen(fen)
      .then((a) => {
        if (game.fen() !== fen) return;
        const sign = turn === 'w' ? 1 : -1;
        const mated = a.mate !== null && Object.is(a.mate, -0);
        setEvalWhite({
          chance: chances(a) * sign,
          label: mated ? '#' : evalLabel(a.cp === null ? null : a.cp * sign, a.mate === null ? null : a.mate * sign),
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  /** Bookkeeping after any move: clock, sound, highlight. */
  const afterMove = useCallback(
    (move: Move, animate: boolean) => {
      if (timed) {
        const c = clockRef.current;
        const t = performance.now();
        if (c.turnStart !== null) c[move.color] -= t - c.turnStart;
        c[move.color] += tc.increment;
        c.turnStart = game.isGameOver() ? null : t;
      }
      setLastMove({
        from: move.from,
        to: move.to,
        animate,
        id: ++moveIdRef.current,
        captured: move.captured
          ? {
              type: move.captured,
              color: move.color === 'w' ? 'b' : 'w',
              // en passant takes a pawn that isn't on the destination square
              square: (move.flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to) as Square,
            }
          : undefined,
      });
      if (game.isGameOver()) play('end');
      else if (game.inCheck()) play('check');
      else if (move.captured) play('capture');
      else play('move');
      bump();
    },
    [game, timed, tc.increment],
  );

  // Bot's turn.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || over || game.turn() !== botColor || gate !== 'none') return;
    const id = gameIdRef.current;
    setThinking(true);
    const started = performance.now();
    const botLeft = timed ? clockRef.current[botColor] : Infinity;
    const budget = Math.max(80, Math.min(800, botLeft / 40));
    engine
      .bestMove(game.fen(), { elo: settings.elo }, budget)
      .then(async (uci) => {
        // Short pause so instant replies don't feel jarring; skipped when short on time.
        const pause = timed && botLeft < 30_000 ? 0 : 350;
        const wait = pause - (performance.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (id !== gameIdRef.current) return;
        const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        afterMove(move, true);
      })
      .catch(() => setEngineError(true))
      .finally(() => {
        if (id === gameIdRef.current) setThinking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, player, over, gate]);

  // Clock tick.
  const clockRunning = timed && !over && clockRef.current.turnStart !== null;
  useEffect(() => {
    if (!clockRunning) return;
    const iv = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(iv);
  }, [clockRunning]);

  const remaining = (color: Color) => {
    const c = clockRef.current;
    if (!timed) return 0;
    const running = !over && c.turnStart !== null && game.turn() === color;
    return c[color] - (running ? now - c.turnStart! : 0);
  };

  // Flag fall and low-time warning.
  useEffect(() => {
    if (!clockRunning) return;
    const turn = game.turn();
    const left = remaining(turn);
    if (left <= 0) {
      gameIdRef.current++;
      engineRef.current?.stop();
      clockRef.current[turn] = 0;
      clockRef.current.turnStart = null;
      setThinking(false);
      setEnding({ kind: 'flag', color: turn });
      play('end');
    } else if (turn === player && left < LOW_TIME && !lowWarnedRef.current[turn] && tc.base > LOW_TIME * 3) {
      lowWarnedRef.current[turn] = true;
      play('low-time');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);


  /** Grade the move you just played. With second chances on, the bot waits for the verdict. */
  const coachMove = (fenBefore: string, move: Move) => {
    const ply = game.history().length - 1;
    const fenAfter = game.fen();
    const id = gameIdRef.current;
    if (secondChances && !game.isGameOver()) setGate('waiting');
    setReviewing(true);
    setShowBest(false);
    Promise.all([analyzeFen(fenBefore), analyzeFen(fenAfter)])
      .then(([before, after]) => {
        // Ignore results for a move that has since been taken back.
        if (id !== gameIdRef.current || game.history()[ply] !== move.san) return;
        const r = review(fenBefore, fenAfter, move.lan, move.san, before, after, player);
        setReviews((prev) => ({ ...prev, [ply]: r }));
        // Bad moves come back later as Trainer puzzles.
        if ((r.grade === 'mistake' || r.grade === 'blunder') && r.bestUci) {
          addMistake({ fen: fenBefore, best: r.bestUci, bestSan: r.bestSan, played: move.san, grade: r.grade });
        }
        setLatestPly(ply);
        const bad = r.grade === 'mistake' || r.grade === 'blunder';
        setGate(secondChances && bad && !game.isGameOver() && game.history().length === ply + 1 ? 'prompt' : 'none');
      })
      .catch(() => setGate('none'))
      .finally(() => {
        if (id === gameIdRef.current) setReviewing(false);
      });
  };

  const onMove = (from: Square, to: Square, promotion?: PieceSymbol) => {
    const fenBefore = game.fen();
    let move: Move;
    try {
      move = game.move({ from, to, promotion });
    } catch {
      return;
    }
    if (coachOn) coachMove(fenBefore, move);
    afterMove(move, false);
  };

  /** Drop reviews for moves that no longer exist after a take-back. */
  const pruneReviews = (len: number) => {
    setReviews((prev) => {
      const next: Record<number, Review> = {};
      let last: number | null = null;
      for (const [k, v] of Object.entries(prev)) {
        if (Number(k) < len) {
          next[Number(k)] = v;
          last = Math.max(last ?? -1, Number(k));
        }
      }
      setLatestPly(last);
      return next;
    });
  };

  const tryAgain = () => {
    game.undo();
    pruneReviews(game.history().length);
    const hist = game.history({ verbose: true });
    const prev = hist[hist.length - 1];
    setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: ++moveIdRef.current } : null);
    setRetries((r) => r + 1);
    setShowBest(false);
    setGate('none');
    bump();
  };

  const rematch = () => {
    gameIdRef.current++;
    engineRef.current?.stop();
    engineRef.current?.newGame();
    game.reset();
    clockRef.current = { w: tc.base, b: tc.base, turnStart: null };
    lowWarnedRef.current = { w: false, b: false };
    const side = pickSide(settings.side);
    setPlayer(side);
    setOrientation(side);
    setLastMove(null);
    setEnding(null);
    setThinking(false);
    setReviews({});
    setLatestPly(null);
    setGate('none');
    setReviewing(false);
    setShowBest(false);
    setEvalWhite(null);
    setRetries(0);
    bump();
  };

  const takeBack = () => {
    gameIdRef.current++; // drop any review still running
    game.undo();
    if (game.turn() !== player) game.undo();
    pruneReviews(game.history().length);
    const hist = game.history({ verbose: true });
    const prev = hist[hist.length - 1];
    setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: ++moveIdRef.current } : null);
    setGate('none');
    setReviewing(false);
    setShowBest(false);
    bump();
  };

  const resign = () => {
    // Stop the clock where it is.
    const c = clockRef.current;
    if (timed && c.turnStart !== null) {
      c[game.turn()] -= performance.now() - c.turnStart;
      c.turnStart = null;
    }
    gameIdRef.current++;
    engineRef.current?.stop();
    setThinking(false);
    setEnding({ kind: 'resign' });
    play('end');
  };

  const history = useMemo(() => game.history(), [game, version]);
  const rows = useMemo(() => {
    const r: { n: number; w: string; b?: string }[] = [];
    for (let i = 0; i < history.length; i += 2) r.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    return r;
  }, [history]);

  const scoreRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    scoreRef.current?.scrollTo({ top: scoreRef.current.scrollHeight, behavior: 'smooth' });
  }, [rows.length]);

  const caps = useMemo(() => captured(game), [game, version]);
  const result = over ? resultText(game, player, ending) : null;
  const playerHasMoved = history.length > (player === 'w' ? 0 : 1);
  const canTakeBack = !timed && !thinking && ending === null && playerHasMoved && gate !== 'waiting';

  // Coach visuals
  const latest = latestPly !== null ? reviews[latestPly] : null;
  const arrows: Arrow[] = [];
  if (latest && showBest && latest.bestUci) {
    arrows.push({ from: latest.bestUci.slice(0, 2) as Square, to: latest.bestUci.slice(2, 4) as Square, kind: 'best' });
  }
  if (latest?.threatUci && gate === 'prompt') {
    arrows.push({ from: latest.threatUci.slice(0, 2) as Square, to: latest.threatUci.slice(2, 4) as Square, kind: 'threat' });
  }
  const danger = threats && !over ? hangingPieces(game, player) : [];
  // Enemy pieces you could win, only useful when it's your move.
  const opportunity = threats && !over && game.turn() === player ? hangingPieces(game, botColor) : [];
  let threatNote = '';
  if (threats && !over) {
    threatNote = danger.length
      ? `In danger: your ${describeSquares(game, danger)}.`
      : 'None of your pieces are in danger right now.';
    if (opportunity.length) threatNote += ` You can win the ${describeSquares(game, opportunity)}.`;
  }
  const gradeCounts = Object.values(reviews).reduce(
    (acc, r) => ({ ...acc, [r.grade]: (acc[r.grade] ?? 0) + 1 }),
    {} as Partial<Record<Grade, number>>,
  );

  let status: string;
  if (engineError) status = 'The Pawn Master could not start. Restart the app to try again.';
  else if (result) status = result.detail;
  else if (gate === 'prompt') status = 'The Pawn Master is waiting for you';
  else if (thinking) status = 'The Pawn Master is thinking';
  else if (game.inCheck()) status = 'You’re in check';
  else if (timed && clockRef.current.turnStart === null && player === 'w') status = 'Your move. Clocks start after it.';
  else status = 'Your move';

  const plate = (color: Color, name: string, sub: string) => {
    const lead = color === 'w' ? caps.lead : -caps.lead;
    const toMove = game.turn() === color && !over;
    const left = remaining(color);
    return (
      <div className={`plate ${toMove ? 'to-move' : ''}`}>
        <div className="plate-who">
          <span className="plate-king">
            <Piece type="k" color={color} />
          </span>
          <span className="plate-name">{name}</span>
          <span className="plate-sub">{sub}</span>
        </div>
        <span className="caps" aria-label="Captured pieces">
          {caps[color].map((t, i) => (
            <Piece key={i} type={t} color={color === 'w' ? 'b' : 'w'} />
          ))}
          {lead > 0 && <em>+{lead}</em>}
        </span>
        {timed && (
          <span
            className={`clock ${toMove && clockRef.current.turnStart !== null ? 'running' : ''} ${
              left < LOW_TIME ? 'low' : ''
            }`}
            role="timer"
            aria-label={`${name} clock`}
          >
            {formatClock(left)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="game-screen">
      <header className="topbar">
        <button className="text-btn" onClick={onExit}>
          <IconBack /> Menu
        </button>
        <span className="topbar-title">
          Against the computer{timed ? `, ${tc.label}` : ''}
        </span>
        <button className="icon-btn" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} title={muted ? 'Sound off' : 'Sound on'}>
          <IconSound muted={muted} />
        </button>
      </header>

      <div className="game-body">
        <div className="board-col">
          {plate(botColor, 'The Pawn Master', `${levelName(settings.elo)}, about ${settings.elo}`)}
          <div className="board-wrap">
          {coachOn && (
            <div className={`evalbar ${orientation === 'b' ? 'flipped' : ''}`} aria-label={`Evaluation ${evalWhite?.label ?? ''}`}>
              <div className="evalbar-white" style={{ height: `${((evalWhite?.chance ?? 0) + 1) * 50}%` }} />
              <span className={`evalbar-label ${(evalWhite?.chance ?? 0) >= 0 ? 'w' : 'b'}`}>{evalWhite?.label ?? '0.0'}</span>
            </div>
          )}
          <Board
            game={game}
            version={version}
            orientation={orientation}
            interactiveColor={over || thinking || gate !== 'none' ? null : player}
            lastMove={lastMove}
            onMove={onMove}
            className="main-board"
            arrows={arrows}
            danger={danger}
            opportunity={opportunity}
          >
            {result && (
              <div className={`result ${result.won ? 'won' : ''}`}>
                <h2>{result.title}</h2>
                <p>{result.detail}</p>
                {coachOn && Object.keys(reviews).length > 0 && (
                  <ul className="summary" aria-label="Your moves">
                    {(['best', 'good', 'inaccuracy', 'mistake', 'blunder'] as Grade[]).map((g) => (
                      <li key={g} className={g}>
                        <strong>{gradeCounts[g] ?? 0}</strong>
                        {GRADE_LABEL[g].replace(' move', '')}
                      </li>
                    ))}
                    {retries > 0 && (
                      <li className="retries">
                        <strong>{retries}</strong>
                        {retries === 1 ? 'Retry' : 'Retries'}
                      </li>
                    )}
                  </ul>
                )}
                <div className="result-actions">
                  <button className="primary" onClick={rematch}>
                    Rematch
                  </button>
                  <button className="secondary" onClick={onExit}>
                    Menu
                  </button>
                </div>
              </div>
            )}
          </Board>
          </div>
          {plate(player, 'You', player === 'w' ? 'White' : 'Black')}
        </div>

        <aside className="side">
          <p className={`turn-status ${thinking ? 'thinking' : ''}`} role="status">
            {thinking && <span className="dots" aria-hidden />}
            {status}
          </p>

          {coachOn && (
            <section className={`coach ${latest ? latest.grade : 'idle'} ${reviewing ? 'busy' : ''}`} aria-live="polite">
              {latest ? (
                <>
                  <div className="coach-head">
                    <span className="grade-dot" aria-hidden />
                    <span className="grade-label">{GRADE_LABEL[latest.grade]}</span>
                    <span className="coach-move">
                      {latest.playedSan}
                      {GRADE_MARK[latest.grade] ?? ''}
                    </span>
                  </div>
                  <p className="coach-text">{latest.text}</p>
                  <div className="coach-actions">
                    {gate === 'prompt' && (
                      <>
                        <button className="primary small" onClick={tryAgain}>
                          Try again
                        </button>
                        <button className="secondary small" onClick={() => setGate('none')}>
                          Keep my move
                        </button>
                      </>
                    )}
                    {latest.grade !== 'best' && latest.bestSan && (
                      <button className="text-btn" onClick={() => setShowBest((s) => !s)}>
                        {showBest ? 'Hide' : 'Show'} {latest.bestSan}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="coach-text">
                  {reviewing ? 'Looking at your move…' : 'Play a move and the coach will grade it here.'}
                </p>
              )}
            </section>
          )}

          {threatNote && (
            <p className={`threat-note ${danger.length ? 'bad' : 'ok'}`} role="status">
              {threatNote}
            </p>
          )}

          <ol className="scoresheet" ref={scoreRef}>
            {rows.length === 0 && <li className="empty">Your moves and the Pawn Master’s will be written here.</li>}
            {rows.map((r, i) => {
              const cell = (ply: number, san?: string) => {
                const rv = reviews[ply];
                return (
                  <span className={rv ? `mv ${rv.grade}` : 'mv'}>
                    {san ?? ''}
                    {rv && GRADE_MARK[rv.grade] && <sup>{GRADE_MARK[rv.grade]}</sup>}
                  </span>
                );
              };
              return (
                <li key={r.n} className={i === rows.length - 1 ? 'latest' : ''}>
                  <span className="n">{r.n}</span>
                  {cell(i * 2, r.w)}
                  {cell(i * 2 + 1, r.b)}
                </li>
              );
            })}
          </ol>

          <div className="tools four">
            <button onClick={takeBack} disabled={!canTakeBack} title={timed ? 'Not available in timed games' : undefined}>
              <IconUndo />
              Undo
            </button>
            <button
              onClick={() => setThreats((t) => !t)}
              aria-pressed={threats}
              title="Red rings: your pieces that can be taken. Green rings: pieces you can win."
            >
              <IconEye />
              Threats
            </button>
            <button onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
              <IconFlip />
              Flip
            </button>
            <button onClick={resign} disabled={over || history.length < 2}>
              <IconFlag />
              Resign
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
