const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 800, height: 500, show: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.webContents.on('console-message', (e, l, m) => { if (/error|shader|compile/i.test(m)) console.log('[c]', m); });
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 2500));
  // test black hole theme
  const bh = await win.webContents.executeJavaScript(`
    (async () => {
      const app = window.__app;
      app.applyTheme(window.__modules.presets.themeById('black-hole'));
      await new Promise(r => setTimeout(r, 400));
      return JSON.stringify({ theme: app.currentThemeId || 'black-hole', bhUniform: app.themeScene.suck || app.themeScene.bigCore });
    })()
  `);
  console.log('BHTEST:', bh);
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync('captures/bh_test.png', img1.toPNG());
  // test metal material
  const mt = await win.webContents.executeJavaScript(`
    (async () => {
      const app = window.__app;
      app.setParam('material', 'Metal');
      await new Promise(r => setTimeout(r, 400));
      return JSON.stringify({ material: app.params.material, metallic: app.params.metallic });
    })()
  `);
  console.log('MTEST:', mt);
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync('captures/metal_test.png', img2.toPNG());
  console.log('captured both');
  app.exit(0);
});
