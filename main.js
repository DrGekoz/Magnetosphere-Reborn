'use strict';
const { app, BrowserWindow, desktopCapturer, screen, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
const CAPTURE = process.argv.includes('--capture');
const WALLPAPER = process.argv.includes('--wallpaper');
const CAPTURE_DIR = path.join(__dirname, 'captures');

function createWindow() {
  const displays = screen.getAllDisplays();
  const spanAll = process.argv.includes('--span');
  let bounds = screen.getPrimaryDisplay().bounds;
  if (spanAll) {
    bounds = displays.reduce((a, d) => ({
      x: Math.min(a.x, d.bounds.x),
      y: Math.min(a.y, d.bounds.y),
      width: Math.max(a.x + a.width, d.bounds.x + d.bounds.width) - Math.min(a.x, d.bounds.x),
      height: Math.max(a.y + a.height, d.bounds.y + d.bounds.height) - Math.min(a.y, d.bounds.y),
    }), { x: 1e9, y: 1e9, width: 0, height: 0 });
  }

  win = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    frame: false, title: 'Magnetosphere Reborn',
    transparent: false,
    backgroundColor: '#000000',
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('enter-full-screen', () => { if (!win.isDestroyed()) win.webContents.send('fullscreen-change', true); });
  win.on('leave-full-screen', () => { if (!win.isDestroyed()) win.webContents.send('fullscreen-change', false); });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (WALLPAPER) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setSkipTaskbar(true);
    win.setFullScreenable(false);
  }

  // System audio loopback: capture audio from the primary display WITHOUT any picker.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const primary = sources.find((s) => s.display_id === String(screen.getPrimaryDisplay().id)) || sources[0];
      callback({ video: primary, audio: 'loopback' });
    }).catch((err) => {
      try { callback({ video: undefined, audio: 'loopback' }); } catch (e) { console.error('media handler', err, e); }
    });
  }, { useSystemPicker: false });

  if (CAPTURE) {
    win.webContents.once('did-finish-load', () => setTimeout(() => runCapture(), 1200));
  }
}

// Capture mode: render several frames with simulated audio levels, save PNGs for visual QA.
async function runCapture() {
  try { fs.mkdirSync(CAPTURE_DIR, { recursive: true }); } catch (e) {}
  const scenes = [
    { id: 'idle', energy: 0.02, bass: 0.02, beat: 0.0, wait: 0 },
    { id: 'beat', energy: 0.9, bass: 0.95, beat: 1.0, wait: 2000 },
    { id: 'music', energy: 0.6, bass: 0.45, beat: 0.2, wait: 4000 },
  ];
  for (const s of scenes) {
    await sleep(s.wait);
    win.webContents.send('capture-scene', s);
    await sleep(900);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURE_DIR, `shot_${s.id}.png`), img.toPNG());
    console.log('captured', s.id);
  }
  app.exit(0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { app.quit(); });

ipcMain.on('quit-app', () => app.quit());
ipcMain.handle('get-screen-info', () => {
  const d = screen.getPrimaryDisplay();
  return { width: d.size.width, height: d.size.height, scale: d.scaleFactor };
});
ipcMain.on('toggle-fullscreen', () => {
  const w = BrowserWindow.getFocusedWindow() || win;
  if (w) w.setFullScreen(!w.isFullScreen());
});
ipcMain.handle('is-wallpaper', () => WALLPAPER);
ipcMain.handle('is-fullscreen', () => {
  const w = BrowserWindow.getFocusedWindow() || win;
  return !!(w && w.isFullScreen());
});
