// Interactive Particles Music Visualizer — standalone Three.js engine
// Based on Codrops tutorial by Tiago Canzian (MIT License)
// Credit: Coala Music/ARKx, Yuri Artiukh, Ashima Arts (noise), Three.js, GSAP
'use strict';

(function() {
  // GLSL simplex noise (Ashima Arts MIT license) + curl noise displacement
  const VERTEX_SHADER = `
    varying float vDistance;
    uniform float time;
    uniform float offsetSize;
    uniform float size;
    uniform float offsetGain;
    uniform float amplitude;
    uniform float frequency;
    uniform float maxDistance;

    vec3 mod289(vec3 x){ return x-floor(x*(1./289.))*289.; }
    vec2 mod289(vec2 x){ return x-floor(x*(1./289.))*289.; }
    vec3 permute(vec3 x){ return mod289(((x*34.)+1.)*x); }

    // Simplified 3D noise (Ashima Arts / Stefan Gustavson)
    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0., i1.z, i2.z, 1.))
        + i.y + vec4(0., i1.y, i2.y, 1.))
        + i.x + vec4(0., i1.x, i2.x, 1.));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    float curl(float x, float y, float z){
      float eps = 1e-3;
      float n1,n2,a,b;
      x += time * 0.05; y += time * 0.05; z += time * 0.05;
      n1 = snoise(vec3(x, y+eps, z)); n2 = snoise(vec3(x, y-eps, z)); a = (n1-n2)/2.*eps;
      n1 = snoise(vec3(x, z, y+eps)); n2 = snoise(vec3(x, z, y-eps)); b = (n1-n2)/2.*eps;
      return a - b;
    }

    void main(){
      vec3 newpos = position;
      float c1 = curl(newpos.x * frequency, newpos.y * frequency, newpos.z * frequency);
      float c2 = curl(newpos.y * frequency, newpos.z * frequency, newpos.x * frequency);
      float c3 = curl(newpos.z * frequency, newpos.x * frequency, newpos.y * frequency);
      vec3 target = position + normal*.1 + vec3(c1,c2,c3) * amplitude;
      float d = length(newpos - target) / maxDistance;
      newpos = mix(position, target, pow(d, 4.));
      newpos.z += sin(time) * (.1 * offsetGain);
      vec4 mvPosition = modelViewMatrix * vec4(newpos, 1.);
      gl_PointSize = size + (pow(d,3.) * offsetSize) * (1./-mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      vDistance = d;
    }`;

  const FRAGMENT_SHADER = `
    varying float vDistance;
    uniform vec3 startColor;
    uniform vec3 endColor;
    uniform vec3 beatPulse;

    float circle(in vec2 _st, in float _radius){
      vec2 dist = _st - vec2(.5);
      return 1. - smoothstep(_radius - (_radius*.01), _radius + (_radius*.01), dot(dist, dist)*4.);
    }

    void main(){
      vec2 uv = vec2(gl_PointCoord.x, 1. - gl_PointCoord.y);
      vec3 circ = vec3(circle(uv, 1.));
      vec3 color = mix(startColor, endColor, vDistance);
      color += beatPulse * vDistance * 0.3;
      gl_FragColor = vec4(color, circ.r * vDistance);
    }`;

  // Elastic easing function (GSAP elastic.out)
  function elasticOut(t, strength) {
    if (t === 0 || t === 1) return t;
    const s = strength / 4;
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / s) + 1;
  }

  class ParticlesEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.active = false;
      this.time = 0;
      this.beatCount = 0;
      this.lastBeatTime = 0;
      this.currentType = 'box';
      this.uniforms = null;
      this.renderer = null;
      this.camera = null;
      this.scene = null;
      this.holderObjects = null;
      this.pointsMesh = null;
      this.hostAudio = { energy: 0, bass: 0, mid: 0, treble: 0, beat: 0 };
      this.params = {};
      this._rafId = null;
    }

    init(THREE_lib, hostParams) {
      if (this.active) return;
      this.THREE = THREE_lib;
      THREE = THREE_lib;
      Object.assign(this.params, hostParams || {});
      this.active = true;

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
      this.renderer.setClearColor(0x000000, 1);

      this.camera = new THREE.PerspectiveCamera(70, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 10000);
      this.camera.position.z = 12;
      this.camera.frustumCulled = false;

      this.scene = new THREE.Scene();
      this.holderObjects = new THREE.Object3D();
      this.holderObjects.rotateX(Math.PI / 2);
      this.scene.add(this.holderObjects);

      this.uniforms = {
        time:       { value: 0 },
        offsetSize: { value: 2 },
        size:       { value: 1.1 },
        frequency:  { value: 2 },
        amplitude:  { value: 1 },
        offsetGain: { value: 0 },
        maxDistance:{ value: 1.8 },
        startColor: { value: new THREE.Color(0xff00ff) },
        endColor:   { value: new THREE.Color(0x00ffff) },
        beatPulse:  { value: new THREE.Color(0xffffff) },
      };

      const material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        uniforms: this.uniforms,
      });

      this._buildMesh();

      // Initial rotation animation
      this._animateRotation(this.holderObjects.rotation, {
        x: Math.random() * Math.PI,
        z: Math.random() * Math.PI * 2,
      }, 3, 0.8);

      // Setup audio listener
      window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (!d || d.__mag !== 'mag-audio') return;
        if (d.fft) this.hostAudio.freqData = d.fft;
        this.hostAudio.energy = d.energy || 0;
        this.hostAudio.bass = d.bass || 0;
        this.hostAudio.mid = d.mid || 0;
        this.hostAudio.treble = d.treble || 0;
        this.hostAudio.beat = d.beat || 0;
      });

      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.zIndex = '1';

      window.parent.postMessage({ __mag: 'mag-particles-ready' }, '*');
      this._startLoop();
    }

    stop() {
      this.active = false;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      if (this.pointsMesh) {
        this.holderObjects.remove(this.pointsMesh);
        this.pointsMesh.geometry.dispose();
        this.pointsMesh.material.dispose();
        this.pointsMesh = null;
      }
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }
    }

    setParams(p) {
      if (!this.active) return;
      Object.assign(this.params, p);
      // Update colors
      if (p.startColor) try { this.uniforms.startColor.value.set('#' + p.startColor); } catch(e) {}
      if (p.endColor) try { this.uniforms.endColor.value.set('#' + p.endColor); } catch(e) {}
      if (p.particleFrequency !== undefined) this.uniforms.frequency.value = p.particleFrequency;
      if (p.particleAmplitude !== undefined) this.uniforms.amplitude.value = p.particleAmplitude;
    }

    updateFromAudio(dt) {
      const a = this.hostAudio;
      const smooth = 0.12;
      const lowEnergy = a.freqData ? THREE.MathUtils.mapLinear(a.freqData[0] || 0, 0, 255, 0, 1) : 0;
      
      this.uniforms.amplitude.value += (0.8 + THREE.MathUtils.mapLinear(a.treble, 0, 0.6, -0.1, 0.2) - this.uniforms.amplitude.value) * smooth;
      this.uniforms.offsetGain.value += (a.mid * 0.6 - this.uniforms.offsetGain.value) * smooth;
      this.uniforms.frequency.value += (0.5 + lowEnergy * 2.5 - this.uniforms.frequency.value) * smooth;
      
      const speed = this.params.particleSpeed || 0.3;
      this.uniforms.time.value += THREE.MathUtils.clamp(0.2 + lowEnergy * 0.3 * speed, 0.2, 0.5);

      // Beat detection
      if (a.energy > 0.55 && performance.now() - this.lastBeatTime > 400) {
        this.lastBeatTime = performance.now();
        this.beatCount++;
        this.uniforms.beatPulse.value.setRGB(1, 1, 1);
        setTimeout(() => { if (this.uniforms) this.uniforms.beatPulse.value.setRGB(0, 0, 0); }, 120);

        if (this.beatCount % 4 === 0) {
          this.currentType = this.currentType === 'box' ? 'cylinder' : 'box';
          this._buildMesh();
          const oldFreq = this.uniforms.frequency.value;
          const newFreq = THREE.MathUtils.randFloat(0.5, 3);
          const startTime2 = performance.now();
          const animateFreq = () => {
            const t = Math.min((performance.now() - startTime2) / 2000, 1);
            const p = t === 1 ? 1 : t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
            this.uniforms.frequency.value = oldFreq + (newFreq - oldFreq) * p;
            if (t < 1) requestAnimationFrame(animateFreq);
          };
          animateFreq();

          // Random rotation burst
          this._animateRotation(this.holderObjects.rotation, {
            y: Math.random() * Math.PI,
            z: Math.random() * Math.PI,
          }, Math.random() < 0.8 ? 15 : 1, 0.2);
        }
      }
    }

    _buildMesh() {
      if (this.pointsMesh) {
        this.holderObjects.remove(this.pointsMesh);
        this.pointsMesh.geometry.dispose();
        this.pointsMesh.material.dispose();
        this.pointsMesh = null;
      }
      let geo;
      if (this.currentType === 'cylinder') {
        const radialSeg = Math.max(1, Math.floor(Math.random() * 2) + 1);
        const heightSeg = Math.max(1, Math.floor(Math.random() * 4) + 1);
        geo = new THREE.CylinderGeometry(1, 1, 4, 64 * radialSeg, 64 * heightSeg, true);
        this.uniforms.offsetSize.value = Math.floor(Math.random() * 30) + 30;
        this.uniforms.size.value = 2;
      } else {
        geo = new THREE.BoxGeometry(1, 1, 1,
          Math.floor(Math.random() * 16) + 5,
          Math.floor(Math.random() * 40) + 1,
          Math.floor(Math.random() * 75) + 5
        );
        this.uniforms.offsetSize.value = Math.floor(Math.random() * 30) + 30;
        this.uniforms.size.value = 1.1;
      }
      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        uniforms: this.uniforms,
      });
      this.pointsMesh = new THREE.Points(geo, mat);
      this.pointsMesh.rotation.set(Math.PI / 2, 0, 0);
      this.holderObjects.add(this.pointsMesh);
    }

    _animateRotation(target, props, duration, strength) {
      const froms = {};
      for (const k in props) froms[k] = target[k];
      const st = performance.now();
      const tick = () => {
        const t = Math.min((performance.now() - st) / (duration * 1000), 1);
        const p = t < 1 ? elasticOut(t, strength) : 1;
        for (const k in froms) target[k] = froms[k] + (props[k] - froms[k]) * p;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    _startLoop() {
      const loop = () => {
        if (!this.active) return;
        this.updateFromAudio();
        this.renderer.render(this.scene, this.camera);
        this._rafId = requestAnimationFrame(loop);
      };
      loop();
    }

    resize(w, h) {
      if (!this.active) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }
  }

  module.exports = { ParticlesEngine };
})();
