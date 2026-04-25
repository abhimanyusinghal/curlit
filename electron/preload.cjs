'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// A narrow, typed surface exposed to the renderer. Everything goes through
// ipcRenderer.invoke (request/response) or ipcRenderer.send + a single event
// subscription for WebSocket traffic.
contextBridge.exposeInMainWorld('curlit', {
  isDesktop: true,

  version: () => ipcRenderer.invoke('curlit:version'),

  http: (payload) => ipcRenderer.invoke('curlit:http', payload),

  oauthToken: (payload) => ipcRenderer.invoke('curlit:oauth-token', payload),

  githubStatus: () => ipcRenderer.invoke('curlit:github-status'),
  githubDeviceCode: () => ipcRenderer.invoke('curlit:github-device-code'),
  githubDeviceToken: (deviceCode) => ipcRenderer.invoke('curlit:github-device-token', deviceCode),

  wsConnect: (payload) => ipcRenderer.send('curlit:ws-connect', payload),
  wsSend: (id, data) => ipcRenderer.send('curlit:ws-send', { id, data }),
  wsClose: (id) => ipcRenderer.send('curlit:ws-close', id),
  onWsEvent: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('curlit:ws-event', listener);
    return () => ipcRenderer.removeListener('curlit:ws-event', listener);
  },
});
