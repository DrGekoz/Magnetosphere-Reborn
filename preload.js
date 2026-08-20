'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('quit-app'),
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  isWallpaper: () => ipcRenderer.invoke('is-wallpaper'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChange: (cb) => ipcRenderer.on('fullscreen-change', (e, fs) => cb(fs)),
  onCaptureScene: (cb) => ipcRenderer.on('capture-scene', (e, s) => cb(s)),
});
