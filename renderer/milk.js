'use strict';
// MilkDrop shader support via butterchurn (credit: https://github.com/jberg/butterchurn)
// Loads .milk presets (MilkDrop 2 format) and renders them fullscreen as a visual mode.
// Audio is fed from our AudioEngine's analyser.

(function () {
  class MilkEngine {
    constructor(canvas, audioEngine) {
      this.canvas = canvas;
      this.audio = audioEngine;
      this.visualizer = null;
      this.ready = false;
      this._preset = null;
      // separate overlay canvas so butterchurn's WebGL context doesn't clash with ours
      this.overlay = document.createElement('canvas');
      this.overlay.id = 'milk-canvas';
      this.overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:5;pointer-events:none;';
      this.overlay.width = this.canvas.width || 800;
      this.overlay.height = this.canvas.height || 500;
      document.body.appendChild(this.overlay);
    }

    // audioEngine must expose: source (MediaStreamAudioSourceNode) OR analyser
    init(devicePixelRatio) {
      if (typeof window.butterchurn === 'undefined') return false;
      this._dpr = devicePixelRatio || 1;
      // butterchurn REQUIRES a real AudioContext (createDelay/createAnalyser) — no null.
      // If we don't have one yet, mark pending; app wires audio later and calls init again.
      if (!(this.audio && this.audio.ctx && typeof this.audio.ctx.createDelay === 'function')) {
        this.pending = true;
        return false;
      }
      return this._createVisualizer();
    }

    _createVisualizer() {
      if (typeof window.butterchurn === 'undefined') return false;
      try {
        this.visualizer = window.butterchurn.default.createVisualizer(this.audio.ctx, this.overlay, {
          width: this.overlay.width || 800,
          height: this.overlay.height || 500,
          pixelRatio: Math.min(this._dpr || 1, 1.5),
          meshWidth: 48,
          meshHeight: 36,
        });
        this._err = null;
        // feed audio: connect our media source node so butterchurn samples it
        try {
          if (this.audio && this.audio.source) this.visualizer.connectAudio(this.audio.source);
          else if (this.audio && this.audio.ctx && this.audio.analyser) this.visualizer.connectAudio(this.audio.analyser);
        } catch (e) { console.log('[milk] audio connect:', e.message); }
        this.ready = true;
        return true;
      } catch (e) {
        console.log('[milk] init failed:', e.message);
        this._err = e.message;
        return false;
      }
    }

    loadPreset(presetObj) {
      if (!this.visualizer || !presetObj) return;
      this._preset = presetObj;
      try { this.visualizer.loadPreset(presetObj, 1.0); } catch (e) { console.log('[milk] loadPreset failed:', e.message); }
    }

    render(elapsed) {
      if (!this.visualizer) return;
      try {
        const opts = { elapsedTime: elapsed };
        // feed audio levels from our engine (butterchurn's audioLevels path)
        if (this.audio && typeof this.audio.getAudioLevels === 'function') {
          opts.audioLevels = this.audio.getAudioLevels();
        }
        this.visualizer.render(opts);
      } catch (e) { /* swallow per-frame errors */ }
    }

    resize(w, h) {
      if (!this.visualizer) return;
      try {
        this.overlay.width = w; this.overlay.height = h;
        this.visualizer.setRendererSize(w, h, {});
      } catch (e) {}
    }

    setVisible(v) {
      this.overlay.style.display = v ? 'block' : 'none';
    }

    destroy() {
      this.ready = false;
      this.visualizer = null;
      if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    }
  }

  module.exports = MilkEngine;
  if (typeof window !== 'undefined' && window.__export) { window.__export('milk', module.exports); }
})();
