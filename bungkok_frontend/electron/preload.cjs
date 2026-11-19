const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bungkokDesktop', {
  setMonitoringState: (state) => ipcRenderer.send('monitor:set-state', state),
  notify: (payload) => ipcRenderer.send('monitor:notify', payload),
  onMonitorAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('monitor:action', listener);
    return () => ipcRenderer.removeListener('monitor:action', listener);
  },
});

