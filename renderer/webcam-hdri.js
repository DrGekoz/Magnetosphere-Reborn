'use strict';
// webcam-hdri.js — Webcam capture → real-time texture → environment mapping.
// Uses window.THREE (UMD vendor/three.js). getUserMedia → video element → canvas read → DataTexture → envMap.
(function () {
const T = window.THREE;
if (!T) return console.warn('[webcam] THREE not loaded');

/**
 * WebcamHDRI: Captures webcam feed, reads frames into a DataTexture,
 * and can apply it as an envMap to any MeshPhysicalMaterial or other physical material.
 */
class WebcamHDRI {
  constructor(options) {
    options = options || {};
    this.enabled = false;
    this.stream = null;
    this.videoEl = null;
    this.canvasEl = null;
    this.ctx2d = null;
    this.dataTexture = null;
    this.isVideoTexture = false;
    this.resolution = options.resolution || '640x480'; // width x height
    this.quality = options.quality || 0.92;             // for data quality
    this.sourceId = options.sourceId || null;           // camera device ID
    this.fpsTarget = options.fpsTarget || 30;
    this.frameInterval = Math.floor(1000 / this.fpsTarget);
    this.lastFrameTime = 0;
    this._frameCount = 0;
    this.activeObjects = [];       // meshes that have envMap applied
    this.envMapIntensity = 1.0;
    this.autoStart = options.autoStart !== false;

    // Progress/error callbacks
    this.onReady = options.onReady || null;
    this.onError = options.onError || null;

    // Resolution parse
    const [w, h] = this.resolution.split('x').map(Number);
    this.width = w || 640;
    this.height = h || 480;
  }

  /** Start capturing from webcam */
  async start() {
    try {
      if (this.stream) {
        this.stop();
      }

      // Build constraints
      const constraints = {
        video: {
          width: { ideal: this.width },
          height: { ideal: this.height },
          frameRate: { ideal: this.fpsTarget },
        },
        audio: false,
      };

      // If specific camera requested
      if (this.sourceId) {
        constraints.video.deviceId = { exact: this.sourceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!this.stream) throw new Error('getUserMedia returned null stream');

      // Create video element
      this.videoEl = document.createElement('video');
      this.videoEl.srcObject = this.stream;
      this.videoEl.setAttribute('playsinline', '');
      this.videoEl.muted = true;
      this.videoEl.autoplay = true;
      this.videoEl.playsInline = true;
      this.videoEl.volume = 0;

      // Wait for metadata
      await new Promise((resolve, reject) => {
        this.videoEl.onloadedmetadata = () => {
          this.videoEl.play().then(resolve).catch(reject);
        };
        this.videoEl.onerror = () => reject(new Error('Video element error'));
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });

      // Create canvas for reading frames
      this.canvasEl = document.createElement('canvas');
      this.canvasEl.width = this.videoEl.videoWidth || this.width;
      this.canvasEl.height = this.videoEl.videoHeight || this.height;
      this.ctx2d = this.canvasEl.getContext('2d', { willReadFrequently: true });

      // Create DataTexture for Three.js
      // Initialize with zeros (will update in render loop)
      const pixels = new Uint8Array(this.canvasEl.width * this.canvasEl.height * 4);
      this.dataTexture = new T.DataTexture(pixels, this.canvasEl.width, this.canvasEl.height, T.RGBAFormat);
      this.dataTexture.minFilter = T.LinearFilter;
      this.dataTexture.magFilter = T.LinearFilter;
      this.dataTexture.needsUpdate = true;
      this.dataTexture.generateMipmaps = false;

      // Also create a VideoTexture for direct application (lower latency)
      try {
        this.videoTex = new T.VideoTexture(this.videoEl);
        this.videoTex.minFilter = T.LinearFilter;
        this.videoTex.magFilter = T.LinearFilter;
        this.videoTex.format = T.RGBAFormat;
        this.videoTex.flipY = false;
        this.isVideoTexture = true;
      } catch(e) {
        console.log('[webcam] VideoTexture fallback:', e.message);
        this.videoTex = null;
      }

      this.enabled = true;

      // Apply envMap to registered objects
      this.applyToObjects();

      // Start render loop
      if (typeof this.onReady === 'function') this.onReady(this.dataTexture);

      console.log(`[webcam] Started at ${this.canvasEl.width}x${this.canvasEl.height}`);
      return this.dataTexture;
    } catch(err) {
      console.error('[webcam] Failed to start:', err.message);
      if (typeof this.onError === 'function') this.onError(err.message);
      this.enabled = false;
      return null;
    }
  }

  /** Stop capturing */
  stop() {
    this.enabled = false;

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }

    if (this.dataTexture) {
      this.dataTexture.dispose();
      this.dataTexture = null;
    }

    if (this.videoTex) {
      this.videoTex.dispose();
      this.videoTex = null;
    }

    this.activeObjects = [];
    console.log('[webcam] Stopped');
  }

  /** Read a single frame from video into dataTexture */
  _updateDataTexture() {
    if (!this.videoEl || !this.ctx2d || !this.dataTexture) return;

    const now = performance.now();
    if (now - this.lastFrameTime < this.frameInterval) return;
    this.lastFrameTime = now;

    try {
      // Draw current video frame to canvas
      const cw = this.canvasEl.width;
      const ch = this.canvasEl.height;
      this.ctx2d.drawImage(this.videoEl, 0, 0, cw, ch);

      // Get pixel data
      const imageData = this.ctx2d.getImageData(0, 0, cw, ch);
      const pixels = imageData.data;

      // Update texture
      this.dataTexture.image = imageData;
      this.dataTexture.needsUpdate = true;
      this._frameCount++;
    } catch(err) {
      console.warn('[webcam] Frame read failed:', err.message);
    }
  }

  /** Update method to call each frame while enabled */
  update() {
    if (!this.enabled) return;
    this._updateDataTexture();
  }

  /** Apply envMap to a mesh/material */
  applyToMesh(mesh) {
    if (!this.enabled || (!this.dataTexture && !this.videoTex)) return;
    if (!mesh || !mesh.material) return;

    const tex = this.videoTex || this.dataTexture;
    
    if (mesh.isMesh || mesh.isInstancedMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(mat => {
        mat.envMap = tex;
        mat.envMapIntensity = this.envMapIntensity;
        mat.needsUpdate = true;
        if (!this.activeObjects.includes(mat)) {
          this.activeObjects.push(mat);
        }
      });
    }
  }

  /** Remove envMap from a mesh */
  removeFromMesh(mesh) {
    if (!mesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(mat => {
      mat.envMap = null;
      mat.needsUpdate = true;
    });
  }

  /** Apply envMap to all active tracked objects */
  applyToObjects() {
    if (!this.enabled || (!this.dataTexture && !this.videoTex)) return;
    const tex = this.videoTex || this.dataTexture;
    for (const obj of this.activeObjects) {
      obj.envMap = tex;
      obj.envMapIntensity = this.envMapIntensity;
      obj.needsUpdate = true;
    }
  }

  /** Set envMap intensity on all tracked objects */
  setEnvMapIntensity(intensity) {
    this.envMapIntensity = intensity;
    if (this.enabled) this.applyToObjects();
  }

  /** Switch resolution without restarting */
  changeResolution(newW, newH) {
    if (this.videoEl && this.stream) {
      // Cannot easily change resolution mid-stream, restart required
      this.resolution = `${newW}x${newH}`;
      this.width = newW;
      this.height = newH;
      this.start();
    }
  }

  /** Check if a camera is available */
  static async isAvailable() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(d => d.kind === 'videoinput');
    } catch(e) {
      return false;
    }
  }

  /** List available cameras */
  static async listCameras() {
    try {
      // Request temporary access to enumerate
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput').map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${devices.filter(dd => dd.kind === 'videoinput').indexOf(d) + 1}`,
      }));
    } catch(e) {
      console.warn('[webcam] Cannot enumerate cameras:', e.message);
      return [];
    }
  }

  /** Dispose everything */
  dispose() {
    this.stop();
  }
}

// ---- UI Panel Section Creator ----
function createWebcamPanelSection(panelScrollEl, hdriEngine) {
  const section = document.createElement('div');
  section.className = 'section';
  section.innerHTML = `<div class="sec-label"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg> WEBCAM ENVIRONMENT MAP</div>`;

  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;align-items:center;';

  // Start/Stop button
  const btn = document.createElement('button');
  btn.id = 'webcam-toggle';
  btn.className = 'mini-btn';
  btn.textContent = '📷 Start Webcam';
  btn.addEventListener('click', async () => {
    if (hdriEngine.enabled) {
      hdriEngine.stop();
      btn.textContent = '📷 Start Webcam';
      btn.style.opacity = '1';
    } else {
      try {
        btn.textContent = '⏳ Starting...';
        btn.style.pointerEvents = 'none';
        await hdriEngine.start();
        btn.textContent = '📷 Stop Webcam';
        btn.style.opacity = '1';
      } catch(e) {
        btn.textContent = '❌ Failed';
        setTimeout(() => { btn.textContent = '📷 Start Webcam'; btn.style.pointerEvents = 'auto'; }, 2000);
      }
    }
  });
  controlsDiv.appendChild(btn);

  // Resolution dropdown
  const resSelect = document.createElement('select');
  resSelect.id = 'webcam-res';
  resSelect.className = 'p-drop';
  resSelect.innerHTML = [
    ['320x240', '320×240'],
    ['480x360', '480×360'],
    ['640x480', '640×480 (Default)'],
    ['1280x720', '1280×720 (HD)'],
  ].map(([val, label]) => `<option value="${val}" ${hdriEngine.resolution === val ? 'selected' : ''}>${label}</option>`).join('');
  resSelect.addEventListener('change', (e) => {
    hdriEngine.changeResolution(...e.target.value.split('x').map(Number));
  });
  controlsDiv.appendChild(resSelect);

  // EnvMap intensity slider
  const envRow = document.createElement('div');
  envRow.className = 'param';
  envRow.style.flex = '1';
  envRow.style.minWidth = '120px';
  envRow.innerHTML = `
    <label for="webcam-env-int">EnvMap Intensity</label>
    <div class="slider-row">
      <input type="range" id="webcam-env-int" min="0" max="3" step="0.05" value="${hdriEngine.envMapIntensity}" class="p-slider">
      <span class="p-val" id="webcam-env-int-val">${hdriEngine.envMapIntensity.toFixed(2)}</span>
    </div>`;
  envRow.querySelector('#webcam-env-int').addEventListener('input', (e) => {
    hdriEngine.setEnvMapIntensity(parseFloat(e.target.value));
    document.getElementById('webcam-env-int-val').textContent = parseFloat(e.target.value).toFixed(2);
  });
  controlsDiv.appendChild(envRow);

  section.appendChild(controlsDiv);
  panelScrollEl.appendChild(section);

  return section;
}

// ---- Public API ----
const WebcamHDRI_exports = { WebcamHDRI, createWebcamPanelSection };

if (typeof window !== 'undefined' && window.__export) {
  window.__export('webcam-hdri', WebcamHDRI_exports);
}
module.exports = WebcamHDRI_exports;

})();
