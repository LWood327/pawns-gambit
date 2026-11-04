import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board, type LastMove } from './Board';
import { Piece } from './pieces';
import { IconBack } from './icons';
import { THEMES, useTheme, type Theme } from './themes';
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
  const { theme } = useTheme();

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
      <figcaption>
        {theme.id !== 'walnut' && `${theme.name} board. `}Morphy’s Opera Game, Paris 1858
      </figcaption>
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
  initialView?: 'menu' | 'bot';
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
            onClick={() => onChangeTheme({ ...themePrefs, id: t.id })}
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

export function Home({ settings, onChangeSettings, onStart, initialView = 'menu', themePrefs, onChangeTheme }: Props) {
  const [view, setView] = useState<'menu' | 'bot' | 'themes'>(initialView);

  const items: MenuItem[] = [
    { title: 'Play the computer', detail: 'Pick a strength and a clock, then play Stockfish.', onSelect: () => setView('bot') },
    { title: 'Play a friend online', detail: 'Share a room code and play from two computers.' },
    { title: 'Trainer', detail: 'Puzzles from your own mistakes, and opening practice.' },
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
                      : 'After a mistake or blunder, try again before the bot replies.'}
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
