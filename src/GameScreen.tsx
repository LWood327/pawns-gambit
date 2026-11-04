import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { Board, type LastMove } from './Board';
import { Engine } from './engine';
import { Piece } from './pieces';
import { IconBack, IconFlag, IconFlip, IconSound, IconUndo } from './icons';
import { levelName, timeControl, type BotGameSettings } from './settings';
import { play } from './sound';

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const LOW_TIME = 10_000;

function pickSide(choice: BotGameSettings['side']): Color {
  if (choice === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return choice;
}

/** Pieces each side has captured, plus the material lead. */
function captured(game: Chess) {
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
  if (ending?.kind === 'resign') return { title: 'Resigned', detail: 'The bot takes this one.', won: false };
  if (ending?.kind === 'flag') {
    return ending.color === player
      ? { title: 'Out of time', detail: 'Your clock ran out, so the bot wins.', won: false }
      : { title: 'Out of time', detail: "The bot's clock ran out. You win.", won: true };
  }
  if (game.isCheckmate()) {
    const won = game.turn() !== player;
    return { title: 'Checkmate', detail: won ? `You won in ${moves} moves.` : `The bot won in ${moves} moves.`, won };
  }
  if (game.isStalemate()) return { title: 'Stalemate', detail: 'No legal moves and no check, so it’s a draw.', won: false };
  if (game.isThreefoldRepetition()) return { title: 'Draw', detail: 'The same position came up three times.', won: false };
  if (game.isInsufficientMaterial()) return { title: 'Draw', detail: 'Neither side can checkmate with what’s left.', won: false };
  if (game.isDraw()) return { title: 'Draw', detail: '50 moves with no capture or pawn move.', won: false };
  return null;
}

function formatClock(ms: number) {
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

  const game = gameRef.current;
  const bump = () => setVersion((v) => v + 1);
  const botColor: Color = player === 'w' ? 'b' : 'w';
  const over = ending !== null || game.isGameOver();

  useEffect(() => {
    try {
      engineRef.current = new Engine(() => setEngineError(true));
    } catch {
      setEngineError(true);
    }
    return () => engineRef.current?.destroy();
  }, []);

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
    if (!engine || over || game.turn() !== botColor) return;
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
  }, [version, player, over]);

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


  const onMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol) => {
      let move: Move;
      try {
        move = game.move({ from, to, promotion });
      } catch {
        return;
      }
      afterMove(move, false);
    },
    [game, afterMove],
  );

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
    bump();
  };

  const takeBack = () => {
    game.undo();
    if (game.turn() !== player) game.undo();
    const hist = game.history({ verbose: true });
    const prev = hist[hist.length - 1];
    setLastMove(prev ? { from: prev.from, to: prev.to, animate: false, id: ++moveIdRef.current } : null);
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
  const canTakeBack = !timed && !thinking && ending === null && playerHasMoved;

  let status: string;
  if (engineError) status = 'The bot could not start. Restart the app to try again.';
  else if (result) status = result.detail;
  else if (thinking) status = 'The bot is thinking';
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
          {plate(botColor, 'Stockfish', `${levelName(settings.elo)}, about ${settings.elo}`)}
          <Board
            game={game}
            version={version}
            orientation={orientation}
            interactiveColor={over || thinking ? null : player}
            lastMove={lastMove}
            onMove={onMove}
            className="main-board"
          >
            {result && (
              <div className={`result ${result.won ? 'won' : ''}`}>
                <h2>{result.title}</h2>
                <p>{result.detail}</p>
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
          {plate(player, 'You', player === 'w' ? 'White' : 'Black')}
        </div>

        <aside className="side">
          <p className={`turn-status ${thinking ? 'thinking' : ''}`} role="status">
            {thinking && <span className="dots" aria-hidden />}
            {status}
          </p>

          <ol className="scoresheet" ref={scoreRef}>
            {rows.length === 0 && <li className="empty">Your moves and the bot’s will be written here.</li>}
            {rows.map((r, i) => (
              <li key={r.n} className={i === rows.length - 1 ? 'latest' : ''}>
                <span className="n">{r.n}</span>
                <span>{r.w}</span>
                <span>{r.b ?? ''}</span>
              </li>
            ))}
          </ol>

          <div className="tools">
            <button onClick={takeBack} disabled={!canTakeBack} title={timed ? 'Not available in timed games' : undefined}>
              <IconUndo />
              Take back
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
