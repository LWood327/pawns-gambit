// Electron entry point. Serves the built app from a custom "app://" scheme so
// the Stockfish web worker and its .wasm file load the same way they do in a browser.
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const isDev = process.argv.includes('--dev');
const distDir = path.join(__dirname, '..', 'dist');

// Only load the app's own files; 'wasm-unsafe-eval' lets Stockfish's WebAssembly run.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
].join('; ');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#15302A',
    title: 'Pawn’s Gambit',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(isDev ? 'http://localhost:5173' : 'app://chess/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.normalize(path.join(distDir, decodeURIComponent(pathname)));
    if (!filePath.startsWith(distDir)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(res.headers);
    if (filePath.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm');
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
