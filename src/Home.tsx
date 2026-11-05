import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board, type LastMove } from './Board';
import { Piece } from './pieces';
import { IconBack } from './icons';
import { THEMES, type Theme } from './themes';
import { loadName, saveName, type StartRequest } from './online';
import { preview as previewSound } from './sound';
import { OPENINGS, STARTER, duePuzzles, loadBank, loadOpeningStars, nextDueLabel } from './trainer';
import type { TrainerMode } from './TrainerScreen';
import { LEVELS, TIME_CONTROLS, levelName, timeControl, type BotGameSettings, type SideChoice } from './settings';

// Paul Morphy vs. Duke Karl and Count Isouard, Paris Opera, 1858.
const OPERA_GAME =
  'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(
    ' ',
  );

function DemoBoard() {
  const gameRef = useRef(new Chess());
  const [version, setVersion] = useState(0);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0;
    let timer: number;
    gameRef.current.reset();
    const step = () => {
      const g = gameRef.current;
      if (i >= OPERA_GAME.length) {
        // Hold the final mate, then start over.
        timer = window.setTimeout(() => {
          g.reset();
          i = 0;
          setLastMove(null);
          setVersion((v) => v + 1);
          timer = window.setTimeout(step, 1400);
        }, 5000);
        return;
      }
      const m = g.move(OPERA_GAME[i++]);
      setLastMove({
        from: m.from,
        to: m.to,
        animate: !reduce,
        id: ++idRef.current,
        captured: m.captured ? { type: m.captured, color: m.color === 'w' ? 'b' : 'w', square: m.to } : undefined,
      });
      setVersion((v) => v + 1);
      timer = window.setTimeout(step, 1500);
    };
    timer = window.setTimeout(step, 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <figure className="demo">
      <div className="demo-tilt">
        <Board
          game={gameRef.current}
          version={version}
          orientation="w"
          interactiveColor={null}
          lastMove={lastMove}
          onMove={() => {}}
          className="demo-board"
        />
      </div>
    </figure>
  );
}

interface MenuItem {
  title: string;
  detail: string;
  onSelect?: () => void;
}

interface Props {
  settings: BotGameSettings;
  onChangeSettings: (s: BotGameSettings) => void;
  onStart: () => void;
  onStartOnline: (r: StartRequest) => void;
  onStartTrainer: (m: TrainerMode) => void;
  initialView?: 'menu' | 'bot' | 'online' | 'trainer';
  themePrefs: { id: string; calm: boolean };
  onChangeTheme: (p: { id: string; calm: boolean }) => void;
}

function ThemeSwatch({ t }: { t: Theme }) {
  const s = t.swatch;
  return (
    <span className="swatch-board" style={{ background: s.frame }} aria-hidden>
      <span style={{ background: s.light }} />
      <span style={{ background: s.dark }} />
      <span style={{ background: s.dark }} />
      <span style={{ background: s.light }} />
      <i style={{ background: s.white }} />
      <i style={{ background: s.black }} />
    </span>
  );
}

function ThemesView({
  themePrefs,
  onChangeTheme,
  onBack,
}: {
  themePrefs: Props['themePrefs'];
  onChangeTheme: Props['onChangeTheme'];
  onBack: () => void;
}) {
  return (
    <div className="setup-view themes-view">
      <button className="text-btn back" onClick={onBack}>
        <IconBack /> Back
      </button>
      <h2 className="setup-title">Board themes</h2>
      <div className="theme-list" role="radiogroup" aria-label="Board theme">
        {THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={themePrefs.id === t.id}
            className="theme-item"
            onClick={() => {
              onChangeTheme({ ...themePrefs, id: t.id });
              previewSound(t.id);
            }}
          >
            <ThemeSwatch t={t} />
            <span className="theme-text">
              <span className="theme-name">{t.name}</span>
              <span className="theme-desc">{t.description}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="switch-row">
        <span>
          <strong>Calm mode</strong>
          <span>Fewer particles and no bursts on moves, for serious games.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={themePrefs.calm}
          onChange={(e) => onChangeTheme({ ...themePrefs, calm: e.target.checked })}
        />
      </label>
    </div>
  );
}

function OnlineView({ onStart, onBack }: { onStart: (r: StartRequest) => void; onBack: () => void }) {
  const [name, setName] = useState(loadName);
  const [timeId, setTimeId] = useState('10');
  const [side, setSide] = useState<SideChoice>('random');
  const [code, setCode] = useState('');
  const nameOk = name.trim().length > 0;

  const go = (r: StartRequest) => {
    saveName(name.trim());
    onStart(r);
  };

  return (
    <div className="setup-view online-view">
      <button className="text-btn back" onClick={onBack}>
        <IconBack /> Back
      </button>
      <h2 className="setup-title">Play a friend</h2>

      <label className="setup-group text-field">
        <span className="legend-like">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="What your friend will see" />
      </label>

      <fieldset className="setup-group">
        <legend>Host a match</legend>
        <div className="time-pick" role="radiogroup" aria-label="Clock">
          {TIME_CONTROLS.map((t) => (
            <button key={t.id} role="radio" title={t.description} aria-checked={timeId === t.id} onClick={() => setTimeId(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="hint-text">{timeControl(timeId).description}</p>
        <div className="side-pick compact" role="radiogroup" aria-label="Your pieces">
          {(
            [
              ['w', 'White'],
              ['random', 'Random'],
              ['b', 'Black'],
            ] as [SideChoice, string][]
          ).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={side === v} onClick={() => setSide(v)}>
              {label}
            </button>
          ))}
        </div>
        <button
          className="primary start"
          disabled={!nameOk}
          onClick={() => go({ mode: 'create', name: name.trim(), timeId, side })}
        >
          Host match
        </button>
      </fieldset>

      <form
        className="setup-group join-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameOk && code.trim()) go({ mode: 'join', name: name.trim(), code: code.trim().toUpperCase() });
        }}
      >
        <span className="legend-like">Join a match</span>
        <div className="join-inputs">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Room code, like KNIGHT-42"
            maxLength={20}
            aria-label="Room code"
          />
          <button className="secondary" type="submit" disabled={!nameOk || !code.trim()}>
            Join
          </button>
        </div>
      </form>
      {!nameOk && <p className="hint-text">Enter your name to host or join a match.</p>}
    </div>
  );
}

function TrainerView({ onStart, onBack }: { onStart: (m: TrainerMode) => void; onBack: () => void }) {
  const due = duePuzzles().length;
  const total = loadBank().length;
  const stars = loadOpeningStars();
  const later = nextDueLabel();

  return (
    <div className="setup-view trainer-view">
      <button className="text-btn back" onClick={onBack}>
        <IconBack /> Back
      </button>
      <h2 className="setup-title">Trainer</h2>

      <div className="trainer-cards">
        <button className="trainer-card" onClick={() => onStart({ kind: 'mistakes' })} disabled={due === 0}>
          <span className="trainer-count">{due}</span>
          <span className="theme-text">
            <span className="theme-name">Your mistakes</span>
            <span className="theme-desc">
              {total === 0
                ? 'Play coached games against the Pawn Master. Every mistake you make is saved here.'
                : due > 0
                  ? `${due} ${due === 1 ? 'puzzle is' : 'puzzles are'} ready from your own games.`
                  : `All caught up. The next one comes back ${later}.`}
            </span>
          </span>
        </button>
        <button className="trainer-card" onClick={() => onStart({ kind: 'starter' })}>
          <span className="trainer-count">{STARTER.length}</span>
          <span className="theme-text">
            <span className="theme-name">Checkmate patterns</span>
            <span className="theme-desc">Classic mates every player should know.</span>
          </span>
        </button>
      </div>

      <fieldset className="setup-group">
        <legend>Opening practice</legend>
        <div className="opening-list">
          {OPENINGS.map((o) => (
            <button key={o.id} className="opening-item" onClick={() => onStart({ kind: 'opening', id: o.id })} title={o.idea}>
              <span className="opening-name">{o.name}</span>
              <span className="opening-side">as {o.side === 'w' ? 'White' : 'Black'}</span>
              <span className="opening-stars" aria-label={`${stars[o.id] ?? 0} of 3 stars`}>
                {'★'.repeat(stars[o.id] ?? 0)}
                <span className="dim">{'★'.repeat(3 - (stars[o.id] ?? 0))}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function Home({
  settings,
  onChangeSettings,
  onStart,
  onStartOnline,
  onStartTrainer,
  initialView = 'menu',
  themePrefs,
  onChangeTheme,
}: Props) {
  const [view, setView] = useState<'menu' | 'bot' | 'themes' | 'online' | 'trainer'>(initialView);

  const items: MenuItem[] = [
    { title: 'Play the computer', detail: 'Pick a strength and a clock, then take on the Pawn Master.', onSelect: () => setView('bot') },
    { title: 'Play a friend online', detail: 'Share a room code and play from two computers.', onSelect: () => setView('online') },
    { title: 'Trainer', detail: 'Puzzles from your own mistakes, and opening practice.', onSelect: () => setView('trainer') },
    { title: 'Board themes', detail: 'Lava, ice, deep space and more.', onSelect: () => setView('themes') },
  ];

  const set = (patch: Partial<BotGameSettings>) => onChangeSettings({ ...settings, ...patch });

  return (
    <div className="home">
      <div className="home-left">
        {view === 'menu' ? (
          <div className="menu-view" key="menu">
            <h1 className="wordmark">
              <span>Pawn’s</span>
              <span>Gambit</span>
            </h1>
            <nav className="menu" aria-label="Main menu">
              {items.map((it) => (
                <button
                  key={it.title}
                  className="menu-item"
                  onClick={it.onSelect}
                  disabled={!it.onSelect}
                >
                  <span className="menu-marker" aria-hidden>
                    <Piece type="p" color="w" />
                  </span>
                  <span className="menu-title">
                    {it.title}
                    {!it.onSelect && <span className="soon">Coming next</span>}
                  </span>
                  <span className="menu-detail">{it.detail}</span>
                </button>
              ))}
            </nav>
          </div>
        ) : view === 'themes' ? (
          <ThemesView key="themes" themePrefs={themePrefs} onChangeTheme={onChangeTheme} onBack={() => setView('menu')} />
        ) : view === 'online' ? (
          <OnlineView key="online" onStart={onStartOnline} onBack={() => setView('menu')} />
        ) : view === 'trainer' ? (
          <TrainerView key="trainer" onStart={onStartTrainer} onBack={() => setView('menu')} />
        ) : (
          <div className="setup-view" key="bot">
            <button className="text-btn back" onClick={() => setView('menu')}>
              <IconBack /> Back
            </button>
            <h2 className="setup-title">Play the computer</h2>

            <fieldset className="setup-group">
              <legend>Strength</legend>
              <p className="strength-readout">
                <span className="strength-name">{levelName(settings.elo)}</span>
                <span className="strength-elo">about {settings.elo}</span>
              </p>
              <input
                type="range"
                min={400}
                max={2400}
                step={50}
                value={settings.elo}
                onChange={(e) => set({ elo: Number(e.target.value) })}
                aria-label="Bot strength"
                style={{ '--fill': `${((settings.elo - 400) / 2000) * 100}%` } as React.CSSProperties}
              />
              <div className="ticks" aria-hidden>
                {LEVELS.map((l) => (
                  <span key={l.elo}>{l.elo}</span>
                ))}
              </div>
            </fieldset>

            <fieldset className="setup-group">
              <legend>Your pieces</legend>
              <div className="side-pick" role="radiogroup">
                {(
                  [
                    ['w', 'White'],
                    ['random', 'Random'],
                    ['b', 'Black'],
                  ] as [SideChoice, string][]
                ).map(([v, label]) => (
                  <button key={v} role="radio" aria-checked={settings.side === v} onClick={() => set({ side: v })}>
                    <span className={`side-king ${v}`}>
                      {v === 'random' ? (
                        <>
                          <Piece type="k" color="w" />
                          <Piece type="k" color="b" />
                        </>
                      ) : (
                        <Piece type="k" color={v} />
                      )}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="setup-group">
              <legend>Clock</legend>
              <div className="time-pick" role="radiogroup">
                {TIME_CONTROLS.map((t) => (
                  <button key={t.id} role="radio" title={t.description} aria-checked={settings.timeId === t.id} onClick={() => set({ timeId: t.id })}>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="hint-text">
                {timeControl(settings.timeId).description}
                {settings.timeId !== 'none' && ' Your clock only runs on your turn. Run out and you lose.'}
              </p>
            </fieldset>

            <fieldset className="setup-group">
              <legend>Coach</legend>
              <label className="switch-row">
                <span>
                  <strong>Grade my moves</strong>
                  <span>Explains mistakes and shows the better move.</span>
                </span>
                <input type="checkbox" role="switch" checked={settings.coach} onChange={(e) => set({ coach: e.target.checked })} />
              </label>
              <label className={`switch-row ${!settings.coach || settings.timeId !== 'none' ? 'off' : ''}`}>
                <span>
                  <strong>Second chances</strong>
                  <span>
                    {settings.timeId !== 'none'
                      ? 'Only in games without a clock.'
                      : 'After a mistake or blunder, try again before the Pawn Master replies.'}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.secondChances && settings.coach && settings.timeId === 'none'}
                  disabled={!settings.coach || settings.timeId !== 'none'}
                  onChange={(e) => set({ secondChances: e.target.checked })}
                />
              </label>
            </fieldset>

            <button className="primary start" onClick={onStart}>
              Start game
            </button>
          </div>
        )}
      </div>
      <div className="home-right">
        <DemoBoard />
      </div>
    </div>
  );
}
