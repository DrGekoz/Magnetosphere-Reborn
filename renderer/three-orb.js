'use strict';
// three.js orb engine — real 3D rendering for orb themes.
// Replaces the raymarch path: instanced metaball-merged spheres, studio 3-point
// lighting rig, PBR materials, UnrealBloom glow, GPU particles with trails.
// (uses renderer/vendor/three.module.js)

(function () {
  const THREE = window.THREE;

  // ---- OrbEngine: owns the three.js scene for orb modes ----
  class OrbEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ready = false;
      this._meshes = [];
      this._particles = null;
      this._starfield = null;
      this._init();
    }

    _init() {
      try {
        if (!THREE) throw new Error('THREE not loaded');
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas, alpha: false, antialias: true, powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.95;
        this.renderer.shadowMap.enabled = false; // perf: no shadow maps
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.camera.position.set(0, 0.8, 3.2);
        this.camera.lookAt(0, 0, 0);
        // ---- PostProcessingEngine integration ----
        // If the postprocessing-engine module is loaded, use it for the full pipeline
        const ppModule = window.__modules && window.__modules['postprocessing-engine'];
        if (ppModule && ppModule.PostProcessingEngine) {
          try {
            this.ppEngine = new ppModule.PostProcessingEngine(this.renderer);
            this.ppEngine.init(this.scene, this.camera);
            // Store reference on state for selective bloom tracking
            this.ppEngine.scanLights(this.scene);
            // Disable the built-in bloom since the PP engine handles it
            this._useSharedPP = true;
          } catch(e) {
            console.log('[three-orb] PP Engine init failed, falling back to local bloom:', e.message);
            this._useSharedPP = false;
          }
        }
        // Fallback local bloom if no shared PP engine
        if (!this._useSharedPP) {
          try {
            this.composer = new THREE.EffectComposer(this.renderer);
            this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
            this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.5, 0.25);
            this.composer.addPass(this.bloom);
            if (THREE.OutputPass) this.composer.addPass(new THREE.OutputPass());
            this.composer.setSize(1, 1);
          } catch (e) {
            this.composer = null;
            console.log('[three-orb] bloom unavailable:', e.message);
          }
        }

        // ---- studio lighting rig (3-point) ----
        this.key = new THREE.DirectionalLight(0xffffff, 2.2);
        this.key.position.set(2, 3, 4);
        this.fill = new THREE.DirectionalLight(0x99ccff, 0.25);
        this.fill.position.set(-3, 1, 2);
        this.rim = new THREE.DirectionalLight(0xffddaa, 0.35);
        this.rim.position.set(0, -2, -4);
        this.amb = new THREE.AmbientLight(0x223344, 0.35);
        this.scene.add(this.key, this.fill, this.rim, this.amb);
        // hemisphere light probe for ambient color grading per theme
        this.hemi = new THREE.HemisphereLight(0x4466aa, 0x000000, 0.4);
        this.scene.add(this.hemi);

        // ---- metaball merged mesh (instanced spheres) ----
        // one shared geometry; per-orb instance matrix + color
        this.geo = new THREE.SphereGeometry(1, 28, 20);
        this.maxOrbs = 48;
        this.mesh = new THREE.InstancedMesh(this.geo, new THREE.MeshPhysicalMaterial({
          roughness: 0.3, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.25,
          emissive: new THREE.Color(0x66ff88), emissiveIntensity: 1.1,
        }), this.maxOrbs);
        this.mesh.frustumCulled = false;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // per-instance colors via setColorAt (creates the instanceColor attribute)
        for (let i = 0; i < this.maxOrbs; i++) {
          this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
        }
        this.scene.add(this.mesh);
        this._dummy = new THREE.Object3D();
        this._tmpColor = new THREE.Color();
        const N = 4000;
        this.partGeo = new THREE.BufferGeometry();
        this.partPos = new Float32Array(N * 3);
        this.partCol = new Float32Array(N * 3);
        this.partGeo.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3).setUsage(THREE.DynamicDrawUsage));
        this.partGeo.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3).setUsage(THREE.DynamicDrawUsage));
        const pm = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
        this._particles = new THREE.Points(this.partGeo, pm);
        this._particles.frustumCulled = false;
        this.scene.add(this._particles);
        this._partN = 0;

        // ---- starfield ----
        const S = 900;
        const sg = new THREE.BufferGeometry();
        const sp = new Float32Array(S * 3);
        for (let i = 0; i < S; i++) {
          const r = 30 + Math.random() * 30;
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          sp[i*3] = r * Math.sin(ph) * Math.cos(th);
          sp[i*3+1] = r * Math.cos(ph) * 0.6;
          sp[i*3+2] = r * Math.sin(ph) * Math.sin(th);
        }
        sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        this._starfield = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.06, color: 0xccffcc, transparent: true, opacity: 0.7, sizeAttenuation: false }));
        this.scene.add(this._starfield);

        // ---- frequency blob (av3d-ref technique: icosahedron displaced by FFT + noise) ----
        // credit: https://github.com/santosharron/audio-visualizer-three-js
        const blobGeo = new THREE.IcosahedronGeometry(1.15, 4);
        const blobMat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uFreq: { value: 0.0 },
            uBass: { value: 0.0 },
            uColor: { value: new THREE.Color(0x66ff88) },
            uGlow: { value: 0.8 },
          },
          vertexShader: `
            uniform float uTime, uFreq, uBass;
            varying vec3 vNormal;
            varying vec3 vPos;
            varying float vDisp;
            ${THREE.ShaderChunk.noise_common || ''}
            void main() {
              vec3 n = normalize(position);
              float d = uFreq * 0.5 + uBass * 1.2;
              // simplex-ish displacement via layered sin (portable, no noise dep)
              float disp = sin(n.x * 6.0 + uTime * 1.4) * sin(n.y * 5.0 + uTime * 1.1) * sin(n.z * 7.0 + uTime * 1.7);
              disp = disp * 0.5 + 0.5;
              disp = disp * d * 0.8;
              vec3 pos = position + n * disp;
              vNormal = normalMatrix * n;
              vPos = pos;
              vDisp = disp;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            uniform float uGlow;
            varying vec3 vNormal;
            varying vec3 vPos;
            varying float vDisp;
            void main() {
              float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vPos))), 2.0);
              vec3 col = uColor * (0.35 + vDisp * 1.6);
              col += uColor * fres * uGlow * 1.8;
              gl_FragColor = vec4(col, 1.0);
            }
          `,
          transparent: false,
        });
        this._blob = new THREE.Mesh(blobGeo, blobMat);
        this._blob.visible = false;
        this.scene.add(this._blob);

        this.ready = true;
      } catch (e) {
        console.log('[three-orb] init failed:', e.message);
        this.ready = false;
      }
    }

    resize(w, h) {
      if (!this.ready) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this._useSharedPP && this.ppEngine) {
        this.ppEngine.setSize(w, h);
      } else if (this.composer) {
        this.composer.setSize(w, h);
      }
    }

    // update orbs: positions + per-instance color from band colors
    updateOrbs(orbs, params, bandColors, energy, beat) {
      if (!this.ready) return;
      // blob mode: hide instanced orbs, show the frequency blob instead
      const blobMode = !!(params.visualMode === 'Blob' || params.blobMode);
      this.mesh.visible = !blobMode;
      if (this._blob) {
        this._blob.visible = blobMode;
        if (blobMode) {
          const m = this._blob.material;
          m.uniforms.uTime.value += 0.016;
          m.uniforms.uFreq.value = energy;
          m.uniforms.uBass.value = beat;
          m.uniforms.uColor.value.setRGB(bandColors[0][0], bandColors[0][1], bandColors[0][2]);
          m.uniforms.uGlow.value = 0.5 + energy * 1.2 + beat * 0.8;
          // blob sits at origin, orbs orbit around it faintly
          this.mesh.visible = false;
        }
      }
      if (blobMode) return;
      const n = Math.min(orbs.length, this.maxOrbs);
      for (let i = 0; i < n; i++) {
        const o = orbs[i];
        this._dummy.position.set(o.x, o.y, o.z);
        // merge scale: orbs close to others blend bigger (fake metaball union)
        const s = o.r * (1 + params.mergeAmount * 0.15);
        this._dummy.scale.set(s, s, s);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        const c = bandColors[o.band || 0];
        this._tmpColor.setRGB(c[0], c[1], c[2]);
        this.mesh.setColorAt(i, this._tmpColor);
      }
      for (let i = n; i < this.maxOrbs; i++) {
        this._dummy.position.set(999, 999, 999);
        this._dummy.scale.set(0.001, 0.001, 0.001);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      // material reactive
      const m = this.mesh.material;
      // emissive = band0 color at moderate intensity (glow), surface = instance color
      m.emissive.setRGB(bandColors[0][0], bandColors[0][1], bandColors[0][2]);
      m.emissiveIntensity = 0.5 + energy * 0.8 + beat * 0.5;
      // base material color = band0 (not white) so lit faces stay colored
      m.color.setRGB(
        0.5 + 0.5 * bandColors[0][0],
        0.5 + 0.5 * bandColors[0][1],
        0.5 + 0.5 * bandColors[0][2]);
      // tint the key light with the dominant band color so orbs stay vivid (studio rig)
      this.key.color.setRGB(
        0.7 + 0.3 * bandColors[0][0],
        0.7 + 0.3 * bandColors[0][1],
        0.7 + 0.3 * bandColors[0][2]);
      this.key.intensity = 0.9 + energy * 0.7;
      this.fill.intensity = 0.15 + energy * 0.08;
      this.rim.intensity = 0.2 + energy * 0.12;
      this._energy = energy;
      this._gradeAmbient(bandColors);
    }

    // push particle points
    updateParticles(parts) {
      if (!this.ready) return;
      const n = Math.min(parts.length, 4000);
      for (let i = 0; i < n; i++) {
        const p = parts[i];
        this.partPos[i*3] = p.x; this.partPos[i*3+1] = p.y; this.partPos[i*3+2] = p.z;
        this.partCol[i*3] = p.r; this.partCol[i*3+1] = p.g; this.partCol[i*3+2] = p.b;
      }
      this._partN = n;
      this.partGeo.attributes.position.needsUpdate = true;
      this.partGeo.attributes.color.needsUpdate = true;
      this.partGeo.setDrawRange(0, n);
    }

    // lighting rig control per theme
    setLights(theme) {
      if (!this.ready) return;
      const l = (theme && theme.lights) || {};
      const kp = l.key || [2, 3, 4], fp = l.fill || [-3, 1, 2], rp = l.rim || [0, -2, -4];
      this.key.position.set(kp[0], kp[1], kp[2]);
      this.fill.position.set(fp[0], fp[1], fp[2]);
      this.rim.position.set(rp[0], rp[1], rp[2]);
      if (l.keyColor) this.key.color.set(l.keyColor);
      if (l.fillColor) this.fill.color.set(l.fillColor);
      if (l.rimColor) this.rim.color.set(l.rimColor);
      this.key.intensity = l.keyIntensity ?? 2.2;
      this.fill.intensity = l.fillIntensity ?? 0.55;
      this.rim.intensity = l.rimIntensity ?? 0.9;
      // hemisphere probe from theme (bg color drives ambient tint)
      if (l.ambientColor) {
        this.hemi.color.set(l.ambientColor);
        this.hemi.groundColor.set(l.groundColor || 0x000000);
      }
    }

    // theme-driven ambient probe from band/bg colors (called each frame)
    _gradeAmbient(bandColors, bgHsl) {
      if (!this.ready || !this.hemi) return;
      // sky = bg tinted toward band0, ground = black
      const c = bandColors[0];
      this.hemi.color.setRGB(c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      this.hemi.groundColor.setRGB(0.02, 0.02, 0.03);
      this.hemi.intensity = 0.25 + 0.3 * (this._energy || 0);
    }

    render(time, energy, beat) {
      if (!this.ready) return;
      // starfield twinkle
      if (this._starfield) {
        this._starfield.material.opacity = 0.5 + 0.3 * energy;
      }
      // slight camera drift
      this.camera.position.x = Math.sin(time * 0.05) * 0.15;
      this.camera.position.y = 0.8 + Math.sin(time * 0.08) * 0.1;
      this.camera.lookAt(0, 0, 0);
      if (this._useSharedPP && this.ppEngine) {
        // shared post-processing engine (bloom + DOF + godrays + SSAO + ...)
        try {
          this.ppEngine.apply(time);
          this.ppEngine.composer.render();
        } catch (e) { /* PP engine failed this frame */ }
      } else if (this.composer) {
        // bloom reacts to energy
        this.bloom.strength = 0.5 + energy * 1.1 + beat * 0.8;
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  module.exports = OrbEngine;
  if (typeof window !== 'undefined' && window.__export) { window.__export('three-orb', module.exports); }
})();
