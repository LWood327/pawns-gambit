import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  plugins: [react()],
  // The app's version, shown in the corner of the home screen.
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Polling: the default file watcher misses some edits on Windows.
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
});
