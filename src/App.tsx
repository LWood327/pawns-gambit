import { useEffect, useMemo, useState } from 'react';
import { ThemeContext, getTheme, lavaCracks, loadThemePrefs, saveThemePrefs } from './themes';
import { flushSync } from 'react-dom';
import { Home } from './Home';
import { GameScreen } from './GameScreen';
import { OnlineGame } from './OnlineGame';
import { TrainerScreen, type TrainerMode } from './TrainerScreen';
import type { StartRequest } from './online';
import { PieceDefs } from './pieces';
import { loadMuted, loadSettings, saveMuted, saveSettings, type BotGameSettings } from './settings';
import { setMuted as setSoundMuted, setSoundTheme } from './sound';

type Screen =
  | { name: 'home'; view: 'menu' | 'bot' | 'online' | 'trainer' }
  | { name: 'game'; key: number }
  | { name: 'trainer'; key: number; mode: TrainerMode }
  | { name: 'online'; key: number; start: StartRequest };

/** Animates between screens with the View Transitions API when available. */
function transition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (doc.startViewTransition && !reduce) doc.startViewTransition(() => flushSync(update));
  else update();
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home', view: 'menu' });
  const [settings, setSettings] = useState<BotGameSettings>(loadSettings);
  const [muted, setMuted] = useState(() => {
    const m = loadMuted();
    setSoundMuted(m);
    return m;
  });

  const [themePrefs, setThemePrefs] = useState(loadThemePrefs);
  const themeState = useMemo(
    () => ({ theme: getTheme(themePrefs.id), calm: themePrefs.calm }),
    [themePrefs],
  );
  useEffect(() => {
    const root = document.documentElement;
    if (themeState.theme.id === 'lava' && !root.style.getPropertyValue('--lava-cracks')) {
      root.style.setProperty('--lava-cracks', lavaCracks());
    }
    root.dataset.theme = themeState.theme.id;
    setSoundTheme(themeState.theme.id);
  }, [themeState.theme.id]);
  const changeTheme = (p: { id: string; calm: boolean }) => {
    setThemePrefs(p);
    saveThemePrefs(p);
  };

  const changeSettings = (s: BotGameSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    setSoundMuted(m);
    saveMuted(m);
  };

  return (
    <ThemeContext.Provider value={themeState}>
      <PieceDefs />
      {screen.name === 'game' ? (
        <GameScreen
          key={screen.key}
          settings={settings}
          muted={muted}
          onToggleMute={toggleMute}
          onExit={() => transition(() => setScreen({ name: 'home', view: 'bot' }))}
        />
      ) : screen.name === 'trainer' ? (
        <TrainerScreen
          key={screen.key}
          mode={screen.mode}
          muted={muted}
          onToggleMute={toggleMute}
          onExit={() => transition(() => setScreen({ name: 'home', view: 'trainer' }))}
        />
      ) : screen.name === 'online' ? (
        <OnlineGame
          key={screen.key}
          start={screen.start}
          muted={muted}
          onToggleMute={toggleMute}
          onExit={() => transition(() => setScreen({ name: 'home', view: 'online' }))}
        />
      ) : (
        <Home
          key={screen.view}
          initialView={screen.view}
          settings={settings}
          onChangeSettings={changeSettings}
          onStart={() => transition(() => setScreen({ name: 'game', key: Date.now() }))}
          onStartOnline={(start) => transition(() => setScreen({ name: 'online', key: Date.now(), start }))}
          onStartTrainer={(mode) => transition(() => setScreen({ name: 'trainer', key: Date.now(), mode }))}
          themePrefs={themePrefs}
          onChangeTheme={changeTheme}
        />
      )}
    </ThemeContext.Provider>
  );
}
