'use strict';
// App orchestrator: owns GL, audio, scene, UI. Render loop with adaptive
// resolution + FPS governor. Theme/material/preset application.

const GLEngine = window.__modules.gl;
const AudioEngine = window.__modules.audio;
const { Scene } = window.__modules.scene;
const SH = window.__modules.shaders;
const UI = window.__modules.ui;
const { SECTIONS, PARAM_SCHEMA, DEFAULTS, MATERIALS, THEMES, hsl2rgb, themeById } = window.__modules.presets;

const MAX_ORBS = 48;

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.gl = new GLEngine(this.canvas);
    // three.js orb engine (fallback to raymarch if it fails to init)
    try {
      const OrbEngine = window.__modules['three-orb'];
      if (OrbEngine) {
        this.orb = new OrbEngine(this.canvas);
        if (!this.orb.ready) this.orb = null;
      }
    } catch (e) { this.orb = null; console.log('three-orb unavailable:', e.message); }
    // MilkDrop engine (butterchurn) — for 'Milk' visual mode + imported .milk presets
    this.milk = null;
    this._milkPreset = null;
    // Interactive Particles engine (Codrops/Tiago Canzian — simplex noise point cloud)
    this.particlesReady = false;
    try {
      const PE = window.__modules['particles'];
      if (PE && PE.default) {
        // Iframe template: main.js waits for mag-three message from renderer/three-orb.js
        this.particlesReady = true;
      }
    } catch (e) { console.log('particles unavailable:', e.message); }
    try {
      const MilkEngine = window.__modules['milk'];
      if (MilkEngine) {
        const me = new MilkEngine(this.canvas, this.audio);
        const ok = me.init(window.devicePixelRatio || 1);
        if (ok || me.pending) {
          this.milk = me;   // keep even if pending (audio wired later -> re-init)
        }
      }
    } catch (e) { this.milk = null; console.log('milk unavailable:', e.message); }
    this.params = Object.assign({}, DEFAULTS);
    this.scene = new Scene();
    this.ui = null;
    this.audio = null;
    this.running = false;
    this.rafs = [];
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.resScale = 1;
    this.captureScene = null;
    this._captureT = 0;
    this.themeScene = {};
    this._customPresets = [];
    this._frameCounter = 0;
    // shared state for post-processing + infrastructure engines
    this.state = { params: this.params, postProcessing: {} };
    // === infrastructure engines (three.js addons) ===
    this.pp = null;
    this.materialsLib = null;
    this.gltf = null;
    this.webcam = null;
    try {
      const PP = window.__modules['postprocessing-engine'];
      // PP needs the three.js renderer/scene/camera — wire after orb engine init (below)
      this._PPClass = PP;
    } catch (e) { console.log('postprocessing unavailable:', e.message); }
    try {
      const ML = window.__modules['materials-library'];
      if (ML) this.materialsLib = (typeof ML === 'function') ? new ML() : ML;
    } catch (e) { console.log('materials unavailable:', e.message); }
    try {
      const GL = window.__modules['gltf-loader-engine'];
      if (GL) {
        const cls = GL.GLTFLoaderEngine || GL;
        this.gltf = (typeof cls === 'function') ? new cls() : cls;
      }
    } catch (e) { console.log('gltf unavailable:', e.message); }
    try {
      const WC = window.__modules['webcam-hdri'];
      if (WC) {
        const cls = WC.WebcamHDRI || WC;
        this.webcam = (typeof cls === 'function') ? new cls() : cls;
      }
    } catch (e) { console.log('webcam unavailable:', e.message); }
    this._init();
  }

  async _init() {
    this.gl.quad();
    // compile all programs
    this.gl.compile('main', SH.MAIN_VERT, SH.MAIN_FRAG);
    this.gl.compile('bars', SH.MAIN_VERT, SH.BARS_FRAG);
    this.gl.compile('scope', SH.MAIN_VERT, SH.SCOPE_FRAG);
    this.gl.compile('plasma', SH.MAIN_VERT, SH.PLASMA_FRAG);
    this.gl.compile('bright', SH.MAIN_VERT, SH.BRIGHT_FRAG);
    this.gl.compile('blur', SH.MAIN_VERT, SH.BLUR_FRAG);
    this.gl.compile('fade', SH.MAIN_VERT, SH.FADE_FRAG);
    this.gl.compile('particle', SH.PART_VERT, SH.PART_FRAG);
    this.gl.compile('composite', SH.MAIN_VERT, SH.COMPOSITE_FRAG);

    this.gl.initParticles(6000);

    // orb state textures
    const gl = this.gl.gl;
    this.texOrbs = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texOrbs);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_ORBS, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texOrbData = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texOrbData);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_ORBS, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // FFT + wave textures for retro modes
    this.texFft = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texFft);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1024, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.texWave = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texWave);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 2048, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // load saved custom presets
    try { this._customPresets = JSON.parse(localStorage.getItem('itv-custom-presets') || '[]'); } catch (e) { this._customPresets = []; }

    // UI
    this.ui = new UI({
      onChange: (k, v) => this.setParam(k, v),
      onApplyTheme: (t) => this.applyTheme(t),
      onApplyTemplate: (id) => this.applyTemplate(id),
      onSavePreset: (name, params) => this.saveCustomPreset(name, params),
      onDeletePreset: (name) => this.deleteCustomPreset(name),
      onApplyCustom: (name) => this.applyCustomPreset(name),
      onRandomize: () => this.randomize(),
      onResetAll: () => this.resetAll(),
      getParams: () => this.params,
      onImportMilk: (name, data) => this.importMilk(name, data),
      onImportTheme: (name, data) => this.importTheme(name, data),
      onExportTheme: () => this.exportTheme(),
      getImportedThemes: () => this._importedThemes || [],
      onQuit: () => { if (window.electronAPI) window.electronAPI.quit(); },
    });

    // audio
    this.audio = new AudioEngine(() => this.params);
    // milk re-init needs the AudioContext, so wait for audio.start to settle
    const wireMilk = () => {
      if (!this.milk) return;
      this.milk.audio = this.audio;
      if (this.milk.pending && !this.milk.ready && this.milk.init) {
        this.milk.pending = false;
        this.milk.ready = this.milk.init(window.devicePixelRatio || 1);
        if (this.milk.ready) {
          // load a default preset pack so Milk mode works out of the box
          const packs = [window.butterchurnPresetsMinimal, window.butterchurnPresetsNonMinimal, window.butterchurnPresetsExtra];
          for (const p of packs) {
            let mod = p;
            // the UMD export carries getPresets directly; calling the factory may
            // throw under CSP (new Function blocked), so check it first
            if (mod && typeof mod.getPresets !== 'function' && typeof mod === 'function') {
              try { mod = mod(); } catch (e) { /* CSP blocks new Function — skip */ }
            }
            if (mod && mod.default) mod = mod.default;
            if (mod && typeof mod.getPresets === 'function') {
              const presets = mod.getPresets();
              const keys = Object.keys(presets);
              if (keys.length) { this._milkPreset = presets[keys[Math.floor(Math.random() * keys.length)]]; break; }
            }
          }
          if (this._milkPreset) this.milk.loadPreset(this._milkPreset);
        }
      }
    };
    Promise.resolve(this.audio.start(this.params.audioSource)).then(() => {
      wireMilk();
      // double-tap in case demo path creates ctx async
      setTimeout(wireMilk, 300);
    });

    // fullscreen hint (hidden in wallpaper mode)
    this._wallpaperMode = false;
    if (window.electronAPI) {
      window.electronAPI.isWallpaper().then((wp) => {
        this._wallpaperMode = !!wp;
        this._updateFsHint();
      });
      window.electronAPI.onFullscreenChange((fs) => {
        this._fullscreen = fs;
        this._updateFsHint();
      });
    }
    const hint = document.createElement('div');
    hint.id = 'fs-hint';
    hint.textContent = 'Press ALT+Enter for fullscreen';
    document.body.appendChild(hint);
    this._fsHint = hint;

    // scene
    this.applyTheme(themeById('toxic')); // start on the reference look

    // events
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (this.ui.open) this.ui.toggle(false); else if (window.electronAPI) window.electronAPI.quit(); }
      if (e.key === 'Enter' && e.altKey && window.electronAPI) {
        e.preventDefault();
        window.electronAPI.toggleFullscreen();
        // hide hint once fullscreen toggled (assume entering)
        if (this._fsHint) this._fsHint.style.display = 'none';
      }
      // MilkDrop3-style shortcuts (credit: MilkDrop3 / BeatDrop)
      if (e.key === 'c' || e.key === 'C') this.randomizeColors();
      if (e.key === 'a' || e.key === 'A') this.cycleTheme(-1);
      if (e.key === 'z' || e.key === 'Z') this.cycleTheme(1);
      if (e.key === 'n' || e.key === 'N') { this.autoRotate = !this.autoRotate; this._beatCount = 0; }
    });
    if (window.electronAPI) {
      window.electronAPI.onCaptureScene((s) => { this.captureScene = s; this._captureT = 0; });
    }

    this.resize();
    this.running = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.resScale = this.params.adaptiveRes ? this._autoScale() : 1;
    const w = Math.max(64, Math.round(W * this.resScale));
    const h = Math.max(64, Math.round(H * this.resScale));
    this.gl.resize(w, h);
    if (this.orb) this.orb.resize(W, H);
    this._fullW = W; this._fullH = H;
  }

  // adaptive resolution: start at 1.0 (native — never pixelated), only bump up if headroom
  _autoScale() {
    if (!this._fpsAvg) return 1.0;
    const target = this.params.targetFPS;
    if (this._fpsAvg > target * 1.08 && this.resScale < 1.25) return Math.min(1.25, this.resScale + 0.04);
    if (this._fpsAvg < target * 0.85 && this.resScale > 1.0) return Math.max(1.0, this.resScale - 0.05);
    return this.resScale;
  }

  setParam(key, val) {
    const old = this.params[key];
    this.params[key] = val;
    // user touched this param — themes must NOT override it
    if (!this._userKeys) this._userKeys = new Set();
    this._userKeys.add(key);
    // material selection applies preset values to material params
    if (key === 'material') {
      const m = MATERIALS[val];
      if (m) {
        for (const k of ['viscosity', 'mergeAmount', 'reflect', 'rough', 'emissive', 'absorb', 'refract']) {
          this.params[k] = m[k];
        }
        this.ui.setParams(this.params);
      }
    }
    if (key === 'orbCount') {
      // reset scene orb count
      this.scene.reset(this.params);
    }
    if (key === 'visualMode') {
      // reset scene for mode
      this.scene.reset(this.params);
      this._toggleAudioMotion(val === 'audioMotion');
      // per-template settings: rebuild the panel for the active template
      this._applyTemplateForMode(val);
    }
    if (key === 'merge') {
      this.params.mergeAmount = val ? Math.max(this.params.mergeAmount, 0.2) : 0;
    }
    if (key === 'adaptiveRes') { this.resize(); }
    this._pushSceneConfig();
    this._ = old;
  }

  // Map a visualMode -> template id, rebuild settings panel for that template
  _applyTemplateForMode(mode) {
    if (!window.__modules.templates || !this.ui) return;
    const { TEMPLATES } = window.__modules.templates;
    const id = ({ Blob: 'blob', Milk: 'milk', audioMotion: 'audiomotion', av3d: 'av3d', 'party-mode': 'party-mode', particles: 'particles', helpers: 'helpers', 'instancing-raycast': 'instancing-raycast', lines: 'lines', points: 'points', waves: 'waves', billboards: 'billboards', marching: 'marching', pathtracer: 'pathtracer', tornado: 'tornado', fractal: 'fractal', Bars: 'raymarch', Scope: 'raymarch', Plasma: 'raymarch', Fountain: 'raymarch' })[mode] || 'orbs';
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl) this.ui.setTemplate(tpl);
  }

  // Apply a template (engine + schema) by id
  applyTemplate(id) {
    if (!window.__modules.templates) return;
    const { TEMPLATES } = window.__modules.templates;
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    this.ui.setTemplate(tpl);
    if (tpl.engine === 'iframe' || tpl.engine === 'three-template') {
      this.setParam('visualMode', id);
    } else if (tpl.id === 'orbs') {
      this.setParam('visualMode', 'Orbs');
    } else if (tpl.id === 'blob') {
      this.setParam('visualMode', 'Blob');
    } else if (tpl.id === 'milk') {
      this.setParam('visualMode', 'Milk');
    } else if (tpl.id === 'audiomotion') {
      this.setParam('visualMode', 'audioMotion');
    } else if (tpl.id === 'particles') {
      this.setParam('visualMode', 'Particles');
    } else if (tpl.id === 'raymarch') {
      this.setParam('visualMode', 'Bars');
    }
  }

  _pushSceneConfig() {    this.scene.configure(this.themeScene);
    this.scene.bandRGB = (band) => {
      const keys = [['band0HueStart', 'band0HueEnd', 'band0Sat', 'band0Light'], ['band1HueStart', 'band1HueEnd', 'band1Sat', 'band1Light'], ['band2HueStart', 'band2HueEnd', 'band2Sat', 'band2Light']];
      const k = keys[band];
      const hue = this.params[k[0]] + (this.params[k[1]] - this.params[k[0]]) * 0.5;
      return hsl2rgb(hue, this.params[k[2]], this.params[k[3]]);
    };
  }

  applyTheme(t) {
    if (!t) return;
    const p = t.params || {};
    // user-modified params win over the theme (sliders keep their value)
    const pFiltered = {};
    for (const k of Object.keys(p)) {
      if (this._userKeys && this._userKeys.has(k)) continue;
      pFiltered[k] = p[k];
    }
    const merged = Object.assign({}, DEFAULTS, this.params, pFiltered);
    // material from theme
    if (pFiltered.material && MATERIALS[pFiltered.material]) {
      const m = MATERIALS[pFiltered.material];
      for (const k of ['viscosity', 'mergeAmount', 'reflect', 'rough', 'emissive', 'absorb', 'refract']) {
        merged[k] = m[k];
      }
      // theme may still override some
      for (const k of ['viscosity', 'mergeAmount', 'reflect', 'rough', 'emissive', 'absorb', 'refract']) {
        if (k in pFiltered) merged[k] = pFiltered[k];
      }
    }
    this.params = merged;
    this.themeScene = t.scene || {};
    this.ui.setParams(this.params);
    this._pushSceneConfig();
    this.scene.configure(this.themeScene);
    this.scene.reset(this.params);
    if (this.elsTheme) this.elsTheme.value = t.id;
  }

  randomize() {
    // randomize hue bands + a few fun params
    for (let b = 0; b < 3; b++) {
      const start = Math.random() * 360;
      this.params[`band${b}HueStart`] = start;
      this.params[`band${b}HueEnd`] = (start + 40 + Math.random() * 120) % 360;
      this.params[`band${b}Sat`] = 0.6 + Math.random() * 0.4;
      this.params[`band${b}Light`] = 0.4 + Math.random() * 0.35;
    }
    this.params.lightAngle = Math.random();
    this.params.godRays = 0.6 + Math.random() * 1.2;    this.params.swirl = Math.random() * 2;
    this.params.gravity = (Math.random() - 0.6) * 1.5;
    this.ui.setParams(this.params);
    this._pushSceneConfig();
  }

  resetAll() {
    this.params = Object.assign({}, DEFAULTS);
    this.themeScene = {};
    this._userKeys = new Set();   // reset clears user overrides
    this.ui.setParams(this.params);
    this._pushSceneConfig();
    this.scene.configure({});
    this.scene.reset(this.params);
  }

  // MilkDrop3-style: C = randomize colors (credit: MilkDrop3 / BeatDrop)
  randomizeColors() {
    for (let b = 0; b < 3; b++) {
      const start = Math.random() * 360;
      this.params[`band${b}HueStart`] = start;
      this.params[`band${b}HueEnd`] = (start + 40 + Math.random() * 120) % 360;
      this.params[`band${b}Sat`] = 0.7 + Math.random() * 0.3;
    }
    this.params.lightAngle = Math.random();
    this.ui.setParams(this.params);
    this._pushSceneConfig();
  }

  // MilkDrop3-style: A / Z = prev / next theme (credit: MilkDrop3)
  cycleTheme(dir) {
    const ids = THEMES.map((t) => t.id);
    const cur = ids.indexOf((this.elsTheme && this.elsTheme.value) || this.currentThemeId || 'toxic');
    const next = (cur + dir + ids.length) % ids.length;
    this.applyTheme(themeById(ids[next]));
    this.currentThemeId = ids[next];
    this.ui.setParams(this.params);
  }

  // MilkDrop3-style: N = auto-rotate theme on beat (credit: MilkDrop3)
  _beatAutoRotate() {
    if (!this.autoRotate) return;
    this._beatCount = (this._beatCount || 0) + 1;
    if (this._beatCount >= 8) {
      this._beatCount = 0;
      this.cycleTheme(1);
    }
  }

  saveCustomPreset(name, params) {
    const p = Object.assign({}, params);
    this._customPresets.push({ name, params: p });
    localStorage.setItem('itv-custom-presets', JSON.stringify(this._customPresets));
    this.ui._renderCustomPresets();
  }
  deleteCustomPreset(name) {
    this._customPresets = this._customPresets.filter((p) => p.name !== name);
    localStorage.setItem('itv-custom-presets', JSON.stringify(this._customPresets));
    this.ui._renderCustomPresets();
  }
  applyCustomPreset(name) {
    const pr = this._customPresets.find((p) => p.name === name);
    if (!pr) return;
    this.params = Object.assign({}, DEFAULTS, pr.params);
    this.themeScene = {};
    this.ui.setParams(this.params);
    this._pushSceneConfig();
    this.scene.configure({});
    this.scene.reset(this.params);
  }

  // ---- Import / Export ----
  importMilk(name, data) {
    // .milk preset -> load into butterchurn + add as an 'Imported' theme entry
    this._milkPreset = data;
    this.params.visualMode = 'Milk';
    this.ui.setParams(this.params);
    if (this.milk) this.milk.loadPreset(data);
    // persist imported milk preset
    try {
      const imported = JSON.parse(localStorage.getItem('itv-imported-milk') || '[]');
      imported.push({ name, data });
      localStorage.setItem('itv-imported-milk', JSON.stringify(imported));
    } catch (e) {}
    this._addImportedTheme(name.replace(/\.milk$/i, ''), { visualMode: 'Milk' });
  }

  importTheme(name, data) {
    // theme .json -> add as an imported theme (params + scene)
    this._addImportedTheme(name.replace(/\.json$/i, ''), data);
  }

  _addImportedTheme(name, themeData) {
    if (!this._importedThemes) this._importedThemes = [];
    const t = {
      id: 'imported-' + Date.now(),
      name: name || 'Imported Theme',
      category: 'Imported',
      mode: themeData.visualMode || 'orbs',
      desc: 'Imported theme',
      params: Object.assign({}, DEFAULTS, themeData.params || themeData),
      scene: themeData.scene || {},
    };
    this._importedThemes.push(t);
    try {
      localStorage.setItem('itv-imported-themes', JSON.stringify(this._importedThemes.map((x) => ({ name: x.name, params: x.params, scene: x.scene, mode: x.mode }))));
    } catch (e) {}
    if (this.ui) this.ui._renderThemes(this._importedThemes);
    // apply it
    this.applyTheme(t);
    this.currentThemeId = t.id;
  }

  exportTheme() {
    return {
      name: 'Magnetosphere Theme',
      visualMode: this.params.visualMode,
      params: Object.assign({}, this.params),
      scene: Object.assign({}, this.themeScene),
    };
  }

  // ---- audioMotion overlay mode (draggable/resizable) ----
  _toggleAudioMotion(enabled) {
    if (enabled) {
      if (this._audioMotion) return;
      if (typeof window.AudioMotionAnalyzer === 'undefined') { console.warn('audioMotion lib missing'); return; }
      // build overlay window
      const wrap = document.createElement('div');
      wrap.id = 'audiomotion-window';
      const head = document.createElement('div');
      head.className = 'am-head';
      head.textContent = 'audioMotion';
      const cv = document.createElement('canvas');
      cv.className = 'am-canvas';
      const grip = document.createElement('div');
      grip.className = 'am-grip';
      grip.textContent = '⤡';
      wrap.appendChild(head); wrap.appendChild(cv); wrap.appendChild(grip);
      document.body.appendChild(wrap);

      // restore saved pos/size
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('itv-am-window') || 'null'); } catch (e) {}
      const W = window.innerWidth, H = window.innerHeight;
      const w = saved ? saved.w : Math.round(W * 0.45);
      const h = saved ? saved.h : Math.round(w * 9 / 16);
      const x = saved ? saved.x : Math.round((W - w) / 2);
      const y = saved ? saved.y : Math.round((H - h) / 2);
      wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
      wrap.style.left = x + 'px'; wrap.style.top = y + 'px';

      this._audioMotion = new window.AudioMotionAnalyzer(cv, {
        width: w, height: h, gradient: 'prism', showScale: false, showPeaks: true,
        maxFftSize: 4096, smoothing: 0.75, mode: 10, mirror: 0, radial: true, reflexRatio: 0.3,
      });
      // connect audio
      try {
        if (this.audio && this.audio.ctx && this.audio.source) {
          this.audio.source.connect(this._audioMotion.inputNode);
        }
      } catch (e) { console.warn('audioMotion audio connect failed', e); }

      // drag
      let drag = null;
      head.addEventListener('mousedown', (e) => {
        drag = { sx: e.clientX, sy: e.clientY, ox: x, oy: y, ex: wrap.offsetLeft, ey: wrap.offsetTop };
        const move = (ev) => {
          const nx = drag.ex + (ev.clientX - drag.sx);
          const ny = drag.ey + (ev.clientY - drag.sy);
          wrap.style.left = Math.max(0, Math.min(window.innerWidth - 60, nx)) + 'px';
          wrap.style.top = Math.max(0, Math.min(window.innerHeight - 30, ny)) + 'px';
          this._saveAMWindow();
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
      // resize (maintain 16:9)
      grip.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY, w: wrap.offsetWidth, h: wrap.offsetHeight };
        const move = (ev) => {
          const nw = Math.max(200, start.w + (ev.clientX - start.x));
          const nh = Math.round(nw * 9 / 16);
          wrap.style.width = nw + 'px'; wrap.style.height = nh + 'px';
          this._audioMotion.setCanvasSize(nw, nh);
          this._saveAMWindow();
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
      this._amEl = wrap;
    } else {
      // teardown
      if (this._audioMotion) {
        try { if (this.audio && this.audio.source && this._audioMotion.inputNode) this.audio.source.disconnect(this._audioMotion.inputNode); } catch (e) {}
        this._audioMotion.destroy && this._audioMotion.destroy();
        this._audioMotion = null;
      }
      if (this._amEl) { this._amEl.remove(); this._amEl = null; }
    }
  }
  _saveAMWindow() {
    const el = this._amEl;
    if (!el) return;
    try {
      localStorage.setItem('itv-am-window', JSON.stringify({
        w: el.offsetWidth, h: el.offsetHeight, x: el.offsetLeft, y: el.offsetTop,
      }));
    } catch (e) {}
  }

  _updateFsHint() {
    // hide the hint in wallpaper mode (already immersive) or when fullscreen
    if (!this._fsHint) return;
    const hidden = this._wallpaperMode || this._fullscreen;
    this._fsHint.style.display = hidden ? 'none' : 'block';
    this._fsHint.classList.remove('faded');
    // fade the hint out after 8s of idle
    if (this._fsHintTimer) clearTimeout(this._fsHintTimer);
    this._fsHintTimer = setTimeout(() => {
      if (this._fsHint && !this._wallpaperMode && !this._fullscreen) this._fsHint.classList.add('faded');
    }, 8000);
  }

  _bandCols() {    const keys = [['band0HueStart', 'band0HueEnd', 'band0Sat', 'band0Light'], ['band1HueStart', 'band1HueEnd', 'band1Sat', 'band1Light'], ['band2HueStart', 'band2HueEnd', 'band2Sat', 'band2Light']];
    return keys.map((k) => {
      const start = this.params[k[0]], end = this.params[k[1]];
      // sample across the band
      const c1 = hsl2rgb(start, this.params[k[2]], this.params[k[3]]);
      const c2 = hsl2rgb(end, this.params[k[2]], this.params[k[3]]);
      return [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2];
    });
  }

  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - (this._lastT || t)) / 1000 || 0.016);
    this._lastT = t;
    this._frameCounter++;

    // capture scene override for QA
    if (this.captureScene) {
      this._captureT += dt;
      const s = this.captureScene;
      this.audio.energy = s.energy;
      this.audio.bass = s.bass;
      this.audio.mid = s.mid;
      this.audio.treble = s.treble;
      this.audio.beat = s.beat;
      if (this._captureT > 2.5) { this.captureScene = null; }
    }

    const a = this.audio.update(dt);
    this._audioEnergy = a.energy;

    // MilkDrop3-style: N = auto-rotate theme every 8 beats
    if (a.beat > 0.5) this._beatAutoRotate();

    // scene sim (skip in 2D modes? still run for particles)
    this.scene.update(dt, a, this.params, this.themeScene);

    // upload orb state
    this.scene.upload(this.gl.gl, this.texOrbs, this.texOrbData);

    this._t = t / 1000;
    this._render(a, this._t, dt);

    // FPS
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      const fps = this.fpsFrames / this.fpsTime;
      this._fpsAvg = fps;
      this.fpsFrames = 0; this.fpsTime = 0;
      if (this.params.showFPS) this.ui.setFPS(`${Math.round(fps)} fps`);
      // adaptive resolution
      if (this.params.adaptiveRes) {
        const ns = this._autoScale();
        if (Math.abs(ns - this.resScale) > 0.001) {
          this.resScale = ns;
          this.resize();
        }
      }
    }

    requestAnimationFrame((t2) => this.loop(t2));
  }

  // ---- iframe template host (vendored repos run their native systems) ----
  _showIframe(tplId, a) {
    if (!this._iframeEl) {
      const f = document.createElement('iframe');
      f.id = 'tpl-frame';
      f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:4;background:#000;';
      // Listen for iframe ready signals (particles sends mag-particles-ready)
      window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (d && d.__mag === 'mag-particles-ready') {
          // Send params to particles template
          try { this._iframeEl.contentWindow.postMessage({ __mag: 'mag-particles-params', params: this._getParticlesParams() }, '*'); } catch(e) {}
        }
      });
      document.body.appendChild(f);
      this._iframeEl = f;
    }
    const src = 'templates/' + tplId + '/index.html';
    if (this._iframeSrc !== src) {
      this._iframeEl.src = src;
      this._iframeSrc = src;
      this._iframeReady = false;
      
      // Listen for iframe load → resize canvas when it's ready
      this._iframeEl.onload = () => {
        try {
          var doc = this._iframeEl.contentDocument || this._iframeEl.contentWindow?.document;
          if (doc) {
            var c = doc.getElementById('c') || doc.getElementById('p-canvas');
            if (c && (tplId === 'particles' || tplId === 'helpers' || tplId === 'instancing-raycast' || tplId === 'three-template')) {
              c.width = document.body.clientWidth;
              c.height = document.body.clientHeight;
              // Notify iframe to redraw
              this._iframeEl.contentWindow.postMessage({ __mag: 'mag-' + tplId + '-resize', w: c.width, h: c.height }, '*');
            }
          }
          this._iframeReady = true;
        } catch(e) { /* cross-origin or other error */ }
      };
    }
    this._iframeEl.style.display = 'block';
    if (a) {
      const msg = { __mag: 'mag-audio', fft: a.fft, wave: a.wave, energy: a.energy, bass: a.bass, mid: a.mid, treble: a.treble, beat: a.beat };
      try { this._iframeEl.contentWindow.postMessage(msg, '*'); } catch (e) {}
    }
    // Send params to particles/av3d templates
    if (tplId === 'particles' || tplId === 'av3d' || tplId === 'instancing-raycast') {
      try { this._iframeEl.contentWindow.postMessage({ __mag: 'mag-' + tplId + '-params', params: this._getTemplateParams(tplId) }, '*'); } catch (e) {}
    }
  }

  _hideIframe() {
    if (this._iframeEl) this._iframeEl.style.display = 'none';
  }

  _render(a, time, dt) {
    const gl = this.gl.gl;
    const eng = this.gl;
    const p = this.params;
    const vis = p.visualMode;

    if (vis === 'Milk' && this.milk && this.milk.ready) {
      if (this.milk.setVisible) this.milk.setVisible(true);
      // butterchurn uses null audio + our getAudioLevels feed in milk.render()
      if (this._milkPreset && this.milk._preset !== this._milkPreset) {
        this.milk.loadPreset(this._milkPreset);
      }
      this.milk.render(dt);
      return;
    } else if (this.milk && this.milk.setVisible) {
      this.milk.setVisible(false);
    }

    // ---- three.js path for orb modes ----
    const isOrbMode = vis === 'Orbs' || vis === 'Blob' || vis === undefined;
    if (isOrbMode && this.orb && this.orb.ready && p.useThree !== 0) {
      this._hideIframe();
      this.orb.setLights(this.themeScene);
      this.orb.updateOrbs(this.scene.orbs, p, this._bandCols(), a.energy, a.beat);
      this.orb.updateParticles(this.scene.particles);
      this.orb.render(time, a.energy, a.beat);
      // global post-processing stack on top of the three.js orb render
      if (this.pp && this.pp.composer && this.pp.hasEnabled()) {
        try {
          this.pp.apply(time);
          this.pp.composer.render();
        } catch (e) { /* PP unavailable for this frame */ }
      }
      // skip raymarch FBO path entirely
      return;
    }

    // ---- iframe template path (vendored repos run their native systems) ----
    const iframeTplKey = vis.toLowerCase();
    const iframeMap = { blob: null, milk: null, audiomotion: null, bars: null, scope: null, plasma: null, fountain: null, av3d: 'av3d', 'party-mode': 'party-mode', particles: 'particles', helpers: 'helpers', 'instancing-raycast': 'instancing-raycast', lines: 'three-template', points: 'three-template', waves: 'three-template', billboards: 'three-template', marching: 'three-template', pathtracer: 'three-template', tornado: 'three-template', fractal: 'three-template' };
    const iframeTpl = iframeMap[iframeTplKey];
    if (iframeTpl) {
      this._showIframe(iframeTpl, a);
      // send theme key + params to three-template host
      if (iframeTpl === 'three-template') {
        try {
          const tp = Object.assign({ theme: iframeTplKey }, this._getTemplateParams(iframeTplKey));
          this._iframeEl.contentWindow.postMessage({ __mag: 'mag-three-template-params', params: tp }, '*');
        } catch (e) {}
      }
      return;
    }
    this._hideIframe();

    const bandCols = this._bandCols();
    const bgCol = hsl2rgb(p.bgHue, p.bgSat, p.bgLight);
    const fogCol = hsl2rgb(p.fogColHue, p.fogColSat, p.fogColLight);
    const lightCol = hsl2rgb(p.lightColHue, p.lightColSat, p.lightColLight);

    // render scene into scene FBO
    const progName = vis === 'Bars' ? 'bars' : (vis === 'Scope' ? 'scope' : (vis === 'Plasma' ? 'plasma' : 'main'));
    eng.use(progName);
    gl.bindFramebuffer(gl.FRAMEBUFFER, eng.scene.fbo);
    gl.viewport(0, 0, eng.W, eng.H);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (progName === 'main') {
      this._setMainUniforms(eng, a, time, bandCols, bgCol, fogCol, lightCol);
      // orb textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texOrbs);
      eng.set1i('main', 'uOrbs', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texOrbData);
      eng.set1i('main', 'uOrbData', 1);
    } else {
      this._set2DUniforms(eng, a, time, bandCols, bgCol, progName);
      // FFT / wave textures
      this._uploadAudioTex(a);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texFft);
      eng.set1i(progName, 'uFft', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texWave);
      eng.set1i(progName, 'uWave', 1);
    }
    gl.bindVertexArray(eng.quad());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    // particles into trails FBO
    this._renderParticles(eng, a, time, dt);

    // bloom
    let bloomTex = eng.scene.color;
    if (p.bloom) {
      bloomTex = this._doBloom(eng, eng.scene.color, p.bloomIntensity);
    }

    // composite to screen
    eng.use('composite');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._fullW || eng.W, this._fullH || eng.H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, eng.scene.color);
    eng.set1i('composite', 'uScene', 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    eng.set1i('composite', 'uBloom', 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, eng.trails.color);
    eng.set1i('composite', 'uTrails', 2);
    eng.set1f('composite', 'uBloomIntensity', p.bloom ? p.bloomIntensity : 0);
    eng.set1f('composite', 'uVignette', p.vignette);
    eng.set1f('composite', 'uScanlines', p.scanlines);
    eng.set1f('composite', 'uChromatic', p.chromatic);
    eng.set1f('composite', 'uEnergy', a.energy);
    eng.set1f('composite', 'uBeat', a.beat);
    eng.set1f('composite', 'uFilmGrain', p.filmGrain || 0);
    eng.set1f('composite', 'uPosterize', p.posterize || 0);
    eng.set1f('composite', 'uSharpen', p.sharpen || 0);
    eng.set1f('composite', 'uPixelize', p.pixelize || 0);
    eng.set1f('composite', 'uTime', this._t || 0);
    eng.set2f('composite', 'uRes', eng.W, eng.H);
    gl.bindVertexArray(eng.quad());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _setMainUniforms(eng, a, time, bandCols, bgCol, fogCol, lightCol) {
    const p = this.params;
    eng.set2f('main', 'uRes', eng.W, eng.H);
    eng.set1f('main', 'uTime', time);
    eng.set1f('main', 'uEnergy', a.energy);
    eng.set1f('main', 'uBass', a.bass);
    eng.set1f('main', 'uMid', a.mid);
    eng.set1f('main', 'uTreble', a.treble);
    eng.set1f('main', 'uBeat', a.beat);
    eng.set1i('main', 'uOrbCount', this.scene.orbs.length);
    // camera: slow orbit
    const camT = 0; // FIXED camera - never orbits
    const eye = [0, 0.6, 2.6];
    const center = [0, 0, 0];
    const up = [0, 1, 0];
    const z = norm3(sub3(center, eye));
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    const cam = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
    eng.setMat3('main', 'uCam', cam);
    eng.set3fv('main', 'uCamPos', eye);
    eng.set1f('main', 'uZoom', 1.5);
    eng.set1f('main', 'uLightAngle', p.lightAngle);
    eng.set3fv('main', 'uLightCol', lightCol);
    eng.set3fv('main', 'uFogCol', fogCol);
    eng.set1f('main', 'uFogDensity', p.fogDensity);
    eng.set1f('main', 'uGodRays', p.godRays);
    eng.set1f('main', 'uMergeAmount', p.merge ? p.mergeAmount : 0);
    eng.set1f('main', 'uReflect', p.reflect);
    eng.set1f('main', 'uRough', p.rough);
    eng.set1f('main', 'uEmissive', p.emissive);
    eng.set1f('main', 'uAbsorb', p.absorb);
    eng.set1f('main', 'uRefract', p.refract);
    for (let i = 0; i < 3; i++) {
      eng.set3fv('main', `uBandCol[${i}]`, bandCols[i]);
    }
    eng.set1f('main', 'uColorMix', p.colorMix);
    eng.set3fv('main', 'uBgCol', bgCol);
    eng.set1f('main', 'uBgGlow', p.bgGlow);
    eng.set1f('main', 'uStarDensity', p.starDensity);
    eng.set1f('main', 'uStarBright', p.starBright);
    eng.set1f('main', 'uStarTwinkle', p.starTwinkle);
    eng.set1f('main', 'uStarSpeed', p.starSpeed);
    eng.set1f('main', 'uChromatic', p.chromatic);
    eng.set1f('main', 'uBeatFlash', p.beatFlash);
    eng.set1f('main', 'uHeatLamp', p.heatLamp);
    eng.set1f('main', 'uQuality', p.quality);
    eng.set1f('main', 'uDebugField', (new URLSearchParams(location.search).get('debug') === '1') ? 1 : 0);
    eng.set1f('main', 'uDebugOrbs', (new URLSearchParams(location.search).get('orbs') === '1') ? 1 : 0);
    eng.set1f('main', 'uBlackHole', (this.themeScene && (this.themeScene.suck || this.themeScene.bigCore)) ? 1 : 0);
    eng.set1f('main', 'uMetallic', (this.params.material === 'Metal' || this.params.metallic) ? 1 : 0);
  }

  _set2DUniforms(eng, a, time, bandCols, bgCol, progName) {
    const p = this.params;
    eng.set2f(progName, 'uRes', eng.W, eng.H);
    eng.set1f(progName, 'uTime', time);
    eng.set1f(progName, 'uEnergy', a.energy);
    eng.set1f(progName, 'uBass', a.bass);
    eng.set1f(progName, 'uBeat', a.beat);
    for (let i = 0; i < 3; i++) eng.set3fv(progName, `uBandCol[${i}]`, bandCols[i]);
    eng.set3fv(progName, 'uBgCol', bgCol);
  }

  _uploadAudioTex(a) {
    const gl = this.gl.gl;
    if (a.fft) {
      gl.bindTexture(gl.TEXTURE_2D, this.texFft);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.fft.length, 1, gl.RED, gl.UNSIGNED_BYTE, a.fft);
    }
    if (a.wave) {
      gl.bindTexture(gl.TEXTURE_2D, this.texWave);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.wave.length, 1, gl.RED, gl.UNSIGNED_BYTE, a.wave);
    }
  }

  _renderParticles(eng, a, time, dt) {
    const gl = this.gl.gl;
    const p = this.params;
    // fade trails: copy current trails -> scratch (faded), then back
    eng.use('fade');
    gl.bindFramebuffer(gl.FRAMEBUFFER, eng.scratch.fbo);
    gl.viewport(0, 0, eng.scratch.w, eng.scratch.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, eng.trails.color);
    eng.set1i('fade', 'uTex', 0);
    eng.set1f('fade', 'uFade', p.motionBlur);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(eng.quad());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    // copy scratch back to trails
    eng.use('fade');
    gl.bindFramebuffer(gl.FRAMEBUFFER, eng.trails.fbo);
    gl.viewport(0, 0, eng.trails.w, eng.trails.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, eng.scratch.color);
    eng.set1i('fade', 'uTex', 0);
    eng.set1f('fade', 'uFade', 1.0);
    gl.bindVertexArray(eng.quad());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // draw particles additively
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    // build projection/view from current camera
    const fov = 1.2;
    const near = 0.1, far = 30;
    const aspect = eng.W / Math.max(1, eng.H);
    const f = 1 / Math.tan(fov / 2);
    const proj = [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ];
    // view = inverse of camera (camera is orbit around origin)
    const camT = 0; // FIXED camera
    const eye = [0, 0.6, 2.6];
    const center = [0, 0, 0], up = [0, 1, 0];
    const z = norm3(sub3(center, eye));
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    const view = [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
    ];

    // fill particle buffer from scene
    const pts = this.scene.particles;
    eng.clearParticles();
    for (const pt of pts) {
      const fade = pt.life / pt.maxLife;
      eng.addParticle(pt.x, pt.y, pt.z, pt.r, pt.g, pt.b, pt.size * (1 + a.energy), fade);
    }
    eng.drawParticles(proj, view, eng.H / 2 / Math.tan(fov / 2), eng.scene.depth, eng.W, eng.H);
    gl.disable(gl.BLEND);
  }

  _doBloom(eng, srcTex, intensity) {
    const gl = this.gl.gl;
    const p = this.params;
    // bright pass — energy-adaptive threshold: more music = more glow
    const thr = 0.55 - (this._audioEnergy || 0) * 0.2;
    eng.use('bright');
    gl.bindFramebuffer(gl.FRAMEBUFFER, eng.bloomA.fbo);
    gl.viewport(0, 0, eng.bloomA.w, eng.bloomA.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    eng.set1i('bright', 'uTex', 0);
    eng.set1f('bright', 'uThreshold', thr);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(eng.quad()); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    // 4 blur passes (2x H+V): tight core glow + wide soft halo
    for (let i = 0; i < 4; i++) {
      eng.use('blur');
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.bloomB.fbo);
      gl.viewport(0, 0, eng.bloomB.w, eng.bloomB.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, eng.bloomA.color);
      eng.set1i('blur', 'uTex', 0);
      eng.set2f('blur', 'uDir', i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 0 : 1);
      eng.set2f('blur', 'uRes', eng.bloomA.w, eng.bloomA.h);
      // wider tap spread on later passes = soft halo
      eng.set2f('blur', 'uSpread', i >= 2 ? 2.2 : 1.0);
      gl.bindVertexArray(eng.quad()); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      eng.use('blur');
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.bloomA.fbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, eng.bloomB.color);
      eng.set1i('blur', 'uTex', 0);
      eng.set2f('blur', 'uDir', i % 2 === 0 ? 0 : 1, i % 2 === 0 ? 1 : 0);
      eng.set2f('blur', 'uRes', eng.bloomB.w, eng.bloomB.h);
      eng.set2f('blur', 'uSpread', i >= 2 ? 2.2 : 1.0);
      gl.bindVertexArray(eng.quad()); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    }
    return eng.bloomA.color;
  }
}

// vector helpers
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

window.__app = null;
window.addEventListener('load', () => { try { window.__app = new App(); } catch (e) { console.error(e); document.body.innerHTML = '<pre style="color:#0f0;font-family:monospace;padding:20px">' + (e && e.stack ? e.stack : e) + '</pre>'; } });
