import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Polling: the default file watcher misses some edits on Windows.
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
});
