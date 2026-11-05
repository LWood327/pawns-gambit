// Electron entry point. Serves the built app from a custom "app://" scheme so
// the Stockfish web worker and its .wasm file load the same way they do in a browser.
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
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
  // Online play talks to the room server over WebSockets.
  "connect-src 'self' ws://localhost:8787 wss:",
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
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadURL(isDev ? 'http://localhost:5173' : 'app://chess/index.html');
  return win;
}

/**
 * Checks GitHub releases for a newer version, downloads it in the background,
 * and tells the page so it can offer a restart. Installed builds only.
 */
function setUpUpdates(win) {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const tell = (status) => {
    if (!win.isDestroyed()) win.webContents.send('update-status', status);
  };
  autoUpdater.on('update-available', (info) => tell({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => tell({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => tell({ state: 'ready', version: info.version }));
  // No internet or no releases yet: stay quiet, try again later.
  autoUpdater.on('error', (err) => console.warn('Update check failed:', err?.message));
  ipcMain.on('update-install', () => autoUpdater.quitAndInstall());
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  win.webContents.once('did-finish-load', check);
  setInterval(check, 4 * 60 * 60 * 1000);
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
  setUpUpdates(createWindow());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
