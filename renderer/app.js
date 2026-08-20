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
      onSavePreset: (name, params) => this.saveCustomPreset(name, params),
      onDeletePreset: (name) => this.deleteCustomPreset(name),
      onApplyCustom: (name) => this.applyCustomPreset(name),
      onRandomize: () => this.randomize(),
      onResetAll: () => this.resetAll(),
      onQuit: () => { if (window.electronAPI) window.electronAPI.quit(); },
    });

    // audio
    this.audio = new AudioEngine(() => this.params);
    this.audio.start(this.params.audioSource);

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
    }
    if (key === 'merge') {
      this.params.mergeAmount = val ? Math.max(this.params.mergeAmount, 0.2) : 0;
    }
    if (key === 'adaptiveRes') { this.resize(); }
    this._pushSceneConfig();
    this._ = old;
  }

  _pushSceneConfig() {
    this.scene.configure(this.themeScene);
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
    const merged = Object.assign({}, DEFAULTS, this.params, p);
    // material from theme
    if (p.material && MATERIALS[p.material]) {
      const m = MATERIALS[p.material];
      for (const k of ['viscosity', 'mergeAmount', 'reflect', 'rough', 'emissive', 'absorb', 'refract']) {
        merged[k] = m[k];
      }
      // theme may still override some
      for (const k of ['viscosity', 'mergeAmount', 'reflect', 'rough', 'emissive', 'absorb', 'refract']) {
        if (k in p) merged[k] = p[k];
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
    this.params.godRays = 0.6 + Math.random() * 1.2;
    this.params.swirl = Math.random() * 2;
    this.params.gravity = (Math.random() - 0.6) * 1.5;
    this.ui.setParams(this.params);
    this._pushSceneConfig();
  }

  resetAll() {
    this.params = Object.assign({}, DEFAULTS);
    this.themeScene = {};
    this.ui.setParams(this.params);
    this._pushSceneConfig();
    this.scene.configure({});
    this.scene.reset(this.params);
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

    // scene sim (skip in 2D modes? still run for particles)
    this.scene.update(dt, a, this.params, this.themeScene);

    // upload orb state
    this.scene.upload(this.gl.gl, this.texOrbs, this.texOrbData);

    this._render(a, t / 1000, dt);

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

  _render(a, time, dt) {
    const gl = this.gl.gl;
    const eng = this.gl;
    const p = this.params;
    const vis = p.visualMode;

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
    // bright pass
    eng.use('bright');
    gl.bindFramebuffer(gl.FRAMEBUFFER, eng.bloomA.fbo);
    gl.viewport(0, 0, eng.bloomA.w, eng.bloomA.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    eng.set1i('bright', 'uTex', 0);
    eng.set1f('bright', 'uThreshold', 0.55);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(eng.quad()); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    // blur x2
    for (let i = 0; i < 2; i++) {
      eng.use('blur');
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.bloomB.fbo);
      gl.viewport(0, 0, eng.bloomB.w, eng.bloomB.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, eng.bloomA.color);
      eng.set1i('blur', 'uTex', 0);
      eng.set2f('blur', 'uDir', 1, 0);
      eng.set2f('blur', 'uRes', eng.bloomA.w, eng.bloomA.h);
      gl.bindVertexArray(eng.quad()); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      eng.use('blur');
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.bloomA.fbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, eng.bloomB.color);
      eng.set1i('blur', 'uTex', 0);
      eng.set2f('blur', 'uDir', 0, 1);
      eng.set2f('blur', 'uRes', eng.bloomB.w, eng.bloomB.h);
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
