# Chess Trainer

A desktop chess app for practicing against Stockfish.

## Run it

```bash
npm install
npm run app
```

`npm run dev` runs the same app in a browser at http://localhost:5173 for quick UI work.

## Notes

- Stockfish (GPLv3) is bundled in `public/engine/`. If you share the app, the source needs to be available too, which keeping this repo public on GitHub covers.
- If `npm install` leaves Electron half-downloaded ("Electron failed to install correctly"), extract the zip from `%LOCALAPPDATA%\electron\Cache` into `node_modules/electron/dist` and write `electron.exe` into `node_modules/electron/path.txt`.
