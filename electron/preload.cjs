// Exposes a small, safe bridge for update notifications to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updates', {
  onStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  install: () => ipcRenderer.send('update-install'),
});
