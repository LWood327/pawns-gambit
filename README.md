# Pawn’s Gambit

A desktop chess app for practicing against Stockfish.

## Run it

```bash
npm install
npm run app
```

`npm run dev` runs the same app in a browser at http://localhost:5173 for quick UI work.

## Online play

The room server lives in `server/`. To try online play on one computer:

```bash
cd server && npm install && npm start
```

Then open the app twice (or the app and `npm run dev` in a browser), create a game in one and join it with the room code in the other.

The app connects to `ws://localhost:8787` unless `VITE_SERVER_URL` is set at build time. Once the server is hosted (see `render.yaml`), put its address in `.env.production`:

```
VITE_SERVER_URL=wss://your-server-name.onrender.com
```

## Notes

- Stockfish (GPLv3) is bundled in `public/engine/`. If you share the app, the source needs to be available too, which keeping this repo public on GitHub covers.
- If `npm install` leaves Electron half-downloaded ("Electron failed to install correctly"), extract the zip from `%LOCALAPPDATA%\electron\Cache` into `node_modules/electron/dist` and write `electron.exe` into `node_modules/electron/path.txt`.
