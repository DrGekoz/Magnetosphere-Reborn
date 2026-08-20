(function(){
'use strict';
// WebGL2 engine: program mgmt, FBO chain, raymarch render, particles, bloom, composite.
// All scene logic (physics, audio mapping) lives in app.js — this is pure GL.

class GLEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance',
    });
    if (!this.gl) throw new Error('WebGL2 unavailable');
    const gl = this.gl;
    // float render targets need these on some drivers (esp. ANGLE/D3D11)
    const ext = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('EXT_float_blend');
    this.floatRenderable = !!ext;
    this.gl = gl;
    this.programs = {};
    this.tex = {};
    this.fbo = {};
    this.particles = null;
    this.dpr = 1;
    this._u = {}; // uniform caches
  }

  compile(name, vertSrc, fragSrc) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`[${name}] ${gl.getShaderInfoLog(s)}\n${src.split('\n').slice(0, 40).join('\n')}`);
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[${name}] link: ${gl.getProgramInfoLog(prog)}`);
    this.programs[name] = prog;
    return prog;
  }

  use(name) {
    const gl = this.gl;
    const p = this.programs[name];
    gl.useProgram(p);
    this._u[name] = this._u[name] || {};
    return p;
  }
  uni(name, uName) {
    const gl = this.gl;
    const p = this.programs[name];
    if (!p) return null;
    let map = this._u[name];
    if (!map) { map = this._u[name] = {}; }
    if (!map[uName]) map[uName] = gl.getUniformLocation(p, uName);
    return map[uName];
  }
  set1f(name, u, v) { this.gl.uniform1f(this.uni(name, u), v); }
  set1i(name, u, v) { this.gl.uniform1i(this.uni(name, u), v); }
  set2f(name, u, a, b) { this.gl.uniform2f(this.uni(name, u), a, b); }
  set3f(name, u, a, b, c) { this.gl.uniform3f(this.uni(name, u), a, b, c); }
  set3fv(name, u, v) { this.gl.uniform3fv(this.uni(name, u), v); }
  setMat3(name, u, m) { this.gl.uniformMatrix3fv(this.uni(name, u), false, m); }
  setMat4(name, u, m) { this.gl.uniformMatrix4fv(this.uni(name, u), false, m); }

  // ---- FBO helpers ----
  makeTex(w, h, opts = {}) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const useFloat = opts.float && this.floatRenderable;
    const ifmt = useFloat ? gl.RGBA16F : gl.RGBA8;
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  makeFBO(w, h, opts = {}) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const color = this.makeTex(w, h, opts);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    let depth = null;
    if (opts.depth) {
      depth = this.makeTex(w, h, { float: true, linear: false });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, depth, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, color, depth, w, h, ok };
  }

  resize(w, h) {
    const gl = this.gl;
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    gl.viewport(0, 0, w, h);
    // main scene FBO (float for HDR bloom)
    this.scene = this.makeFBO(w, h, { float: true, depth: true });
    // bloom chain (quarter res)
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.bloomA = this.makeFBO(bw, bh, { float: true });
    this.bloomB = this.makeFBO(bw, bh, { float: true });
    // trails FBO (half res, additive)
    const tw = Math.max(2, w >> 1), th = Math.max(2, h >> 1);
    this.trails = this.makeFBO(tw, th, { float: true });
    // scratch FBO for trail fade (avoids feedback loop)
    this.scratch = this.makeFBO(tw, th, { float: true });
  }

  quad() {
    const gl = this.gl;
    if (this._quad) return this._quad;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this._quad = vao;
    return vao;
  }

  // ---- particle system (GPU point sprites, additive) ----
  initParticles(maxP) {
    const gl = this.gl;
    this.maxParticles = maxP;
    this.particleCount = 0;
    this.pA = new Float32Array(maxP * 8); // xyz, col(rgb), size, life
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pA.byteLength, gl.DYNAMIC_DRAW);
    this.particleBuf = buf;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
    this.particleVao = vao;
  }
  clearParticles() { this.particleCount = 0; }
  addParticle(x, y, z, r, g, b, size, life) {
    if (this.particleCount >= this.maxParticles) return;
    const i = this.particleCount * 8;
    this.pA[i] = x; this.pA[i + 1] = y; this.pA[i + 2] = z;
    this.pA[i + 3] = r; this.pA[i + 4] = g; this.pA[i + 5] = b;
    this.pA[i + 6] = size; this.pA[i + 7] = life;
    this.particleCount++;
  }
  drawParticles(proj, view, pxSize, depthTex, resW, resH) {
    if (this.particleCount === 0) return;
    const gl = this.gl;
    const p = this.programs['particle'];
    gl.useProgram(p);
    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pA.subarray(0, this.particleCount * 8));
    gl.uniformMatrix4fv(this.uni('particle', 'uProj'), false, proj);
    gl.uniformMatrix4fv(this.uni('particle', 'uView'), false, view);
    gl.uniform1f(this.uni('particle', 'uPxSize'), pxSize);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.uniform1i(this.uni('particle', 'uDepth'), 0);
    gl.uniform2f(this.uni('particle', 'uRes'), resW, resH);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}

module.exports = GLEngine;
if (typeof window !== "undefined" && window.__export) { window.__export("gl", module.exports); }

})();
