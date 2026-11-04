import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/young-serif/400.css';
import './styles.css';
import './themes.css';
import App from './App';
import { loadThemePrefs } from './themes';

// Apply the saved theme before the first paint so the board doesn't flash walnut.
document.documentElement.dataset.theme = loadThemePrefs().id;

createRoot(document.getElementById('root')!).render(<App />);
