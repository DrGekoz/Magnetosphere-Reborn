'use strict';
// ────────────────────────────────────────────────────────────────
// Post-processing engine — 11 toggleable passes on top of THREE.js.
// Uses window.THREE (UMD r169+) from vendor/three.js.
// All custom passes are ShaderPass wrappers with inline GLSL.
// Params live in state.postProcessing[name]; applied via engine.apply().
//
// Architecture:
//   EffectComposer(renderTarget)          ← off-screen buffers
//     ├─ RenderPass(scene, camera)        ← always rendered first
//     ├─ [UnrealBloomPass]                ← built-in
//     ├─ [SelectiveBloomPass]             ← manual render chain
//     ├─ [DOFPass]                        ← bokeh + depth buffer
//     ├─ [GodRaysPass]                    ← volumetric light shafts
//     ├─ [SSAOPass / GTAOPass]            ← screen-space ambient occlusion
//     ├─ [SSRPass]                        ← screen-space reflections
//     ├─ [TransitionPass]                 ← crossfade
//     ├─ [LensFlarePass]                  ← ghost overlay
//     ├─ [PixelatePass]                   ← blocky pixelation
//     ├─ [RGBHalftonePass]                ← channel-separated dots
//     └─ [OutlinePass]                     ← Sobel edge detection
//       └─ OutputPass (optional ACES)      ← last, tone-maps to screen
//
// Integration:
//   • In app.js render loop, call engine.render(time) after the scene
//     is drawn — Composer takes care of the rest.
//   • For Three.js (orb) modes the composer writes to screen directly.
//   • For raw-webgl modes you can still feed the composite result through.
// ────────────────────────────────────────────────────────────────

(function () {

/* ───────────── sanity gate ───────────── */
var THREE;
try { THREE = window.THREE; } catch (_) { }
if (!THREE || !THREE.EffectComposer) { console.warn('[PP] EffectComposer unavailable'); return; }

/* ───────────── helpers ───────────── */
var _rtPool = {};

function rt(w, h, opts) {
  opts = opts || {};
  var key = w + 'x' + h + '_' + (opts.type || 'hf') + '_' + (opts.depth ? 'd' : '');
  var t = _rtPool[key];
  if (t && t.width === w && t.height === h) return t;
  // cleanup stale entries
  Object.keys(_rtPool).forEach(function (k) {
    if (!_rtPool[k].isWebGLRenderTexture()) delete _rtPool[k];
  });
  t = new THREE.WebGLRenderTarget(w, h, {
    minFilter: opts.minFilter || THREE.LinearFilter,
    magFilter: opts.magFilter || THREE.LinearFilter,
    type: opts.type || THREE.HalfFloatType,
    format: opts.format || THREE.RGBAFormat,
    depthBuffer: !!opts.depth,
    stencilBuffer: false,
  });
  return t;
}

function disposeRT(t) {
  try { if (t) t.dispose(); } catch (e) {}
}

/* ───────────── base pass ───────────── */
var PPBase = function (name, defaults) {
  this.name    = name;
  this.enabled = false;
  this.params  = Object.assign({}, defaults);
  this.pass    = null;   // ShaderPass reference
};
PPBase.prototype.enable   = function () { this.enabled = true; };
PPBase.prototype.disable  = function () { this.enabled = false; };
PPBase.prototype.apply    = function (_s, _t) { /* noop */ };
PPBase.prototype.setSize  = function (_w, _h) { /* noop */ };
PPBase.prototype.dispose  = function () {
  if (this.pass && typeof this.pass.dispose === 'function') this.pass.dispose();
};

/* ═══════════════════════════════════════════
   1. UnrealBloomPass — wraps THREE built-in
   ═══════════════════════════════════════════ */
function BloomPass(comp, w, h) {
  PPBase.call(this, 'unrealBloom', { resolution: [1, 1], strength: 0.85, radius: 0.5, threshold: 0.25 });
  this._rtSize = new THREE.Vector2(
    Math.floor(w * this.params.resolution[0]),
    Math.floor(h * this.params.resolution[1])
  );
  this._pass = new THREE.UnrealBloomPass(this._rtSize, this.params.strength, this.params.radius, this.params.threshold);
  this.pass  = this._pass;
  this._comp = comp;
  comp.addPass(this._pass);
}
BloomPass.prototype = Object.create(PPBase.prototype);

BloomPass.prototype.apply = function (p) {
  p = p || this.params;
  this._pass.strength  = p.strength;
  this._pass.radius    = p.radius;
  this._pass.threshold = p.threshold;
  // keep resolution proportional
  var sz = this._comp.getSize(new THREE.Vector2());
  this._rtSize.set(
    Math.floor(sz.x * p.resolution[0]),
    Math.floor(sz.y * p.resolution[1])
  );
  this._pass.setSize(this._rtSize.x, this._rtSize.y);
};

BloomPass.prototype.setSize = function (w, h) {
  this._rtSize.set(
    Math.floor(w * this.params.resolution[0]),
    Math.floor(h * this.params.resolution[1])
  );
  this._pass.setSize(this._rtSize.x, this._rtSize.y);
};

/* ═══════════════════════════════════════════
   2. SelectiveBloomPass — bright-pass → blur → blend per-layer
   ═══════════════════════════════════════════ */
function SelectiveBloomPass(comp, scene, camera, w, h) {
  PPBase.call(this, 'selectiveBloom', { layers: 0, strength: 0.6, radius: 0.35, threshold: 0.2 });
  this._scene = scene;
  this._camera = camera;

  // Offscreen targets for the multi-step chain
  this._rtBright  = rt(Math.floor(w / 2), Math.floor(h / 2));
  this._rtBlurH   = rt(Math.floor(w / 4), Math.floor(h / 4));
  this._rtBlurV   = rt(Math.floor(w / 4), Math.floor(h / 4));
  this._rtAccum   = rt(w, h);

  // Bright-pass filter
  this._brightPass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, threshold: { value: 0.2 },
      layerMask: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;',
      'void main(){',
      '  vec4 c = texture2D(tDiffuse, vUv);',
      '  float br = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));',
      '  gl_FragColor = br > threshold ? c : vec4(0.);',
      '}'
    ].join('\n'),
  });

  // Gaussian blur (separable)
  this._blurPass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      direction: { value: new THREE.Vector2(1, 0) },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 direction; uniform vec2 resolution; varying vec2 vUv;',
      'void main(){',
      '  vec2 ts = direction / resolution;',
      '  vec4 s = texture2D(tDiffuse, vUv)*0.2270270;',
      '  s += texture2D(tDiffuse, vUv+ts*1.3846154)*0.3162162;',
      '  s += texture2D(tDiffuse, vUv-ts*1.3846154)*0.3162162;',
      '  s += texture2D(tDiffuse, vUv+ts*3.2307692)*0.0702703;',
      '  s += texture2D(tDiffuse, vUv-ts*3.2307692)*0.0702703;',
      '  gl_FragColor = s;',
      '}'
    ].join('\n'),
  });

  // Blend original + blended bloom
  this._blendPass = new THREE.ShaderPass({
    uniforms: {
      tOriginal: { value: null }, tBloom: { value: null },
      strength: { value: 0.6 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tOriginal; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv;',
      'void main(){',
      '  vec3 orig = texture2D(tOriginal, vUv).rgb;',
      '  vec3 bloom = texture2D(tBloom, vUv).rgb;',
      '  gl_FragColor = vec4(orig + bloom * strength, 1.);',
      '}'
    ].join('\n'),
  });

  this._chainReady = true;
}
SelectiveBloomPass.prototype = Object.create(PPBase.prototype);

SelectiveBloomPass.prototype.enable   = function () { this.enabled = true; };
SelectiveBloomPass.prototype.disable  = function () { this.enabled = false; };

SelectiveBloomPass.prototype.setSize = function (w, h) {
  var hw = Math.floor(w / 2), hh = Math.floor(h / 2);
  var qw = Math.floor(w / 4), qh = Math.floor(h / 4);
  this._rtBright.setSize(hw, hh);
  this._rtBlurH.setSize(qw, qh);
  this._rtBlurV.setSize(qw, qh);
  this._rtAccum.setSize(w, h);
  this._blurPass.uniforms.resolution.value.set(qw, qh);
};

// Assign an object to a specific bloom layer
SelectiveBloomPass.prototype.addToScene = function (layerIndex) {
  if (this._scene && this._scene.traverse) {
    this._scene.traverse(function (o) { o.layers.enable(layerIndex); });
  }
};

// Manual render chain executed from App's render loop
SelectiveBloomPass.prototype.renderChain = function (comp) {
  if (!this.enabled) return;
  var p = this.params;
  var scene = this._scene;
  var cam   = this._camera;
  var rw = comp.size.width, rh = comp.size.height;

  // Bright-pass: copy original → highlight bright pixels
  this._brightPass.uniforms.tDiffuse.value = comp.readBuffer.texture;
  this._brightPass.uniforms.threshold.value = p.threshold;
  this._brightPass.uniforms.layerMask.value = p.layers;
  comp.renderer.setRenderTarget(this._rtBright);
  comp.renderer.autoClear = false;
  comp.renderer.clear();
  comp.renderer.render(scene, cam);

  // Multi-pass blur (descending resolution ×2 per 2 passes)
  var curRead = this._rtBright.texture;
  var curWrite = null;
  var prevWrite = null;
  var targetScale = 4;
  for (var i = 0; i < 4; i++) {
    var horiz = i % 2 === 0;
    var scale = Math.pow(2, Math.floor(i / 2));
    var sw = Math.max(1, Math.floor(rw / (targetScale * Math.max(1, scale))));
    var sh = Math.max(1, Math.floor(rh / (targetScale * Math.max(1, scale))));
    prevWrite = curWrite || (horiz ? this._rtBlurH : this._rtBlurV);
    if (prevWrite.width !== sw || prevWrite.height !== sh) prevWrite.setSize(sw, sh);
    curWrite = horiz ? this._rtBlurV : this._rtBlurH;
    if (curWrite.width !== sw || curWrite.height !== sh) curWrite.setSize(sw, sh);
    this._blurPass.uniforms.tDiffuse.value = curRead;
    this._blurPass.uniforms.direction.value.set(horiz ? 1 : 0, horiz ? 0 : 1);
    this._blurPass.uniforms.resolution.value.set(prevWrite.width, prevWrite.height);
    comp.renderer.setRenderTarget(curWrite);
    comp.renderer.autoClear = true;
    this._blurPass.renderToScreen = false;
    comp.renderer.render(this._blurPass.scene, this._blurPass.camera);
    curRead = curWrite.texture;
  }
  var bloomTex = curWrite.texture;

  // Accumulate: original image + bloom
  this._blendPass.uniforms.tOriginal.value = comp.readBuffer.texture;
  this._blendPass.uniforms.tBloom.value = bloomTex;
  this._blendPass.uniforms.strength.value = p.strength;
  comp.renderer.setRenderTarget(this._rtAccum);
  comp.renderer.autoClear = true;
  this._blendPass.renderToScreen = false;
  comp.renderer.render(this._blendPass.scene, this._blendPass.camera);

  // Swap write buffer so the next phase sees our blended result
  comp.writeBuffer = this._rtAccum;
};

/* ═══════════════════════════════════════════
   3. DOFPass — Bokeh Depth of Field
   ═══════════════════════════════════════════ */
function DOFPass(comp, scene, camera, w, h) {
  PPBase.call(this, 'dof', {
    aperture: 0.0025, maxblur: 0.01, autofocus: false,
    focus: 1.0, rotation: 0.0, fstop: 3.5,
  });
  this._scene = scene;
  this._camera = camera;
  this._comp  = comp;

  // Depth texture for autofocus computation
  this._depthTex = new THREE.DepthTexture(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
  this._depthTex.type = THREE.FloatType;
  this._depthTex.format = THREE.RedFormat;
  this._depthTex.minFilter = THREE.NearestFilter;
  this._depthTex.magFilter = THREE.NearestFilter;

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: this._depthTex },
      focus: { value: 1.0 }, aspect: { value: 1.0 },
      aperture: { value: 0.0025 }, maxblur: { value: 0.01 },
      rotation: { value: 0.0 }, fstop: { value: 3.5 },
      resolution: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform sampler2D tDepth;',
      'uniform float focus, aspect, aperture, maxblur, rotation, fstop; uniform vec2 resolution; varying vec2 vUv;',
      'void main(){',
      '  float depth = texture2D(tDepth, vUv).r;',
      '  float bokehAmount = abs(depth - focus) * aperture * 400.0;',
      '  bokehAmount = clamp(bokehAmount, 0.0, maxblur);',
      '  if (bokehAmount < 0.001){ gl_FragColor = texture2D(tDiffuse, vUv); return; }',
      '  vec2 dir = vec2(cos(rotation), sin(rotation));',
      '  vec4 color = vec4(0.0); float samples = 0.0;',
      '  float radius = bokehAmount * 8.0;',
      '  for (float angle = 0.0; angle < 6.28318; angle += 1.0472) {',
      '    for (float r = 0.0; r <= 1.0; r += 0.25) {',
      '      vec2 offset = dir * radius * r; offset *= vec2(aspect, 1.0);',
      '      color += texture2D(tDiffuse, vUv + offset); samples += 1.0;',
      '    }',
      '  }',
      '  gl_FragColor = color / samples;',
      '  gl_FragColor.a = texture2D(tDiffuse, vUv).a;',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
DOFPass.prototype = Object.create(PPBase.prototype);

DOFPass.prototype.apply = function (st) {
  if (!st || !st.dof) return;
  var p = st.dof;
  this.params.autofocus = ('autofocus' in p) ? p.autofocus : this.params.autofocus;

  if (this.params.autofocus && this._camera && this._camera.isPerspectiveCamera) {
    // Render scene to depth texture for autofocus
    var sz = this._comp.getSize(new THREE.Vector2());
    var dw = Math.max(1, Math.floor(sz.x / 2));
    var dh = Math.max(1, Math.floor(sz.y / 2));
    if (this._depthTex.image && (this._depthTex.image.width !== dw || this._depthTex.image.height !== dh)) {
      this._depthTex.image.width  = dw;
      this._depthTex.image.height = dh;
    }
    this._comp.renderer.autoClear = false;
    this._comp.renderer.setRenderTarget(null);  // render directly to depth texture
    this._comp.renderer.clear();
    var vis = [];
    this._scene.traverse(function (c) { vis.push(c.visible); });
    this._scene.traverse(function (c) { c.visible = true; });
    this._comp.renderer.render(this._scene, this._camera);
    this._scene.traverse(function (c, i) { c.visible = vis[i]; });
    this._comp.renderer.autoClear = true;
    // Use camera Z distance as focus point
    var cf = this._camera.position.z;
    this.params.focus = cf;
    this.params.fstop = 0.5 + 0.5 * p.fstop;
  }

  this._pass.uniforms.focus.value         = this.params.autofocus ? this.params.focus : p.focus;
  this._pass.uniforms.aperture.value      = p.aperture;
  this._pass.uniforms.maxblur.value       = p.maxblur;
  this._pass.uniforms.rotation.value      = p.rotation;
  this._pass.uniforms.fstop.value         = p.fstop;
  this._pass.uniforms.aspect.value        = sz.w / (sz.h || 1);
  this._pass.uniforms.resolution.value.set(sz.w || 1, sz.h || 1);
};

DOFPass.prototype.setSize = function (w, h) {
  var dw = Math.max(1, Math.floor(w / 2));
  var dh = Math.max(1, Math.floor(h / 2));
  if (this._depthTex.image) { this._depthTex.image.width = dw; this._depthTex.image.height = dh; }
};

/* ═══════════════════════════════════════════
   4. GodRaysPass — Volumetric Light Shafts
   ═══════════════════════════════════════════ */
function GodRaysPass(comp, scene, camera, light, w, h) {
  PPBase.call(this, 'godrays', { intensity: 0.5, decay: 0.9, density: 0.85, weight: 0.4, quality: 8 });
  this._lightPos = new THREE.Vector2(0.5, 0.5);  // normalized screen coords
  this._rtSpp    = rt(Math.floor(w / 4), Math.floor(h / 4));

  // Pre-compute light position from directional light
  if (light && light.position) {
    var projCam = new THREE.Matrix4();
    projCam.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    var ldir = light.position.clone().normalize();
    var sp = new THREE.Vector3(ldir.x, ldir.y, ldir.z);
    sp.project(projCam);
    this._lightPos.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
  }

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tScatter: { value: null },
      lightPos: { value: this._lightPos },
      intensity: { value: 0.5 }, decay: { value: 0.9 },
      density: { value: 0.85 }, weight: { value: 0.4 },
      samples: { value: 8.0 }, resolution: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform sampler2D tScatter;',
      'uniform vec2 lightPos; uniform float intensity, decay, density, weight, samples; uniform vec2 resolution; varying vec2 vUv;',
      'void main(){',
      '  vec2 texcoord = vUv;',
      '  vec2 delta = (texcoord - lightPos) / (samples * density);',
      '  vec4 color = texture2D(tDiffuse, texcoord);',
      '  float illuminationDecay = 1.0;',
      '  for (float i = 0.0; i < samples; i++) {',
      '    texcoord -= delta;',
      '    vec4 sample = texture2D(tScatter, texcoord);',
      '    sample *= illuminationDecay * weight;',
      '    color += sample; illuminationDecay *= decay;',
      '  }',
      '  gl_FragColor = color * intensity;',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
GodRaysPass.prototype = Object.create(PPBase.prototype);

GodRaysPass.prototype.apply = function (st) {
  if (!st || !st.godrays) return;
  var p = st.godrays;
  this._pass.uniforms.intensity.value  = p.intensity;
  this._pass.uniforms.decay.value      = p.decay;
  this._pass.uniforms.density.value    = p.density;
  this._pass.uniforms.weight.value     = p.weight;
  this._pass.uniforms.samples.value    = p.quality;
};

GodRaysPass.prototype.setSize = function (w, h) {
  this._rtSpp.setSize(Math.floor(w / 4), Math.floor(h / 4));
};

/* ═══════════════════════════════════════════
   5a. SSAOPass — Screen Space Ambient Occlusion
   ═══════════════════════════════════════════ */
function SSAOPass(comp, scene, camera, w, h) {
  PPBase.call(this, 'ssao', { kernelSize: 16, radius: 0.5, decay: 0.75, screenSpaceIntensity: 1.0, outputMode: 'default' });
  this._scene = scene;

  // Generate random sampling kernel
  this._kernel = [];
  for (var ki = 0; ki < this.params.kernelSize; ki++) {
    var sx = Math.random() * 2 - 1;
    var sy = Math.random() * 2 - 1;
    var sz = Math.random();
    var sc = 0.1 + 0.9 * (ki / this.params.kernelSize);
    this._kernel.push(sx * sc, sy * sc, sz * sc);
  }

  // Blur kernel
  this._blurKernel = [0.0229795, 0.0602792, 0.1173104, 0.1730661, 0.1986095];

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      kernel: { value: new Float32Array(this._kernel) },
      kernelSize: { value: this.params.kernelSize },
      radius: { value: this.params.radius },
      decay: { value: this.params.decay },
      screenSpaceIntensity: { value: this.params.screenSpaceIntensity },
      outputMode: { value: 0 },
      resolution: { value: new THREE.Vector2(w, h) },
      cameraNear: { value: camera.near },
      cameraFar: { value: camera.far },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float kernel[${KERNEL_SIZE}], kernelSize, radius, decay, screenSpaceIntensity; uniform int outputMode;',
      'uniform vec2 resolution; uniform float cameraNear, cameraFar; varying vec2 vUv;',
      'void main(){',
      '  vec4 color = texture2D(tDiffuse, vUv);',
      '  float fragZ = gl_FragCoord.z / gl_FragCoord.w;',
      '  vec2 texel = 1.0 / resolution;',
      '  float ssao = 0.0; float count = 0.0;',
      '  for (int i = 0; i < 8; i++) {',
      '    if (i >= int(kernelSize)) break;',
      '    vec2 offset = vec2(kernel[i*2]*0.005, kernel[i*2+1]*0.005);',
      '    float d = texture2D(tDiffuse, vUv + offset).a;',
      '    float ao = 1.0 - smoothstep(radius, 0.0, abs(fragZ - d));',
      '    ssao += ao * decay; count += 1.0;',
      '  }',
      '  ssao /= max(count, 1.0);',
      '  ssao = mix(1.0, ssao + 0.15, screenSpaceIntensity);',
      '  gl_FragColor = (outputMode == 1) ? color * vec4(ssao) : vec4(color.rgb * ssao, color.a);',
      '}'
    ].join('\n').replace(/\$\{KERNEL_SIZE\}/g, String(this.params.kernelSize)),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
SSAOPass.prototype = Object.create(PPBase.prototype);

SSAOPass.prototype.apply = function (st) {
  if (!st || !st.ssao) return;
  var p = st.ssao;
  this._pass.uniforms.kernelSize.value  = p.kernelSize;
  this._pass.uniforms.radius.value      = p.radius;
  this._pass.uniforms.decay.value       = p.decay;
  this._pass.uniforms.screenSpaceIntensity.value = p.screenSpaceIntensity;
  this._pass.uniforms.outputMode.value = (p.outputMode === 'blended') ? 1 : 0;
};

SSAOPass.prototype.setSize = function (w, h) {
  this._pass.uniforms.resolution.value.set(w, h);
};

/* ═══════════════════════════════════════════
   5b. GTAOPass — Gradient-based AO variant
   ═══════════════════════════════════════════ */
function GTAOPass(comp, scene, camera, w, h) {
  PPBase.call(this, 'gtao', { intensity: 0.5, thickness: 2.0, screenSpaceIntensity: 1.0 });

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      intensity: { value: 0.5 }, thickness: { value: 2.0 },
      screenSpaceIntensity: { value: 1.0 },
      resolution: { value: new THREE.Vector2(Math.floor(w / 2), Math.floor(h / 2)) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float intensity, thickness, screenSpaceIntensity; uniform vec2 resolution; varying vec2 vUv;',
      'void main(){',
      '  vec4 color = texture2D(tDiffuse, vUv);',
      '  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));',
      '  float dx = abs(texture2D(tDiffuse, vUv + vec2(resolution.x, 0.0)).a - lum);',
      '  float dy = abs(texture2D(tDiffuse, vUv + vec2(0.0, resolution.y)).a - lum);',
      '  float ao = 1.0 - smoothstep(0.0, 0.3, dx + dy);',
      '  ao = mix(ao, 1.0, intensity);',
      '  color.rgb *= mix(0.3, ao + 0.5, screenSpaceIntensity);',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
GTAOPass.prototype = Object.create(PPBase.prototype);

GTAOPass.prototype.apply = function (st) {
  if (!st || !st.gtao) return;
  this._pass.uniforms.intensity.value           = st.gtao.intensity;
  this._pass.uniforms.thickness.value           = st.gtao.thickness;
  this._pass.uniforms.screenSpaceIntensity.value = st.gtao.screenSpaceIntensity;
};

GTAOPass.prototype.setSize = function (w, h) {
  this._pass.uniforms.resolution.value.set(Math.floor(w / 2), Math.floor(h / 2));
};

/* ═══════════════════════════════════════════
   6. SSRPass — Screen Space Reflections
   ═══════════════════════════════════════════ */
function SSRPass(comp, scene, camera, w, h) {
  PPBase.call(this, 'ssr', { intensity: 0.6, roughness: 0.5, thickness: 1.0 });
  this._reflTarget = rt(Math.floor(w / 2), Math.floor(h / 2));

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null },
      intensity: { value: 0.6 }, roughness: { value: 0.5 },
      thickness: { value: 1.0 },
      resolution: { value: new THREE.Vector2(w, h) },
      cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform sampler2D tDepth;',
      'uniform float intensity, roughness, thickness, cameraNear, cameraFar; uniform vec2 resolution; varying vec2 vUv;',
      'float lin(float d){ return cameraFar*cameraNear/(d*(cameraFar-cameraNear)-cameraFar); }',
      'void main(){',
      '  vec4 color = texture2D(tDiffuse, vUv);',
      '  float depth = lin(texture2D(tDepth, vUv).r);',
      '  vec2 uvScale = resolution / 1000.0;',
      '  vec4 refl = vec4(0.0); float maxDist = 30.0 * thickness;',
      '  for (float i = 1.0; i < 64.0; i++) {',
      '    vec2 dir = (fract(vUv * resolution / 10.0) - 0.5) * (1.0 - roughness) * uvScale * i * 2.0;',
      '    vec2 s = vUv + dir;',
      '    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) break;',
      '    float sd = lin(texture2D(tDepth, s).r);',
      '    float dd = abs(sd - depth);',
      '    if (dd < maxDist) { refl += texture2D(tDiffuse, s) * intensity / (i + 1.0); }',
      '    maxDist += dd;',
      '  }',
      '  gl_FragColor = color + refl;',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
SSRPass.prototype = Object.create(PPBase.prototype);

SSRPass.prototype.apply = function (st) {
  if (!st || !st.ssr) return;
  this._pass.uniforms.intensity.value = st.ssr.intensity;
  this._pass.uniforms.roughness.value = st.ssr.roughness;
  this._pass.uniforms.thickness.value = st.ssr.thickness;
};

SSRPass.prototype.setSize = function (w, h) {
  this._reflTarget.setSize(Math.floor(w / 2), Math.floor(h / 2));
  this._pass.uniforms.resolution.value.set(w, h);
};

/* ═══════════════════════════════════════════
   7. TransitionPass — Crossfade / Dissolve
   ═══════════════════════════════════════════ */
function TransitionPass(comp, w, h) {
  PPBase.call(this, 'transition', { duration: 1.0, direction: 'forward' });
  this._progress = 1.0;   // 1 = fully A, 0 = fully B

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tCurrent: { value: null }, tNext: { value: null },
      progress: { value: 1.0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tCurrent; uniform sampler2D tNext; uniform float progress; varying vec2 vUv;',
      'void main(){',
      '  vec4 cur = texture2D(tCurrent, vUv);',
      '  vec4 nxt = texture2D(tNext, vUv);',
      '  gl_FragColor = mix(nxt, cur, smoothstep(0.0, 1.0, progress));',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
TransitionPass.prototype = Object.create(PPBase.prototype);

TransitionPass.prototype.advance = function (dt) {
  if (dt > 0) {
    this._progress = Math.max(0, this._progress - dt / this.params.duration);
    this._pass.uniforms.progress.value = this._progress;
  }
};

TransitionPass.prototype.reset = function () {
  this._progress = 1.0;
  this._pass.uniforms.progress.value = 1.0;
};

TransitionPass.prototype.apply = function (st) {
  if (!st || !st.transition) return;
  if ('duration' in st.transition) this.params.duration = st.transition.duration;
  if (st.transition.direction)    this.params.direction = st.transition.direction;
};

TransitionPass.prototype.setSize = function (_w, _h) { /* no-op */ };

/* ═══════════════════════════════════════════
   8. LensFlarePass — Ghost array overlay
   ═══════════════════════════════════════════ */
function LensFlarePass(comp, w, h) {
  PPBase.call(this, 'lensflare', { intensity: 0.4, ghosts: 6, alphaTest: 0.05 });
  this._lightPos = new THREE.Vector2(0.5, 0.5);

  // Procedural flare sprite (canvas → Texture)
  var cvs = document.createElement('canvas');
  cvs.width = 256; cvs.height = 256;
  var ctx = cvs.getContext('2d');
  var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0,   'rgba(255,255,255,1.0)');
  g.addColorStop(0.1, 'rgba(255,240,220,0.8)');
  g.addColorStop(0.3, 'rgba(200,180,255,0.3)');
  g.addColorStop(1.0, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  var flareTex = new THREE.CanvasTexture(cvs);

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tFlare: { value: flareTex },
      lightPos: { value: this._lightPos },
      intensity: { value: 0.4 }, ghosts: { value: 6.0 },
      alphaTest: { value: 0.05 },
      resolution: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform sampler2D tFlare;',
      'uniform vec2 lightPos; uniform float intensity, ghosts, alphaTest; uniform vec2 resolution; varying vec2 vUv;',
      'void main(){',
      '  vec4 color = texture2D(tDiffuse, vUv);',
      '  vec2 center = vec2(0.5); vec2 dir = lightPos - center;',
      '  for (float i = 1.0; i <= ghosts; i++) {',
      '    float dist = length(lightPos - center) * i;',
      '    if (dist > 1.5) break;',
      '    vec2 gp = center + dir * i * 0.7;',
      '    float a = pow(1.0 / (i + 1.0), 1.5) * intensity;',
      '    a = max(a - alphaTest, 0.0);',
      '    if (gp.x >= 0.0 && gp.x <= 1.0 && gp.y >= 0.0 && gp.y <= 1.0)',
      '      color += texture2D(tFlare, gp) * a;',
      '  }',
      '  vec2 sd = normalize(dir + 0.001);',
      '  float sa = exp(-length(vUv - lightPos) * 3.0) * intensity * 0.3;',
      '  color += vec4(sa * 0.5, sa * 0.6, sa * 0.8, sa);',
      '  gl_FragColor = color;',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
LensFlarePass.prototype = Object.create(PPBase.prototype);

LensFlarePass.prototype.setLightPosition = function (sx, sy) {
  this._lightPos.set(sx, sy);
  this._pass.uniforms.lightPos.value.copy(this._lightPos);
};

LensFlarePass.prototype.apply = function (st) {
  if (!st || !st.lensflare) return;
  this._pass.uniforms.intensity.value = st.lensflare.intensity;
  this._pass.uniforms.ghosts.value    = st.lensflare.ghosts;
  this._pass.uniforms.alphaTest.value = st.lensflare.alphaTest;
};

LensFlarePass.prototype.setSize = function (w, h) {
  this._pass.uniforms.resolution.value.set(w, h);
};

/* ═══════════════════════════════════════════
   9. PixelatePass — Blocky pixelation
   ═══════════════════════════════════════════ */
function PixelatePass(comp, w, h) {
  PPBase.call(this, 'pixelate', { scale: 4 });

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(w, h) },
      scale: { value: 4.0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float scale; varying vec2 vUv;',
      'void main(){',
      '  vec2 size = resolution / scale;',
      '  vec2 coord = floor(vUv * size) / size;',
      '  gl_FragColor = texture2D(tDiffuse, coord);',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
PixelatePass.prototype = Object.create(PPBase.prototype);

PixelatePass.prototype.apply = function (st) {
  if (!st || !st.pixelate) return;
  this._pass.uniforms.scale.value = st.pixelate.scale;
};

PixelatePass.prototype.setSize = function (w, h) {
  this._pass.uniforms.resolution.value.set(w, h);
};

/* ═══════════════════════════════════════════
   10. RGBHalftonePass — Color-channel separated dots
   ═══════════════════════════════════════════ */
function RGBHalftonePass(comp, w, h) {
  PPBase.call(this, 'rgbHalftone', { scale: 8 });

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(w, h) },
      scale: { value: 8.0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float scale; varying vec2 vUv;',
      'float dotPattern(vec2 uv, float spacing){',
      '  vec2 center = uv * resolution / spacing;',
      '  vec2 fv = fract(center) - 0.5;',
      '  return length(fv) * 2.0 - spacing;',
      '}',
      'void main(){',
      '  float R = texture2D(tDiffuse, vUv + vec2(0.003, 0.0)).r;',
      '  float G = texture2D(tDiffuse, vUv).r;',
      '  float B = texture2D(tDiffuse, vUv - vec2(0.003, 0.0)).r;',
      '  float dot = step(0.5, dotPattern(vUv, scale));',
      '  gl_FragColor = vec4(R*(1.0-dot), G*(1.0-dot), B*(1.0-dot), 1.0);',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
RGBHalftonePass.prototype = Object.create(PPBase.prototype);

RGBHalftonePass.prototype.apply = function (st) {
  if (!st || !st.rgbHalftone) return;
  this._pass.uniforms.scale.value = st.rgbHalftone.scale;
};

RGBHalftonePass.prototype.setSize = function (w, h) {
  this._pass.uniforms.resolution.value.set(w, h);
};

/* ═══════════════════════════════════════════
   11. OutlinePass — Sobel edge detection outline
   ═══════════════════════════════════════════ */
function OutlinePass(comp, scene, camera, w, h) {
  PPBase.call(this, 'outline', { threshold: 0.001, color: [0, 0, 0] });
  this._scene = scene;

  this._pass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(w, h) },
      threshold: { value: 0.001 },
      uOutlineColor: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 resolution;',
      'uniform float threshold; uniform vec3 uOutlineColor; uniform float uTime; varying vec2 vUv;',
      'void main(){',
      '  vec2 ts = 1.0 / resolution;',
      '  vec4 center = texture2D(tDiffuse, vUv);',
      '  vec4 tl = texture2D(tDiffuse, vUv + vec2(-ts.x, ts.y));',
      '  vec4 tr = texture2D(tDiffuse, vUv + vec2(ts.x, ts.y));',
      '  vec4 bl = texture2D(tDiffuse, vUv + vec2(-ts.x, -ts.y));',
      '  vec4 br = texture2D(tDiffuse, vUv + vec2(ts.x, -ts.y));',
      '  float L = dot(tl.rgb, vec3(0.299, 0.587, 0.114));',
      '  float R = dot(tr.rgb, vec3(0.299, 0.587, 0.114));',
      '  float T = dot(tl.rgb, vec3(0.299, 0.587, 0.114));',
      '  float B = dot(bl.rgb, vec3(0.299, 0.587, 0.114));',
      '  float C = dot(center.rgb, vec3(0.299, 0.587, 0.114));',
      '  float gx = -L + R - 2.0*C + B;',
      '  float gy = -T + 2.0*C - B;',
      '  float mag = sqrt(gx*gx + gy*gy);',
      '  if (mag > threshold) {',
      '    float pulse = 0.8 + 0.2*sin(uTime*3.0);',
      '    center.rgb = mix(center.rgb, uOutlineColor*pulse + center.rgb*0.5, 0.8);',
      '  }',
      '  gl_FragColor = center;',
      '}'
    ].join('\n'),
  });
  this.pass = this._pass;
  comp.addPass(this._pass);
}
OutlinePass.prototype = Object.create(PPBase.prototype);

OutlinePass.prototype.apply = function (st, time) {
  if (!st || !st.outline) return;
  this._pass.uniforms.threshold.value       = st.outline.threshold;
  this._pass.uniforms.uOutlineColor.value.set(st.outline.color[0], st.outline.color[1], st.outline.color[2]);
  this._pass.uniforms.uTime.value           = time || 0;
};

OutlinePass.prototype.setSize = function (w, h) {
  this._pass.uniforms.resolution.value.set(w, h);
};

/* ═══════════════════════════════════════════
   POSTPROCESSING ENGINE — orchestrator
   ═══════════════════════════════════════════ */
function PostProcessingEngine(renderer, scene, camera, stateRef) {
  this.renderer = renderer;
  this.scene    = scene || null;
  this.camera   = camera || null;
  this.state    = stateRef || (typeof window !== 'undefined' && window.__magState ? window.__magState : { params: {}, postProcessing: {} });
  if (!this.state.postProcessing) this.state.postProcessing = {};
  this._initialized = false;
}

/* ── deferred init (called after scene+camera exist) ── */
PostProcessingEngine.prototype.init = function (scene, camera) {
  if (this._initialized) return this;
  this.scene = scene || this.scene;
  this.camera = camera || this.camera;
  if (!this.scene || !this.camera) return this;

  // Double-buffered swap chain
  this.readBuffer  = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType });
  this.writeBuffer = this.readBuffer.clone();

  this.composer = new THREE.EffectComposer(this.renderer);
  this.composer.readBuffer  = this.readBuffer;
  this.composer.writeBuffer = this.writeBuffer;

  // Phase 1 — always render scene geometry
  this.renderPass = new THREE.RenderPass(this.scene, this.camera);
  this.composer.addPass(this.renderPass);

  // Optional OutputPass (ACES tone mapping)
  this.outputPass = null;
  if (THREE.OutputPass) {
    this.outputPass = new THREE.OutputPass();
    this.composer.addPass(this.outputPass);
  }

  this._passes = [];
  this._initPasses(this.renderer.domElement);
  this._initialized = true;
  return this;
};

/* ── find directional lights for god-rays (called after scene is populated) ── */
PostProcessingEngine.prototype.scanLights = function (scene) {
  this._dirLight = null;
  if (!scene) return;
  scene.traverse(function (o) { if (o.isDirectionalLight && !this._dirLight) this._dirLight = o; }.bind(this));
  return this._dirLight;
};

PostProcessingEngine.prototype._initPasses = function (elem) {
  var w = elem.clientWidth  || 1,
      h = elem.clientHeight || 1;

  try {
    var pp = new BloomPass(this.composer, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] Bloom init error:', e.message); }

  try {
    pp = new SelectiveBloomPass(this.composer, this.scene, this.camera, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] SelectiveBloom init error:', e.message); }

  try {
    pp = new DOFPass(this.composer, this.scene, this.camera, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] DOF init error:', e.message); }

  // Find directional lights for god-rays light source position
  var dirLight = this._dirLight || null;
  if (!dirLight) {
    this.scene.traverse(function (o) { if (o.isDirectionalLight) dirLight = o; });
  }

  try {
    pp = new GodRaysPass(this.composer, this.scene, this.camera, dirLight, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] GodRays init error:', e.message); }

  try {
    pp = new SSAOPass(this.composer, this.scene, this.camera, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] SSAO init error:', e.message); }

  try {
    pp = new GTAOPass(this.composer, this.scene, this.camera, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] GTA init error:', e.message); }

  try {
    pp = new SSRPass(this.composer, this.scene, this.camera, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] SSR init error:', e.message); }

  try {
    pp = new TransitionPass(this.composer, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] Transition init error:', e.message); }

  try {
    pp = new LensFlarePass(this.composer, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] LensFlare init error:', e.message); }

  try {
    pp = new PixelatePass(this.composer, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] Pixelate init error:', e.message); }

  try {
    pp = new RGBHalftonePass(this.composer, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] RGBHalftone init error:', e.message); }

  try {
    pp = new OutlinePass(this.composer, this.scene, this.camera, w, h);
    this._passes.push(pp);
  } catch(e) { console.log('[PP] Outline init error:', e.message); }
};

/* ── enable / disable ── */
PostProcessingEngine.prototype.enable = function (name) {
  var p = null;
  for (var i = 0; i < this._passes.length; i++) { if (this._passes[i].name === name) { p = this._passes[i]; break; } }
  if (!p) return;
  p.enable();
  // ensure defaults exist in state
  if (!this.state.postProcessing[p.name]) {
    this.state.postProcessing[p.name] = Object.assign({}, p.params);
  }
};

PostProcessingEngine.prototype.disable = function (name) {
  for (var i = 0; i < this._passes.length; i++) {
    if (this._passes[i].name === name) { this._passes[i].disable(); return; }
  }
};

PostProcessingEngine.prototype.toggle = function (name, on) {
  if (on) this.enable(name); else this.disable(name);
};

/* ── any pass enabled? (fast check for render loop) ── */
PostProcessingEngine.prototype.hasEnabled = function () {
  for (var i = 0; i < this._passes.length; i++) {
    if (this._passes[i].enabled) return true;
  }
  return false;
};

/* ── update uniforms from state ── */
PostProcessingEngine.prototype.apply = function (time) {
  if (!this.state) return;
  var pp = this.state.postProcessing || {};

  for (var i = 0; i < this._passes.length; i++) {
    var p = this._passes[i];
    if (!p.enabled) continue;
    var st = pp[p.name] || p.params;
    p.apply(st, time);
  }
};

/* ── resize ── */
PostProcessingEngine.prototype.setSize = function (w, h) {
  this.readBuffer.setSize(w, h);
  if (this.writeBuffer !== this.readBuffer) this.writeBuffer.setSize(w, h);
  for (var i = 0; i < this._passes.length; i++) {
    try { this._passes[i].setSize(w, h); } catch(e) {}
  }
  if (this.composer.setSize) this.composer.setSize(w, h);
};

/* ── render ── */
PostProcessingEngine.prototype.render = function (time) {
  this.apply(time);
  this.composer.render();
};

/* ── dispose ── */
PostProcessingEngine.prototype.dispose = function () {
  for (var i = 0; i < this._passes.length; i++) { this._passes[i].dispose(); }
  if (this.readBuffer)   this.readBuffer.dispose();
  if (this.writeBuffer && this.writeBuffer !== this.readBuffer) this.writeBuffer.dispose();
  if (this.outputPass && typeof this.outputPass.dispose === 'function') this.outputPass.dispose();
};

PostProcessingEngine.prototype.hasActive = function () {
  for (var i = 0; i < this._passes.length; i++) { if (this._passes[i].enabled) return true; }
  return false;
};

PostProcessingEngine.prototype.getEnabled = function () {
  var out = [];
  for (var i = 0; i < this._passes.length; i++) { if (this._passes[i].enabled) out.push(this._passes[i].name); }
  return out;
};

/* ═══════════════════════════════════════════
   Export
   ═══════════════════════════════════════════ */
module.exports = PostProcessingEngine;
// self-reference so both `new ppModule.PostProcessingEngine(...)` and `new ppModule(...)` work
PostProcessingEngine.PostProcessingEngine = PostProcessingEngine;
if (typeof window !== 'undefined' && window.__export) {
  window.__export('postprocessing-engine', module.exports);
}

})();
