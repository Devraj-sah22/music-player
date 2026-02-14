const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Existing functions
  addSongFromUrl: (url) => ipcRenderer.invoke('add-song-from-url', url),
  selectLocalFile: () => ipcRenderer.invoke('select-local-file'),
  getMusicPath: () => ipcRenderer.invoke('get-music-path'),

  // Window controls
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),

  // Event listener
  on: (channel, callback) => {
    const validChannels = [
      'song-progress',
      'song-ended',
      'download-progress' // 🔥 ADDED THIS
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  }
});
