'use strict';
// gltf-loader-engine.js — Model upload system using GLTFLoader + OrbitControls + environment capture.
// Uses window.THREE (UMD vendor/three.js). All inline shaders. No external CDNs.
(function () {
const T = window.THREE;
if (!T) return console.warn('[gltf] THREE not loaded');

/**
 * Check which addon modules are available in the UMD bundle.
 */
function getAvailableModules() {
  const available = {};
  available.GLTFLoader = !!T.GLTFLoader;
  available.OrbitControls = !!T.OrbitControls;
  available.CubeCamera = !!T.CubeCamera;
  available.WebGLCubeRenderTarget = !!T.WebGLCubeRenderTarget;
  available.PMREMGenerator = !!T.PMREMGenerator;
  return available;
}

// ---- File drop zone creation helper ----
function createDropZone(options) {
  options = options || {};
  const container = document.createElement('div');
  container.className = options.className || 'glb-drop-zone';
  container.style.cssText = `
    border: 2px dashed rgba(110,231,154,0.3); border-radius: 12px; padding: 20px;
    text-align: center; cursor: pointer; transition: all .2s; background: rgba(255,255,255,0.03);
    font-size: 13px; color: #a9b8c6; min-height: 80px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px;
  `;
  // Drag-over / drag-leave styling
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.style.borderColor = 'rgba(110,231,154,0.8)';
    container.style.background = 'rgba(110,231,154,0.08)';
  });
  container.addEventListener('dragleave', () => {
    container.style.borderColor = 'rgba(110,231,154,0.3)';
    container.style.background = 'rgba(255,255,255,0.03)';
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    container.style.borderColor = 'rgba(110,231,154,0.3)';
    container.style.background = 'rgba(255,255,255,0.03)';
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (/\.(glb|gltf)$/i.test(f.name)) {
        onFileSelected && onFileSelected(f);
      } else {
        container.textContent = 'Only .glb / .gltf files accepted';
        setTimeout(() => resetContent(), 2000);
      }
    }
  });
  // Also click to open file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.glb,.gltf';
  fileInput.multiple = false;
  fileInput.style.display = 'none';
  container.appendChild(fileInput);
  container.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f) {
      if (/\.(glb|gltf)$/i.test(f.name)) onFileSelected && onFileSelected(f);
      else container.textContent = 'Only .glb / .gltf files accepted';
      setTimeout(() => resetContent(), 2000);
      fileInput.value = '';
    }
  });

  let onFileSelected = null;
  let resetContent = () => {
    container.innerHTML = '';
    container.appendChild(fileInput);
    container.innerHTML += `<span style="pointer-events:none">${options.placeholder || 'Drag &amp; drop .glb/.gltf here or click to browse'}</span>`;
    container.addEventListener('click', () => fileInput.click());
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      for (const f of files) {
        if (/\.(glb|gltf)$/i.test(f.name)) onFileSelected && onFileSelected(f);
      }
    });
  };
  resetContent();

  return {
    element: container,
    fileInput: fileInput,
    setOnFileSelected(fn) { onFileSelected = fn; },
    reset() { resetContent(); },
  };
}

// ---- GLTF Loader Engine ----
class GLTFLoaderEngine {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.modules = getAvailableModules();
    this.modelGroup = null; // Object3D holding loaded model
    this.orbitControls = null;
    this.isOrbitMode = false;
    this._origCamPos = camera ? camera.position.clone() : new T.Vector3(0, 0.8, 3.2);
    this._origCamTarget = new T.Vector3(0, 0, 0);
    this.currentObject3D = null;

    // Params exposed in settings
    this.params = {
      position: { x: 0, y: 0, z: 0 },
      scale: 1.0,
      rotation: { x: 0, y: 0, z: 0 },
      autoFit: true,          // auto-scale/center model to camera view
      envMapIntensity: 1.0,   // reflected light intensity
      castShadow: false,
      receiveShadow: false,
      wireframe: false,
      highlightEdges: false,
    };

    // Environment map reference
    this.envMap = null;
    this.capturedRT = null;

    // UI elements
    this.dropZone = null;
    this.orbitUI = null;

    // Progress callback
    this.onProgress = null;
    this.onLoad = null;
    this.onError = null;

    // Temp objects for computation
    this._box = new T.Box3();
    this._tmpMatrix = new T.Matrix4();
  }

  /** Initialize the engine: load addons, set up controls */
  init() {
    // Try to initialize OrbitControls
    try {
      if (this.modules.OrbitControls && T.OrbitControls) {
        this.orbitControls = new T.OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.08;
        this.orbitControls.minDistance = 0.5;
        this.orbitControls.maxDistance = 50;
        this.orbitControls.target.copy(this._origCamTarget);
        // Disable orbit controls until a model is loaded
        this.orbitControls.enabled = false;
      }
    } catch(e) {
      console.warn('[gltf] OrbitControls unavailable:', e.message);
    }

    return this;
  }

  /** Create the UI panel section for model import */
  createPanelSection(panelScrollEl) {
    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = '<div class="sec-label"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/></svg> MODEL IMPORT</div>';

    // Drop zone
    this.dropZone = createDropZone({ placeholder: '📦 Drag & drop .glb/.gltf here or click to browse' });
    section.appendChild(this.dropZone.element);
    this.dropZone.setOnFileSelected((file) => this.loadFile(file));

    // Params row
    const paramDiv = document.createElement('div');
    paramDiv.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

    // Scale slider
    const scaleRow = document.createElement('div');
    scaleRow.className = 'param';
    scaleRow.innerHTML = `
      <label for="gltf-scale">Scale</label>
      <div class="slider-row">
        <input type="range" id="gltf-scale" min="0.01" max="5" step="0.01" value="${this.params.scale}" class="p-slider">
        <span class="p-val" id="gltf-scale-val">${this.params.scale.toFixed(2)}</span>
      </div>`;
    paramDiv.appendChild(scaleRow);
    scaleRow.querySelector('#gltf-scale').addEventListener('input', (e) => {
      this.params.scale = parseFloat(e.target.value);
      document.getElementById('gltf-scale-val').textContent = this.params.scale.toFixed(2);
      this.applyParams();
    });

    // Wireframe toggle
    const wfRow = document.createElement('div');
    wfRow.className = 'param';
    wfRow.innerHTML = `<label for="gltf-wireframe">Wireframe</label><input type="checkbox" id="gltf-wireframe" class="p-toggle">`;
    paramDiv.appendChild(wfRow);
    wfRow.querySelector('#gltf-wireframe').addEventListener('change', (e) => {
      this.params.wireframe = e.target.checked;
      this.applyParams();
    });

    section.appendChild(paramDiv);
    panelScrollEl.appendChild(section);

    return section;
  }

  /** Load a file (.glb or .gltf) */
  loadFile(file) {
    console.log('[gltf] Loading:', file.name);
    if (typeof this.onProgress === 'function') this.onProgress(0, file.name);

    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && typeof this.onProgress === 'function') {
        this.onProgress(e.loaded / e.total, file.name);
      }
    };
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
        this._loadFromBuffer(arrayBuffer, file.name);
      } catch(err) {
        console.error('[gltf] File read error:', err);
        if (typeof this.onError === 'function') this.onError(err.message);
      }
    };
    reader.onerror = () => {
      console.error('[gltf] Failed to read file');
      if (typeof this.onError === 'function') this.onError('Failed to read file');
    };
    reader.readAsArrayBuffer(file);
  }

  /** Internal: parse buffer into Three.js objects */
  _loadFromBuffer(data, filename) {
    if (!this.modules.GLTFLoader) {
      console.error('[gltf] GLTFLoader not available in this build');
      if (typeof this.onError === 'function') this.onError('GLTFLoader not available');
      return;
    }

    const loader = new T.GLTFLoader();

    // Detect MIME from extension
    const ext = filename.toLowerCase().split('.').pop();
    const isGLB = ext === 'glb';

    loader.parse(data, '', (gltf) => {
      this._onModelLoaded(gltf, filename);
    }, (err) => {
      console.error('[gltf] Parse error:', err);
      if (typeof this.onError === 'function') this.onError(err.message || err);
    }, isGLB ? undefined : undefined);
  }

  /** Process loaded GLTF data: apply params, setup materials, add to scene */
  _onModelLoaded(gltf, filename) {
    const model = gltf.scene;
    if (!model) { console.error('[gltf] No scene in GLTF'); return; }

    // Dispose previous model
    if (this.modelGroup) {
      this.scene.remove(this.modelGroup);
      this.modelGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this.modelGroup = null;
    }

    model.name = filename.replace(/\.(glb|gltf)$/i, '');

    // Apply user params
    this.applyToModel(model);

    // Add environment map if available
    if (this.envMap) {
      model.traverse(child => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => { m.envMap = this.envMap; m.needsUpdate = true; });
          } else {
            child.material.envMap = this.envMap;
            child.material.needsUpdate = true;
          }
        }
      });
    }

    this.scene.add(model);
    this.modelGroup = model;
    this.currentObject3D = model;

    // Fit model to camera view
    if (this.params.autoFit) {
      this._fitModelToView(model);
    }

    // Enable orbit controls
    if (this.orbitControls) {
      this.orbitControls.enabled = true;
      this.orbitControls.target.copy(this._origCamTarget);
      this.orbitControls.update();
    }

    console.log(`[gltf] Loaded "${filename}" with ${model.children.length} children`);
    if (typeof this.onLoad === 'function') this.onLoad(gltf, model);
  }

  /** Auto-fit model bounding box to camera frustum */
  _fitModelToView(model) {
    this._box.setFromObject(model);
    const size = this._box.getSize(new T.Vector3());
    const center = this._box.getCenter(new T.Vector3());

    // Center model at origin
    model.position.sub(center);
    model.position.y += size.y / 2; // sit on ground plane

    // Scale to fit
    const maxDim = Math.max(size.x, size.y, size.z);
    const camDist = this._origCamPos.length();
    const fitScale = (camDist * 0.6) / maxDim;
    const finalScale = Math.max(0.01, fitScale * this.params.scale);
    model.scale.setScalar(finalScale);

    console.log(`[gltf] Fitted model: size=${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}, scale=${finalScale.toFixed(3)}`);
  }

  /** Apply current params to the model */
  applyToModel(model) {
    model = model || this.modelGroup;
    if (!model) return;

    const p = this.params;

    // Position
    model.position.set(p.position.x, p.position.y, p.position.z);

    // Rotation
    model.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);

    // Scale
    if (p.scale !== undefined) {
      // Preserve per-axis ratios if model was already scaled
      const s = model.scale.x;
      if (s > 0) {
        const aspectX = model.scale.x / s;
        const aspectY = model.scale.y / s;
        const aspectZ = model.scale.z / s;
        model.scale.set(s * aspectX, s * aspectY, s * aspectZ);
        // Actually just use uniform scale
        model.scale.setScalar(p.scale);
      }
    }

    // Wireframe on all meshes
    model.traverse(child => {
      if (child.isMesh) {
        if (p.wireframe) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => { m.wireframe = true; });
          } else {
            child.material.wireframe = true;
          }
        }
        // Shadow settings
        child.castShadow = p.castShadow;
        child.receiveShadow = p.receiveShadow;
      }
    });
  }

  /** Convenience: apply params and call applyToModel */
  applyParams() {
    if (this.modelGroup) this.applyToModel(this.modelGroup);
  }

  /** Update orbit controls each frame */
  updateOrbit() {
    if (this.orbitControls && this.orbitControls.enabled) {
      this.orbitControls.update();
    }
  }

  // ===== Environment Map Capture =====

  /** Capture the scene as an HDR-like cubemap for reflections */
  captureEnvironment(target, rtSize, onDone) {
    rtSize = rtSize || 512;
    target = target || this.camera.position.clone();

    if (!T.CubeCamera || !T.WebGLCubeRenderTarget) {
      console.warn('[gltf] CubeCamera/WebGLCubeRenderTarget not available');
      if (typeof onDone === 'function') onDone(null);
      return;
    }

    console.log('[gltf] Capturing environment...');

    // Save original environment
    const saveSceneBackground = this.scene.background;
    const saveEnvMaps = [];
    const meshMaterials = [];
    this.scene.traverse(child => {
      if (child.isMesh) {
        meshMaterials.push(child.material);
        // Temporarily hide meshes so only empty geometry reflects
        child.visible = false;
      }
    });

    // Hide models briefly for clean capture
    if (this.modelGroup) this.modelGroup.visible = false;

    // Create cube camera
    const cubeRT = new T.WebGLCubeRenderTarget(rtSize, {
      format: T.RGBAFormat,
      type: T.HalfFloatType,
      generateMipmaps: true,
      minFilter: T.LinearMipmapLinearFilter,
    });
    const cubeCamera = new T.CubeCamera(0.1, 100, cubeRT);
    cubeCamera.position.copy(target);
    cubeCamera.update(this.renderer, this.scene);

    // Restore visibility
    if (this.modelGroup) this.modelGroup.visible = true;
    meshMaterials.forEach(m => {}); // visible was already toggled

    this.capturedRT = cubeRT;
    this.envMap = cubeRT.texture;

    // Apply to model materials
    if (this.modelGroup) {
      this.modelGroup.traverse(child => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            mat.envMap = this.envMap;
            mat.envMapIntensity = this.params.envMapIntensity;
            mat.needsUpdate = true;
          });
        }
      });
    }

    console.log('[gltf] Environment captured successfully');
    if (typeof onDone === 'function') onDone(cubeRT.texture);
  }

  /** Reset orbit controls to default camera position */
  resetCamera() {
    if (!this.camera) return;
    this.camera.position.copy(this._origCamPos);
    this.camera.lookAt(this._origCamTarget);
    if (this.orbitControls) {
      this.orbitControls.target.copy(this._origCamTarget);
      this.orbitControls.update();
    }
  }

  /** Toggle between model orbit mode and original camera */
  toggleOrbit() {
    if (this.orbitControls) {
      this.isOrbitMode = !this.isOrbitMode;
      if (this.isOrbitMode) {
        this.orbitControls.enabled = true;
      } else {
        this.orbitControls.enabled = false;
        this.resetCamera();
      }
    }
    return this.isOrbitMode;
  }

  /** Set env map manually (for webcam HDRI integration) */
  setEnvMap(texture) {
    this.envMap = texture;
    if (this.modelGroup) {
      this.modelGroup.traverse(child => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            mat.envMap = texture;
            mat.needsUpdate = true;
          });
        }
      });
    }
  }

  /** Dispose of the loaded model and free resources */
  dispose() {
    if (this.modelGroup) {
      this.scene.remove(this.modelGroup);
      this.modelGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this.modelGroup = null;
    }
    if (this.capturedRT) {
      this.capturedRT.dispose();
      this.capturedRT = null;
    }
    if (this.orbitControls) {
      this.orbitControls.dispose && this.orbitControls.dispose();
      this.orbitControls = null;
    }
  }
}

// ---- Public API ----
const GLTFLoaderEngine_exports = { GLTFLoaderEngine, createDropZone, getAvailableModules };

if (typeof window !== 'undefined' && window.__export) {
  window.__export('gltf-loader-engine', GLTFLoaderEngine_exports);
}
module.exports = GLTFLoaderEngine_exports;

})();
