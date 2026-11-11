import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { Board, type LastMove } from './Board';
import { Piece } from './pieces';
import { IconBack, IconFlag, IconFlip, IconSound } from './icons';
import { captured, formatClock } from './GameScreen';
import { OnlineClient, type RoomState, type StartRequest } from './online';
import { timeControl } from './settings';
import { play } from './sound';
import { saveGame, type SavedGame } from './games';

const LOW_TIME = 10_000;

function resultText(s: RoomState) {
  const r = s.result!;
  const won = r.winner === s.you;
  const them = s.players[s.you === 'w' ? 'b' : 'w']?.name ?? 'Your friend';
  const moves = Math.ceil(s.moves.length / 2);
  switch (r.kind) {
    case 'checkmate':
      return { title: 'Checkmate', detail: won ? `You beat ${them} in ${moves} moves.` : `${them} won in ${moves} moves.`, won };
    case 'resign':
      return { title: won ? 'You win' : 'Resigned', detail: won ? `${them} resigned.` : `You resigned. ${them} wins.`, won };
    case 'flag':
      return { title: 'Out of time', detail: won ? `${them}’s clock ran out. You win.` : `Your clock ran out. ${them} wins.`, won };
    case 'abandon':
      return { title: 'You win', detail: `${them} left the game and didn’t come back.`, won: true };
    case 'agreed':
      return { title: 'Draw', detail: 'You both agreed to a draw.', won: false };
    case 'stalemate':
      return { title: 'Stalemate', detail: 'No legal moves and no check, so it’s a draw.', won: false };
    case 'repetition':
      return { title: 'Draw', detail: 'The same position came up three times.', won: false };
    case 'material':
      return { title: 'Draw', detail: 'Neither side can checkmate with what’s left.', won: false };
    case 'fifty':
      return { title: 'Draw', detail: '50 moves with no capture or pawn move.', won: false };
  }
}

interface Props {
  start: StartRequest;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  onReview: (g: SavedGame) => void;
}

export function OnlineGame({ start, muted, onToggleMute, onExit, onReview }: Props) {
  const clientRef = useRef<OnlineClient | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [conn, setConn] = useState<'connecting' | 'open' | 'reconnecting' | 'failed'>('connecting');
  const [error, setError] = useState<{ message: string; fatal: boolean } | null>(null);
  const [game, setGame] = useState(() => new Chess());
  const [version, setVersion] = useState(0);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [orientation, setOrientation] = useState<Color>('w');
  const [now, setNow] = useState(() => performance.now());
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const moveIdRef = useRef(0);
  const movesSeen = useRef(0);
  const youRef = useRef<Color | null>(null);
  const resultSeen = useRef(false);

  useEffect(() => {
    const client = new OnlineClient(start, {
      onState: (s, at) => {
        const g = new Chess(s.fen);
        // Animate and play a sound only for moves we haven't shown yet.
        if (s.moves.length !== movesSeen.current) {
          const fresh = s.moves.length > movesSeen.current;
          const lm = s.lastMove;
          if (lm && s.moves.length > 0) {
            const mover: Color = s.turn === 'w' ? 'b' : 'w';
            const theirs = mover !== s.you;
            setLastMove({
              from: lm.from as Square,
              to: lm.to as Square,
              animate: fresh && theirs,
              id: ++moveIdRef.current,
              captured:
                fresh && lm.captured
                  ? {
                      type: lm.captured as PieceSymbol,
                      color: mover === 'w' ? 'b' : 'w',
                      square: (lm.flags.includes('e') ? `${lm.to[0]}${lm.from[1]}` : lm.to) as Square,
                    }
                  : undefined,
            });
            if (fresh && theirs) {
              if (g.inCheck()) play('check');
              else if (lm.captured) play('capture');
              else play('move');
            }
          } else setLastMove(null);
          movesSeen.current = s.moves.length;
        }
        if (s.result && !resultSeen.current) play('end');
        resultSeen.current = Boolean(s.result);
        if (youRef.current !== s.you) {
          youRef.current = s.you;
          setOrientation(s.you);
        }
        setGame(g);
        setVersion((v) => v + 1);
        setState(s);
        setReceivedAt(at);
        setError(null);
      },
      onError: (message, fatal) => setError({ message, fatal }),
      onStatus: setConn,
    });
    clientRef.current = client;
    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const you = state?.you ?? 'w';
  const them: Color = you === 'w' ? 'b' : 'w';
  const opponent = state?.players[them] ?? null;
  const waiting = state !== null && !opponent;
  const over = Boolean(state?.result);
  const myTurn = state !== null && !over && !waiting && game.turn() === you;
  const tc = timeControl(state?.timeId ?? 'none');
  const timed = tc.base > 0;

  // Tick the clocks locally between server updates.
  useEffect(() => {
    if (!state?.clockRunning) return;
    const iv = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(iv);
  }, [state?.clockRunning]);

  const remaining = (c: Color) => {
    if (!state?.clocks) return 0;
    const running = state.clockRunning && game.turn() === c;
    return state.clocks[c] - (running ? now - receivedAt : 0);
  };

  const onMove = (from: Square, to: Square, promotion?: PieceSymbol) => {
    // Show the move right away; the server's next update confirms it.
    let move;
    try {
      move = game.move({ from, to, promotion });
    } catch {
      return;
    }
    setLastMove({ from, to, animate: false, id: ++moveIdRef.current });
    if (game.inCheck()) play('check');
    else if (move.captured) play('capture');
    else play('move');
    movesSeen.current += 1;
    setVersion((v) => v + 1);
    clientRef.current?.send({ t: 'move', from, to, promotion });
  };

  const send = (msg: Record<string, unknown>) => clientRef.current?.send(msg);

  const caps = useMemo(() => captured(game), [game, version]);
  const rows = useMemo(() => {
    const h = state?.moves ?? [];
    const r: { n: number; w: string; b?: string }[] = [];
    for (let i = 0; i < h.length; i += 2) r.push({ n: i / 2 + 1, w: h[i], b: h[i + 1] });
    return r;
  }, [state?.moves]);

  const scoreRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    scoreRef.current?.scrollTo({ top: scoreRef.current.scrollHeight, behavior: 'smooth' });
  }, [rows.length]);

  const chatRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [state?.chat.length]);

  const copyCode = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the code is still on screen */
    }
  };

  const result = state?.result ? resultText(state) : null;

  // Save each finished online game for review.
  const [savedGame, setSavedGame] = useState<SavedGame | null>(null);
  const resultKey = state?.result ? `${state.result.kind}|${state.moves.length}|${state.you}` : '';
  useEffect(() => {
    if (!state?.result || !result) {
      setSavedGame(null);
      return;
    }
    setSavedGame(
      saveGame({
        moves: state.moves,
        player: state.you,
        opponent: state.players[state.you === 'w' ? 'b' : 'w']?.name ?? 'Friend',
        mode: 'online',
        result: `${result.title}. ${result.detail}`,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  let status: string;
  if (error?.fatal) status = error.message;
  else if (conn === 'failed') status = 'Can’t reach the game server. Check your internet and try again.';
  else if (conn === 'reconnecting' && !state) status = 'Waking up the game server. This can take up to a minute the first time.';
  else if (conn === 'reconnecting') status = 'Connection lost. Reconnecting…';
  else if (!state) status = start.mode === 'join' ? 'Joining…' : 'Setting up your game…';
  else if (result) status = result.detail;
  else if (waiting) status = 'Waiting for your friend to join';
  else if (!opponent?.connected) status = `${opponent?.name} lost connection. They have 60 seconds to come back.`;
  else if (myTurn) status = game.inCheck() ? 'You’re in check' : 'Your move';
  else status = `${opponent?.name}’s move`;

  const plate = (color: Color, name: string, sub: string) => {
    const lead = color === 'w' ? caps.lead : -caps.lead;
    const toMove = game.turn() === color && !over && !waiting;
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
            className={`clock ${toMove && state?.clockRunning ? 'running' : ''} ${left < LOW_TIME ? 'low' : ''}`}
            role="timer"
            aria-label={`${name} clock`}
          >
            {formatClock(left)}
          </span>
        )}
      </div>
    );
  };

  const meName = state?.players[you]?.name ?? start.name;
  const iWantRematch = state?.rematch[you];
  const theyWantRematch = state?.rematch[them];

  return (
    <div className="game-screen">
      <header className="topbar">
        <button className="text-btn" onClick={onExit}>
          <IconBack /> Menu
        </button>
        <span className="topbar-title">
          Online{state ? `, room ${state.code}` : ''}
          {timed ? `, ${tc.label}` : ''}
        </span>
        <button className="icon-btn" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          <IconSound muted={muted} />
        </button>
      </header>

      <div className="game-body">
        <div className="board-col">
          {plate(
            them,
            opponent?.name ?? 'Waiting for a player',
            !opponent ? 'Not joined yet' : opponent.connected ? (them === 'w' ? 'White' : 'Black') : 'Reconnecting…',
          )}
          <Board
            game={game}
            version={version}
            orientation={orientation}
            interactiveColor={myTurn && conn === 'open' ? you : null}
            lastMove={lastMove}
            onMove={onMove}
            className="main-board"
          >
            {(waiting || (!state && !error)) && !error?.fatal && (
              <div className="result lobby">
                {state ? (
                  <>
                    <p className="lobby-label">Your match code</p>
                    <h2 className="room-code">{state.code}</h2>
                    <div className="result-actions">
                      <button className="primary" onClick={copyCode}>
                        {copied ? 'Copied' : 'Copy code'}
                      </button>
                    </div>
                    <p className="lobby-hint">They open Eighth Rank, choose Play a friend online, and enter it under Join a match.</p>
                  </>
                ) : (
                  <p>{status}</p>
                )}
              </div>
            )}
            {error?.fatal && (
              <div className="result">
                <h2>{state ? 'Game closed' : 'Can’t join'}</h2>
                <p>{error.message}</p>
                <div className="result-actions">
                  <button className="primary" onClick={onExit}>
                    Back to menu
                  </button>
                </div>
              </div>
            )}
            {result && (
              <div className={`result ${result.won ? 'won' : ''}`}>
                <h2>{result.title}</h2>
                <p>{result.detail}</p>
                <div className="result-actions">
                  <button className="primary" onClick={() => send({ t: 'rematch' })} disabled={iWantRematch || !opponent?.connected}>
                    {iWantRematch ? 'Waiting for them…' : theyWantRematch ? 'Accept rematch' : 'Rematch'}
                  </button>
                  {savedGame && (
                    <button className="secondary" onClick={() => onReview(savedGame)}>
                      Review game
                    </button>
                  )}
                  <button className="secondary" onClick={onExit}>
                    Menu
                  </button>
                </div>
                {theyWantRematch && !iWantRematch && <p className="lobby-hint">{opponent?.name} wants a rematch. Colors will swap.</p>}
              </div>
            )}
          </Board>
          {plate(you, meName, you === 'w' ? 'White' : 'Black')}
        </div>

        <aside className="side">
          <p className="turn-status" role="status">
            {status}
          </p>

          {state?.drawOffer && !over && (
            <section className="coach good draw-offer">
              {state.drawOffer === you ? (
                <p className="coach-text">You offered a draw. Waiting for {opponent?.name}.</p>
              ) : (
                <>
                  <p className="coach-text">{opponent?.name} offers a draw.</p>
                  <div className="coach-actions">
                    <button className="primary small" onClick={() => send({ t: 'answer-draw', accept: true })}>
                      Accept draw
                    </button>
                    <button className="secondary small" onClick={() => send({ t: 'answer-draw', accept: false })}>
                      Keep playing
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <ol className="scoresheet" ref={scoreRef}>
            {rows.length === 0 && <li className="empty">Moves will be written here.</li>}
            {rows.map((r, i) => (
              <li key={r.n} className={i === rows.length - 1 ? 'latest' : ''}>
                <span className="n">{r.n}</span>
                <span>{r.w}</span>
                <span>{r.b ?? ''}</span>
              </li>
            ))}
          </ol>

          <section className="chat" aria-label="Chat">
            <ol className="chat-log" ref={chatRef}>
              {(state?.chat ?? []).map((m, i) => (
                <li key={i} className={m.from === you ? 'mine' : ''}>
                  <span className="chat-who">{m.from === you ? 'You' : opponent?.name ?? 'Friend'}</span>
                  {m.text}
                </li>
              ))}
            </ol>
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                send({ t: 'chat', text: draft });
                setDraft('');
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={opponent ? `Message ${opponent.name}` : 'Chat opens when your friend joins'}
                maxLength={200}
                disabled={!opponent}
                aria-label="Chat message"
              />
            </form>
          </section>

          <div className="tools">
            <button onClick={() => send({ t: 'offer-draw' })} disabled={over || waiting || state?.drawOffer === you || !state?.moves.length}>
              <span className="tool-glyph" aria-hidden>½</span>
              Offer draw
            </button>
            <button onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
              <IconFlip />
              Flip
            </button>
            <button onClick={() => send({ t: 'resign' })} disabled={over || waiting || !state?.moves.length}>
              <IconFlag />
              Resign
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
