// Renders the app icon (brass pawn on felt) to build/icon.png using Electron.
// Run with: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const pawn = [
  'M11 40h23a1.6 1.6 0 0 0 1.6-1.6v-.9a2.2 2.2 0 0 0-2.2-2.2H11.6a2.2 2.2 0 0 0-2.2 2.2v.9A1.6 1.6 0 0 0 11 40z',
  'M13.2 35.3c0-1.7 1.3-2.8 2.9-2.8h12.8c1.6 0 2.9 1.1 2.9 2.8z',
  'M16.4 32.5c1.5-3.1 3.1-6.4 3.6-10.3h5c.5 3.9 2.1 7.2 3.6 10.3z',
  'M17.6 19.9h9.8a1.6 1.6 0 0 1 0 3.2h-9.8a1.6 1.6 0 0 1 0-3.2z',
  'M22.5 8.6a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z',
];

const html = `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 45 45">
  <defs>
    <radialGradient id="felt" cx="0.4" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#2a5a4c"/><stop offset="0.6" stop-color="#15302a"/><stop offset="1" stop-color="#0c201b"/>
    </radialGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="#fff3cf"/><stop offset="0.45" stop-color="#e6c983"/><stop offset="1" stop-color="#9c7a34"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="43" height="43" rx="10" fill="url(#felt)"/>
  <rect x="1.5" y="1.5" width="42" height="42" rx="9.5" fill="none" stroke="#c9a75b" stroke-opacity="0.55" stroke-width="0.8"/>
  <g transform="translate(22.5 23.5) scale(0.86) translate(-22.5 -24)">
    <ellipse cx="22.5" cy="40.4" rx="13" ry="1.8" fill="#000" fill-opacity="0.35"/>
    ${pawn.map((d) => `<path d="${d}" fill="url(#brass)" stroke="#3a2a0e" stroke-width="0.9" stroke-linejoin="round"/>`).join('')}
  </g>
</svg></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log('Wrote', out);
  app.quit();
});
