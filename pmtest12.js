const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 800, height: 500, show: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.webContents.on('console-message', (e, l, m) => { if (/Uncaught|ERROR/i.test(m)) console.log('[c]', m.slice(0,150)); });
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 2500));
  await win.webContents.executeJavaScript(`window.__app.setParam('visualMode', 'party-mode'); true;`);
  await new Promise(r => setTimeout(r, 5000));
  const j = await win.webContents.executeJavaScript(`
    (() => {
      const d = document.getElementById('tpl-frame').contentDocument;
      const svg = d.querySelector('#viz svg') || d.querySelector('svg');
      const shapes = svg ? svg.querySelectorAll('rect,path,circle,polygon,line').length : 0;
      return JSON.stringify({ svg: !!svg, shapes });
    })()
  `);
  console.log('PMDRAW:', j);
  const img = await win.webContents.capturePage();
  fs.writeFileSync('captures/ifr_party7.png', img.toPNG());
  app.exit(0);
});
