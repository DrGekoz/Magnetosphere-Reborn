(function(){
'use strict';
// Audio analysis: system audio loopback (getDisplayMedia with no picker via
// main-process handler), AnalyserNode FFT, beat detection, waveform for scope.
// Also a demo mode (synthetic beat) when no audio device responds.

class AudioEngine {
  constructor(getParams) {
    this.getParams = getParams;
    this.ctx = null;
    this.analyser = null;
    this.fft = null;
    this.wave = null;
    this.energy = 0; this.bass = 0; this.mid = 0; this.treble = 0; this.beat = 0;
    this.smooth = 0;
    this.running = false;
    this.source = null;
    this.mediaStream = null;
    this.demo = false;
    this.demoT = 0;
    this._beatState = { level: 0, last: 0 };
    this._bands = { bass: 0, mid: 0, treble: 0 };
    this._bandSm = { bass: 0, mid: 0, treble: 0 };
  }

  async start(sourceName) {
    try { await this.stop(); } catch (e) {}
    if (sourceName === 'Demo') { this.startDemo(); return; }
    try {
      // capture system audio: the main-process handler serves the screen source
      // with audio:'loopback' — getDisplayMedia('audio') resolves without a picker
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // We only need the audio track
      this.mediaStream.getVideoTracks().forEach((t) => t.stop());
      const audioTrack = this.mediaStream.getAudioTracks()[0];
      if (!audioTrack) throw new Error('no audio track');
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      this._setup();
      this.running = true;
      this.demo = false;
    } catch (e) {
      console.warn('loopback failed, demo mode:', e.message);
      this.startDemo();
    }
  }

  _setup() {
    const ac = this.ctx;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    if (this.source) this.source.connect(this.analyser);
    this.fft = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
  }

  startDemo() {
    this.demo = true;
    this.running = true;
    this.demoT = 0;
    if (!this.ctx) { this.ctx = new AudioContext(); this._setup(); }
  }

  async stop() {
    if (this.mediaStream) { this.mediaStream.getTracks().forEach((t) => t.stop()); this.mediaStream = null; }
    if (this.source) { try { this.source.disconnect(); } catch (e) {} this.source = null; }
    if (this.ctx) { try { await this.ctx.close(); } catch (e) {} this.ctx = null; }
    this.analyser = null; this.fft = null; this.wave = null;
    this.running = false;
  }

  // one-frame update; returns {energy,bass,mid,treble,beat, fft, wave}
  getAudioLevels() {
    // butterchurn/MilkDrop2 expects {timeByteArray, timeByteArrayL, timeByteArrayR}
    if (!this.analyser) {
      const zero = new Uint8Array(2048);
      return { timeByteArray: zero, timeByteArrayL: zero, timeByteArrayR: zero };
    }
    const L = new Uint8Array(this.analyser.fftSize);
    const R = new Uint8Array(this.analyser.fftSize);
    try {
      this.analyser.getByteTimeDomainData(this.wave || L);
      this.analyser.getByteTimeDomainData(L);
      this.analyser.getByteTimeDomainData(R);
    } catch (e) {}
    return { timeByteArray: this.wave || L, timeByteArrayL: L, timeByteArrayR: R };
  }

  // butterchurn wants `numSamps` too
  get numSamps() { return this.analyser ? this.analyser.frequencyBinCount : 512; }

  update(dt) {
    const p = this.getParams();
    if (this.demo) {
      this.demoT += dt;
      const t = this.demoT;
      // synthetic 128bpm-ish beat with bass thump + shimmer
      const bpm = 2.1;
      const ph = t * bpm;
      const beatEnv = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 6);
      const bassEnv = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 2);
      const wob = 0.5 + 0.5 * Math.sin(t * 1.7);
      this.energy = 0.25 + 0.6 * beatEnv + 0.15 * wob;
      this.bass = 0.15 + 0.8 * bassEnv;
      this.mid = 0.2 + 0.5 * Math.max(beatEnv, 0.3 * Math.sin(t * 5.3) + 0.5);
      this.treble = 0.1 + 0.5 * (0.5 + 0.5 * Math.sin(t * 9.1)) * (0.3 + 0.7 * beatEnv);
      this.beat = beatEnv;
      this.smooth = this.energy;
      return this._demoFrame();
    }
    if (!this.analyser) return this._zero();
    this.analyser.getByteFrequencyData(this.fft);
    this.analyser.getByteTimeDomainData(this.wave);

    const s = p.sensitivity;
    const bassBias = p.bassBias;
    const fft = this.fft;
    const n = fft.length;
    const bassEnd = Math.floor(n * 0.06);
    const midEnd = Math.floor(n * 0.3);
    let bSum = 0, mSum = 0, tSum = 0;
    for (let i = 1; i < bassEnd; i++) bSum += fft[i];
    for (let i = bassEnd; i < midEnd; i++) mSum += fft[i];
    for (let i = midEnd; i < n; i++) tSum += fft[i];
    const bAvg = bSum / bassEnd / 255;
    const mAvg = mSum / (midEnd - bassEnd) / 255;
    const tAvg = tSum / (n - midEnd) / 255;

    const sm = p.smoothing;
    this._bandSm.bass += (bAvg - this._bandSm.bass) * sm;
    this._bandSm.mid += (mAvg - this._bandSm.mid) * sm;
    this._bandSm.treble += (tAvg - this._bandSm.treble) * sm;

    this.bass = Math.min(1.5, this._bandSm.bass * s * (0.7 + bassBias * 0.6));
    this.mid = Math.min(1.5, this._bandSm.mid * s * 0.9);
    this.treble = Math.min(1.5, this._bandSm.treble * s);

    const total = (bAvg * 0.5 + mAvg * 0.3 + tAvg * 0.2) * s;
    this.energy += (Math.min(1.5, total) - this.energy) * 0.35;

    // beat detection (energy envelope)
    const thresh = p.beatThreshold;
    const inst = total;
    this._beatState.level = Math.max(inst * 1.2, this._beatState.level * 0.93);
    const now = performance.now();
    if (inst > thresh && this._beatState.level > 0.5 && now - this._beatState.last > 180) {
      this.beat = 1.0;
      this._beatState.last = now;
    } else {
      this.beat *= 0.88;
    }
    this.smooth = this.energy;
    return { energy: this.energy, bass: this.bass, mid: this.mid, treble: this.treble, beat: this.beat, fft: this.fft, wave: this.wave };
  }

  _zero() { return { energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, fft: null, wave: null }; }
  _demoFrame() {
    // synthetic fft + wave so retro modes still render
    const fft = new Uint8Array(1024);
    const wave = new Uint8Array(2048);
    for (let i = 0; i < 1024; i++) {
      const f = i / 1024;
      fft[i] = Math.min(255, (this.bass * 255 * Math.exp(-f * 3)) + (this.mid * 200 * Math.exp(-f * 9)) + (this.treble * 120 * Math.sin(f * 40 + this.demoT * 8) + 120));
    }
    for (let i = 0; i < 2048; i++) {
      const x = i / 2048;
      wave[i] = 128 + 90 * (Math.sin(x * 40 + this.demoT * 6) * 0.5 + Math.sin(x * 7 - this.demoT * 3) * 0.3 + Math.sin(x * 113 + this.demoT * 11) * 0.2) * (0.4 + this.bass);
    }
    return { energy: this.energy, bass: this.bass, mid: this.mid, treble: this.treble, beat: this.beat, fft, wave };
  }
}

module.exports = AudioEngine;
if (typeof window !== "undefined" && window.__export) { window.__export("audio", module.exports); }

})();
