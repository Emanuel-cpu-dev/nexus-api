const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getSources: () => ipcRenderer.invoke('get-sources'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
