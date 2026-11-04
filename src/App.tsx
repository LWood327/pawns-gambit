import { useState } from 'react';
import { flushSync } from 'react-dom';
import { Home } from './Home';
import { GameScreen } from './GameScreen';
import { loadMuted, loadSettings, saveMuted, saveSettings, type BotGameSettings } from './settings';
import { setMuted as setSoundMuted } from './sound';

type Screen = { name: 'home'; view: 'menu' | 'bot' } | { name: 'game'; key: number };

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

  if (screen.name === 'game') {
    return (
      <GameScreen
        key={screen.key}
        settings={settings}
        muted={muted}
        onToggleMute={toggleMute}
        onExit={() => transition(() => setScreen({ name: 'home', view: 'bot' }))}
      />
    );
  }

  return (
    <Home
      key={screen.view}
      initialView={screen.view}
      settings={settings}
      onChangeSettings={changeSettings}
      onStart={() => transition(() => setScreen({ name: 'game', key: Date.now() }))}
    />
  );
}
