// themes.js — 8 audio-reactive themes for the shared three.js theme host
// Inspired by three.js examples (mrdoob/three.js): webgl_interactive_lines,
// webgl_interactive_points, webgl_points_waves, webgl_points_billboards,
// webgl_marchingcubes, webgl_renderer_pathtracer, webgpu_tsl_vfx_tornado,
// and womogenes/fractal-music-visualizer. All audio-reactive.
(function () {
  'use strict';
  var THREE = window.THREE;

  /* ── helper: hex -> THREE.Color ── */
  function hexColor(str, fallback) {
    var v = (str || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return new THREE.Color(fallback || 0xffffff);
    return new THREE.Color(parseInt(v, 16));
  }

  /* ── THEME: lines (webgl_interactive_lines) ── */
  var linesTheme = {
    key: 'lines',
    name: 'Interactive Lines',
    init: function (scene) {
      this.objs = new THREE.Group();
      var mat = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9 });
      var geo = new THREE.BufferGeometry();
      var N = 400, pos = new Float32Array(N * 3);
      for (var i = 0; i < N; i++) {
        pos[i * 3] = (i / N - 0.5) * 20;
        pos[i * 3 + 1] = Math.sin(i * 0.3) * 2;
        pos[i * 3 + 2] = 0;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var line = new THREE.Line(geo, mat);
      this.objs.add(line);
      this.line = line;
      this.basePos = pos.slice();
      scene.add(this.objs);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var speed = parseFloat(p.waveSpeed) || 1;
      var amp = parseFloat(p.waveAmplitude) || 1.2;
      var glow = parseFloat(p.lineGlow) || 0.8;
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      this.line.material.color.copy(hexColor(p.lineColor, 0xff8800));
      this.line.material.opacity = 0.5 + glow * 0.4 + energy * 0.3;
      this.line.material.needsUpdate = true;
      var pos = this.line.geometry.attributes.position.array;
      for (var i = 0; i < pos.length / 3; i++) {
        var x = this.basePos[i * 3];
        var y = Math.sin(x * 0.5 + time * speed) * amp * (1 + bass * 0.5)
              + Math.sin(x * 1.3 - time * speed * 0.7) * amp * 0.4
              + energy * Math.sin(time * 3 + i) * 0.5;
        pos[i * 3 + 1] = y;
      }
      this.line.geometry.attributes.position.needsUpdate = true;
      this.objs.rotation.z = Math.sin(time * 0.2) * 0.05;
    }
  };

  /* ── THEME: points (webgl_interactive_points) ── */
  var pointsTheme = {
    key: 'points',
    name: 'Interactive Points',
    init: function (scene) {
      this.objs = new THREE.Group();
      this.count = 8000;
      this.base = new Float32Array(this.count * 3);
      var pos = new Float32Array(this.count * 3);
      for (var i = 0; i < this.count; i++) {
        // sphere distribution
        var r = 3 + Math.random() * 4;
        var th = Math.random() * Math.PI * 2;
        var ph = Math.acos(2 * Math.random() - 1);
        var x = r * Math.sin(ph) * Math.cos(th);
        var y = r * Math.sin(ph) * Math.sin(th);
        var z = r * Math.cos(ph);
        this.base[i * 3] = x; this.base[i * 3 + 1] = y; this.base[i * 3 + 2] = z;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({ color: 0x00ffff, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      this.points = new THREE.Points(geo, mat);
      this.objs.add(this.points);
      scene.add(this.objs);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var size = parseFloat(p.pointSize) || 2;
      var expansion = parseFloat(p.expansion) || 1.2;
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      this.points.material.color.copy(hexColor(p.pointColor, 0x00ffff));
      this.points.material.size = size * 0.06 * (1 + energy * 0.6);
      this.points.material.opacity = 0.6 + energy * 0.3;
      var pos = this.points.geometry.attributes.position.array;
      var expand = 1 + bass * expansion * 0.5;
      for (var i = 0; i < pos.length / 3; i++) {
        pos[i * 3] = this.base[i * 3] * expand;
        pos[i * 3 + 1] = this.base[i * 3 + 1] * expand + Math.sin(time * 2 + i) * energy * 0.3;
        pos[i * 3 + 2] = this.base[i * 3 + 2] * expand;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.objs.rotation.y = time * 0.1;
    }
  };

  /* ── THEME: waves (webgl_points_waves) — fixed top-down camera ── */
  var wavesTheme = {
    key: 'waves',
    name: 'Point Waves',
    init: function (scene, camera) {
      this.objs = new THREE.Group();
      this.grid = 128;
      var pos = new Float32Array(this.grid * this.grid * 3);
      var idx = 0;
      for (var x = 0; x < this.grid; x++) {
        for (var z = 0; z < this.grid; z++) {
          pos[idx] = (x / this.grid - 0.5) * 24;
          pos[idx + 1] = 0;
          pos[idx + 2] = (z / this.grid - 0.5) * 24;
          idx += 3;
        }
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({ color: 0x00ffff, size: 0.15, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true });
      this.points = new THREE.Points(geo, mat);
      // vertex colors
      var colors = new Float32Array(this.grid * this.grid * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.objs.add(this.points);
      scene.add(this.objs);
      // fixed top-down camera
      camera.position.set(0, 18, 0);
      camera.lookAt(0, 0, 0);
      this.camSet = true;
      this.colorA = new THREE.Color(0xff00ff);
      this.colorB = new THREE.Color(0x00ffff);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var height = parseFloat(p.waveHeight) || 1.5;
      var speed = parseFloat(p.waveSpeed) || 1;
      var size = parseFloat(p.pointSize) || 1;
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      this.colorA.copy(hexColor(p.colorA, 0xff00ff));
      this.colorB.copy(hexColor(p.colorB, 0x00ffff));
      this.points.material.size = size * 0.12;
      var pos = this.points.geometry.attributes.position.array;
      var col = this.points.geometry.attributes.color.array;
      var grid = this.grid, idx = 0;
      for (var x = 0; x < grid; x++) {
        for (var z = 0; z < grid; z++) {
          var px = (x / grid - 0.5) * 24, pz = (z / grid - 0.5) * 24;
          var d = Math.sqrt(px * px + pz * pz);
          var y = Math.sin(d * 0.8 - time * speed * 2) * height
                + Math.sin(px * 0.7 + time * speed) * height * 0.5
                + Math.sin(pz * 0.7 + time * speed * 0.8) * height * 0.5
                + bass * Math.sin(time * 4 + d) * height * 0.8;
          pos[idx + 1] = y;
          var t = (y + height * 2) / (height * 4);
          t = Math.max(0, Math.min(1, t));
          var c = this.colorA.clone().lerp(this.colorB, t);
          col[idx] = c.r + energy * 0.2;
          col[idx + 1] = c.g + energy * 0.2;
          col[idx + 2] = c.b;
          idx += 3;
        }
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  };

  /* ── THEME: billboards (webgl_points_billboards) ── */
  var billboardsTheme = {
    key: 'billboards',
    name: 'Billboard Points',
    init: function (scene) {
      this.objs = new THREE.Group();
      this.count = 4000;
      var pos = new Float32Array(this.count * 3);
      this.base = new Float32Array(this.count * 3);
      for (var i = 0; i < this.count; i++) {
        var x = (Math.random() - 0.5) * 12;
        var y = (Math.random() - 0.5) * 8;
        var z = (Math.random() - 0.5) * 12;
        this.base[i * 3] = x; this.base[i * 3 + 1] = y; this.base[i * 3 + 2] = z;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      // procedural round sprite texture
      var cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      var cx = cv.getContext('2d');
      var g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, 64, 64);
      var tex = new THREE.CanvasTexture(cv);
      var mat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.8, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.points = new THREE.Points(geo, mat);
      this.objs.add(this.points);
      scene.add(this.objs);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var size = parseFloat(p.bbSize) || 0.8;
      var spread = parseFloat(p.bbSpread) || 1;
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      this.points.material.color.copy(hexColor(p.bbColor, 0xffaa00));
      this.points.material.size = size * (1 + energy * 0.8);
      var pos = this.points.geometry.attributes.position.array;
      var sc = 1 + bass * 0.3;
      for (var i = 0; i < pos.length / 3; i++) {
        pos[i * 3] = this.base[i * 3] * sc + Math.sin(time * 1.5 + i) * energy * 0.2;
        pos[i * 3 + 1] = this.base[i * 3 + 1] * sc + Math.cos(time * 1.2 + i * 0.5) * energy * 0.2;
        pos[i * 3 + 2] = this.base[i * 3 + 2] * sc;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.objs.rotation.y = time * 0.05;
    }
  };

  /* ── THEME: marching (webgl_marchingcubes) ── */
  var marchingTheme = {
    key: 'marching',
    name: 'Marching Cubes',
    init: function (scene) {
      this.objs = new THREE.Group();
      this.res = 60;
      this.blobs = 15;
      this.mc = new THREE.MarchingCubes(this.res, this.res, this.res, new THREE.MeshNormalMaterial({ flatShading: true }));
      this.mc.position.set(0, 0, 0);
      this.mc.scale.set(8, 8, 8);
      this.mc.isolation = 73;
      this.mc.enableUvs = false;
      this.mc.enableColors = true;
      this.objs.add(this.mc);
      scene.add(this.objs);
      this.positions = [];
      for (var i = 0; i < 15; i++) this.positions.push([0, 0, 0]);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var res = parseInt(p.mcResolution) || 60;
      var blobs = parseInt(p.mcBlobs) || 15;
      var iso = parseFloat(p.mcIsolation) || 73;
      var speed = parseFloat(p.mcSpeed) || 0.25;
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      var beat = audio.beat || 0;
      // multi-monitor: wider aspect -> more blobs spread across width
      var aspect = (window.innerWidth || 16) / (window.innerHeight || 9);
      if (aspect > 1.777) {
        blobs = Math.min(40, Math.round(blobs * (aspect / 1.777)));
      }
      if (res !== this.res || blobs !== this.blobs) {
        // rebuild with new resolution
        var old = this.mc;
        this.mc = new THREE.MarchingCubes(res, res, res, new THREE.MeshNormalMaterial({ flatShading: true }));
        this.mc.position.set(0, 0, 0);
        this.mc.scale.set(8, 8, 8);
        this.mc.isolation = iso;
        this.objs.remove(old);
        this.objs.add(this.mc);
        this.res = res; this.blobs = blobs;
        this.positions = [];
        for (var i2 = 0; i2 < blobs; i2++) this.positions.push([0, 0, 0]);
      }
      this.mc.isolation = iso;
      this.mc.reset();
      var bScale = 1 + bass * 0.5 + beat * 0.3;
      var spread = aspect > 1.777 ? 3.5 : 2.2;
      for (var i = 0; i < blobs; i++) {
        var x = Math.sin(i * 1.7 + time * speed * (1 + i * 0.05)) * spread;
        var z = Math.cos(i * 2.3 + time * speed * 0.8) * spread;
        var y = Math.sin(i * 1.3 + time * speed * 1.2) * 1.5;
        this.mc.addBall(x, y, z, 0.7 * bScale);
      }
      // color tint by energy
      var c = this.mc.material.color;
      c.setHSL((time * 0.05 + energy * 0.3) % 1, 0.7, 0.5);
    }
  };

  /* ── THEME: pathtracer (webgl_renderer_pathtracer style) ── */
  var pathtracerTheme = {
    key: 'pathtracer',
    name: 'Pathtracer Style',
    init: function (scene) {
      this.objs = new THREE.Group();
      // reflective floor
      var floorMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.95, roughness: 0.25, envMapIntensity: 0.8 });
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2;
      floor.receiveShadow = true;
      this.objs.add(floor);
      // bouncing cube
      var cubeMat = new THREE.MeshStandardMaterial({ color: 0xff5500, metalness: 0.6, roughness: 0.3, emissive: 0x220800, emissiveIntensity: 0.5 });
      var cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), cubeMat);
      cube.castShadow = true;
      cube.position.y = 0;
      this.objs.add(cube);
      this.cube = cube;
      this.floor = floor;
      scene.add(this.objs);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var reflect = parseFloat(p.ptReflect) || 0.6;
      var bounce = parseFloat(p.ptBounce) || 1;
      var glow = parseFloat(p.ptGlow) || 0.5;
      var sens = parseFloat(p.sensitivity) || 1;
      var bass = (audio.bass || 0) * sens;
      var energy = (audio.energy || 0) * sens;
      this.cube.material.color.copy(hexColor(p.ptColor, 0xff5500));
      this.cube.material.metalness = reflect;
      this.cube.material.emissiveIntensity = glow * (0.5 + energy);
      this.floor.material.metalness = 0.8 + reflect * 0.2;
      // cube bounces up/down with bass
      this.cube.position.y = -2 + Math.abs(Math.sin(time * bounce * 2)) * 3 + bass * 2.5;
      this.cube.rotation.x = time * 0.8;
      this.cube.rotation.y = time * 0.6;
      var s = 1 + energy * 0.2 + (audio.beat || 0) * 0.15;
      this.cube.scale.setScalar(s);
    }
  };

  /* ── THEME: tornado (webgpu_tsl_vfx_tornado) ── */
  var tornadoTheme = {
    key: 'tornado',
    name: 'Tornado VFX',
    init: function (scene) {
      this.objs = new THREE.Group();
      this.count = 8000;
      var pos = new Float32Array(this.count * 3);
      this.base = new Float32Array(this.count * 3);
      for (var i = 0; i < this.count; i++) {
        var h = Math.random() * 12;
        var ang = Math.random() * Math.PI * 2;
        var r = 0.3 + Math.random() * 2.5 * (1 - h / 14);
        var x = Math.cos(ang) * r;
        var z = Math.sin(ang) * r;
        this.base[i * 3] = x; this.base[i * 3 + 1] = h - 6; this.base[i * 3 + 2] = z;
        pos[i * 3] = x; pos[i * 3 + 1] = h - 6; pos[i * 3 + 2] = z;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({ color: 0x66ffcc, size: 0.1, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      this.points = new THREE.Points(geo, mat);
      this.objs.add(this.points);
      scene.add(this.objs);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var height = parseFloat(p.tnHeight) || 12;
      var radius = parseFloat(p.tnRadius) || 2.5;
      var swirl = parseFloat(p.tnSwirl) || 1;
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      this.points.material.color.copy(hexColor(p.tnColor, 0x66ffcc));
      this.points.material.size = 0.08 + energy * 0.06;
      var pos = this.points.geometry.attributes.position.array;
      var spin = time * swirl * (1 + energy * 2);
      for (var i = 0; i < pos.length / 3; i++) {
        var h = this.base[i * 3 + 1] + 6;
        var r = radius * (0.3 + 0.7 * (1 - h / height)) * (1 + bass * 0.4);
        var ang = Math.atan2(this.base[i * 3 + 2], this.base[i * 3]) + spin * (0.3 + h / height * 0.7) + i * 0.0001;
        pos[i * 3] = Math.cos(ang) * r;
        pos[i * 3 + 1] = this.base[i * 3 + 1] + energy * Math.sin(time * 3 + i * 0.01) * 0.5;
        pos[i * 3 + 2] = Math.sin(ang) * r;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
    }
  };

  /* ── THEME: fractal (womogenes/fractal-music-visualizer) ── */
  var fractalTheme = {
    key: 'fractal',
    name: 'Fractal Music',
    init: function (scene) {
      this.objs = new THREE.Group();
      var geo = new THREE.PlaneGeometry(2, 2);
      this.uniforms = {
        uTime: { value: 0 },
        uZoom: { value: 1.2 },
        uPan: { value: new THREE.Vector2(-0.5, 0) },
        uIter: { value: 64 },
        uMode: { value: 0 },
        uAudio: { value: 0 },
        uBass: { value: 0 }
      };
      var mat = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
        fragmentShader: [
          'precision highp float;',
          'varying vec2 vUv;',
          'uniform float uTime,uZoom,uIter,uMode,uAudio,uBass;',
          'uniform vec2 uPan;',
          'void main(){',
          '  vec2 c=uPan+(vUv-0.5)*2.0*uZoom;',
          '  // julia constant driven by audio',
          '  vec2 jul=vec2(cos(uTime*0.3)*0.7885*0.7+uBass*0.3, sin(uTime*0.37)*0.7885*0.7);',
          '  vec2 z=c;',
          '  float iter=0.0;',
          '  for(int i=0;i<128;i++){',
          '    if(iter>=uIter) break;',
          '    z=vec2(z.x*z.x-z.y*z.y,2.0*z.x*z.y)+jul;',
          '    if(dot(z,z)>4.0) break;',
          '    iter+=1.0;',
          '  }',
          '  float m=iter/uIter;',
          '  vec3 col;',
          '  if(uMode<0.5){ col=mix(vec3(0.0,0.1,0.2),vec3(0.0,1.0,0.6),m)+vec3(m*m*0.8); }',
          '  else if(uMode<1.5){ col=mix(vec3(0.2,0.0,0.0),vec3(1.0,0.5,0.1),m); col+=vec3(m*m*0.6,m*m*m,0.0); }',
          '  else { col=mix(vec3(0.0,0.2,0.4),vec3(0.6,0.9,1.0),m); }',
          '  // audio pulse on edges',
          '  col+=uAudio*vec3(0.2,0.4,0.6)*smoothstep(0.5,1.0,m);',
          '  gl_FragColor=vec4(col,1.0);',
          '}'
        ].join('\n')
      });
      var quad = new THREE.Mesh(geo, mat);
      quad.frustumCulled = false;
      this.objs.add(quad);
      this.quad = quad;
      // camera far away looking at quad
      scene.add(this.objs);
    },
    update: function (dt, time, audio, params) {
      var p = params || {};
      var zoom = parseFloat(p.frZoom) || 1.2;
      var iter = parseInt(p.frIter) || 64;
      var mode = (p.frColor || 'classic') === 'classic' ? 0 : (p.frColor === 'fire' ? 1 : 2);
      var sens = parseFloat(p.sensitivity) || 1;
      var energy = (audio.energy || 0) * sens;
      var bass = (audio.bass || 0) * sens;
      this.uniforms.uTime.value = time;
      this.uniforms.uZoom.value = zoom;
      this.uniforms.uIter.value = iter;
      this.uniforms.uMode.value = mode;
      this.uniforms.uAudio.value = energy;
      this.uniforms.uBass.value = bass;
      this.uniforms.uPan.value.x = (parseFloat(p.frPanX) || -0.5) + bass * 0.1;
      this.uniforms.uPan.value.y = (parseFloat(p.frPanY) || 0) + energy * 0.1;
    }
  };

  window.__THEMES = {
    lines: linesTheme,
    points: pointsTheme,
    waves: wavesTheme,
    billboards: billboardsTheme,
    marching: marchingTheme,
    pathtracer: pathtracerTheme,
    tornado: tornadoTheme,
    fractal: fractalTheme
  };
})();
