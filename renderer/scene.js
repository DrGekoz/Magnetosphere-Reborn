(function(){
'use strict';
// Scene: orb physics (metaball field), emitters, orbiters, particles, heat.
// Pure CPU sim; the shader reads orb state via textures.

const MAX_ORBS = 48;

class Orb {
  constructor(x, y, z, r) {
    this.x = x; this.y = y; this.z = z; this.r = r;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.band = 0;       // 0..2
    this.emitter = 0;    // 0/1 emits particles
    this.parent = -1;    // orbit target index (-1 = free)
    this.phase = Math.random() * Math.PI * 2;
    this.heat = 0.3;     // 0..1 lava-lamp heat
    this.temp = 0.3;
  }
}

class Scene {
  constructor() {
    this.orbs = [];
    this.particles = []; // {x,y,z,r,g,b,size,life,maxLife,vx,vy,vz}
    this.time = 0;
    this.pulse = 0;
    this._spawnAcc = 0;
    this._orbAcc = 0;
    this._emoji = 0;
  }

  // theme scene config
  configure(cfg) {
    this.cfg = cfg || {};
  }

  reset(p) {
    this.orbs = [];
    this.particles = [];
    this.time = 0;
    const n = Math.max(1, p.orbCount | 0);
    const spread = 1.5; // containment radius: orbs always visible on screen
    for (let i = 0; i < n; i++) {
      const big = i < Math.max(1, Math.round(n * 0.22));
      // 21in 1080p: big orb ~1.25in (r 0.17-0.24), small ~1cm (r 0.055-0.077)
      const r = big ? 0.135 + Math.random() * 0.035 : 0.05 + Math.random() * 0.02;
      // fibonacci sphere: even spread across the visible sphere
      const yy = 1.0 - (i / Math.max(1, n)) * 2.0;
      const rr = Math.sqrt(1.0 - yy * yy);
      const th = i * 2.399963;
      const rad = (big ? 0.7 + Math.random() * 0.3 : 0.35 + Math.random() * 0.6) * spread;
      const ang = th;
      const o = new Orb(Math.cos(ang) * rad * rr, yy * spread * 0.8, Math.sin(ang) * rad * rr, r);
      o._baseR = r;   // raw radius, orbSize applied live in update
      o.band = Math.floor(Math.random() * 3);
      o.emitter = big ? 1 : (Math.random() < 0.35 ? 1 : 0);
      o.parent = -1;
      this.orbs.push(o);
    }
    // small orbs orbit large ones
    if (p.spawnSmall !== 0 && this.orbs.length >= 3) {
      for (let i = 0; i < this.orbs.length; i++) {
        if (this.orbs[i].r < 0.4) {
          const big = this.orbs.filter((o) => o._baseR >= 0.12);
          if (big.length) this.orbs[i].parent = this.orbs.indexOf(big[Math.floor(Math.random() * big.length)]);
        }
      }
    }
    this.particles = [];
  }

  spawnParticle(px, py, pz, col, size, life) {
    this.particles.push({ x: px, y: py, z: pz, r: col[0], g: col[1], b: col[2], size, life, maxLife: life, vx: 0, vy: 0, vz: 0 });
    if (this.particles.length > 6000) this.particles.splice(0, this.particles.length - 6000);
  }

  // main sim step. a = audio analysis, p = params, themeScene = scene cfg
  update(dt, a, p, themeScene) {
    this.time += dt;
    const cfg = this.cfg || {};
    const vis = p.visualMode;
    const dtc = Math.min(dt, 0.033);
    this.pulse += (a.energy - this.pulse) * 0.2;

    if (vis === 'Fountain') {
      this._fountain(dtc, a, p);
      return;
    }
    if (vis === 'Bars' || vis === 'Scope' || vis === 'Plasma') {
      // 2D modes: still let particles drift but no orb physics
      this._updateParticles(dtc, a, p);
      return;
    }

    const orbs = this.orbs;
    const n = orbs.length;
    const g = p.gravity * 1.6;
    const mag = p.magnetism;
    const swirl = p.swirl;
    const center = p.centerPull;
    const jit = p.jitter;
    const heatOn = p.heatLamp === 1 || cfg.heatLamp || cfg.lava;
    const heatPower = p.heatPower * (cfg.heatLamp || cfg.lava ? 1.6 : 1.0);
    const viscosity = p.viscosity;
    const suck = cfg.suck;      // black hole spiral in
    const torus = cfg.torus;
    const spiral = cfg.spiral;
    const upDraft = cfg.upDraft;
    const emo = a.energy;
    const musicSpeed = 1.0 + emo * (p.musicMotion || 1.2) * 0.8;  // music drives movement speed

    // music-driven radius pulse
    const pulse = 1 + a.bass * 0.14 * p.emitterRate;

    // heat lamp: bottom light heats orbs -> buoyancy up; cooling at top
    let heatField = 0;
    if (heatOn) {
      const yy = Math.min(Math.max(orbs[0] ? orbs[0].y : 0, -2.6), 2.6);
      heatField = 1.0 - Math.abs(2.6 - Math.max(0, yy + 2.6)) / 5.2; // stronger at bottom
    }

    for (let i = 0; i < n; i++) {
      const o = orbs[i];
      if (!o) continue;
      // orbit smalls around their parent
      if (o.parent >= 0 && o.parent < n) {
        const par = orbs[o.parent];
        const rad = par.r * 2.0 + o.r + 0.15;
        o.phase += dtc * (0.8 + mag * 0.9 + emo * 0.4);
        const tx = par.x + Math.cos(o.phase) * rad;
        const tz = par.z + Math.sin(o.phase) * rad;
        const ty = par.y + Math.sin(o.phase * 1.3) * rad * 0.4;
        o.vx += (tx - o.x) * dtc * 2.2;
        o.vy += (ty - o.y) * dtc * 2.2;
        o.vz += (tz - o.z) * dtc * 2.2;
      }

      // heat buoyancy (lava lamp): heat at bottom -> upward accel; cools at top
      if (heatOn) {
        const heatAt = clamp01(1.0 - Math.abs(o.y + 2.6) / 5.2);
        o.heat += (heatAt - o.heat) * dtc * 1.2;
        // heat -> rise
        o.vy += heatPower * o.heat * dtc * 2.4;
        // cooling at top -> fall
        if (o.y > 1.8) o.heat *= (1 - dtc * 0.8);
        // drag so it doesn't fly away
        o.vy -= o.vy * dtc * 0.9;
      }

      // gravity
      o.vy += g * dtc;

      // center pull
      const d = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z) + 0.001;
      const inv = 1.0 / d;
      o.vx -= o.x * inv * center * dtc * 1.5;
      o.vy -= o.y * inv * center * dtc * 1.5;
      o.vz -= o.z * inv * center * dtc * 1.5;

      // swirl (rotational field around Y)
      if (swirl > 0) {
        const sw = swirl * dtc * 0.8 * (1 + emo * 0.6);
        const px = o.x, pz = o.z;
        o.vx += -pz * sw;
        o.vz += px * sw;
      }

      // black-hole suck: pull toward a dark core at origin
      if (suck) {
        const dist = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z) + 0.1;
        o.vx -= o.x / dist * 2.2 * dtc;
        o.vy -= o.y / dist * 2.2 * dtc;
        o.vz -= o.z / dist * 2.2 * dtc;
      }
      // torus orbit (wormholes)
      if (torus) {
        const R = 2.6, r2 = 0.9;
        const tx = R * Math.cos(o.phase);
        const tz = R * Math.sin(o.phase);
        o.phase += dtc * 0.7;
        o.vx += (tx - o.x) * dtc * 2.0;
        o.vz += (tz - o.z) * dtc * 2.0;
        o.vy += (Math.sin(o.phase * 2) * r2 - o.y) * dtc * 1.2;
      }
      // spiral (galaxy)
      if (spiral) {
        o.phase += dtc * 1.4;
        const rad = Math.max(0.4, Math.sqrt(o.x * o.x + o.z * o.z));
        const sp = 0.5 + 0.5 * Math.sin(o.phase * 0.7 + rad * 0.8);
        o.vx += Math.cos(o.phase) * sp * dtc * 1.4;
        o.vz += Math.sin(o.phase) * sp * dtc * 1.4;
      }
      // up draft (fire)
      if (upDraft) o.vy += (0.4 + emo * 0.5) * dtc * 1.5;

      // anti-cluster: keep orbs from piling into one mass
      for (let j = i + 1; j < n; j++) {
        const o2 = orbs[j];
        const dx = o2.x - o.x, dy = o2.y - o.y, dz = o2.z - o.z;
        const dd = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.001;
        const minD = (o.r + o2.r) * 3.2;
        if (dd < minD) {
          const push = (minD - dd) / minD * 0.5 * dtc;
          const px = dx/dd*push, py = dy/dd*push, pz = dz/dd*push;
          o.vx -= px; o.vy -= py; o.vz -= pz;
          o2.vx += px; o2.vy += py; o2.vz += pz;
        }
      }
      // magnetism: attraction/repulsion between orbs
      if (mag > 0) {
        for (let j = i + 1; j < n; j++) {
          const o2 = orbs[j];
          const dx = o2.x - o.x, dy = o2.y - o.y, dz = o2.z - o.z;
          const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.05;
          if (dd > 6) continue;
          const f = (mag * 0.35 + 0.25) * dtc * (o.r * o2.r) / (dd * dd);
          const fx = dx / dd * f, fy = dy / dd * f, fz = dz / dd * f;
          o.vx += fx; o.vy += fy; o.vz += fz;
          o2.vx -= fx; o2.vy -= fy; o2.vz -= fz;
        }
      }

      // jitter (idle life)
      if (jit > 0) {
        o.vx += (Math.random() - 0.5) * jit * dtc * 3.2 * musicSpeed;
        o.vy += (Math.random() - 0.5) * jit * dtc * 3.2 * musicSpeed;
        o.vz += (Math.random() - 0.5) * jit * dtc * 3.2 * musicSpeed;
      }

      // integrate with viscosity damping
      const damp = Math.max(0.2, 1 - viscosity * 0.85);
      o.vx *= damp; o.vy *= damp; o.vz *= damp;
      o.x += o.vx * dtc * musicSpeed;
      o.y += o.vy * dtc * musicSpeed;
      o.z += o.vz * dtc * musicSpeed;

      // soft spherical containment: orbs ALWAYS stay in the visible frustum
      const lim = 1.2;
      const distC = Math.sqrt(o.x*o.x + o.y*o.y + o.z*o.z);
      if (distC > lim) {
        const push = (distC - lim) / distC;
        o.x -= o.x * push * 1.2; o.y -= o.y * push * 1.2; o.z -= o.z * push * 1.2;
        o.vx -= o.x * 0.02; o.vy -= o.y * 0.02; o.vz -= o.z * 0.02;
      }

      // heat lamp visual: red tint when hot
      o.temp += ((heatOn ? o.heat : 0.3) - o.temp) * dtc * 2;
    }

    // music pulse scales orb radii slightly
    for (let i = 0; i < n; i++) {
      const o = orbs[i];
      // orbSize applied LIVE: changing the slider resizes orbs immediately
      const sizeScale = p.orbSize || 1;
      o.r = o._baseR ? o._baseR * pulse * sizeScale : o.r;
      if (!o._baseR) o._baseR = o.r;
      // beat kick: sudden radial spike on beat
      if (a.beat > 0.6 && o._baseR) o.r = o._baseR * (1 + a.beat * 0.25 * (o.band === 0 ? 1 : 0.5));
    }

    // spawn small orbs occasionally (larger orbs birth them)
    if (p.spawnSmall !== 0 && orbs.length < MAX_ORBS) {
      this._orbAcc += dtc;
      if (this._orbAcc > 2.5 + Math.random() * 3) {
        this._orbAcc = 0;
        const parent = orbs.filter((o) => o.r >= 0.5);
        if (parent.length) {
          const pr = parent[Math.floor(Math.random() * parent.length)];
          const nr = 0.055 + Math.random() * 0.022;
          const o = new Orb(pr.x + (Math.random() - 0.5), pr.y + (Math.random() - 0.5), pr.z + (Math.random() - 0.5), nr * (p.orbSize || 1));
          o.band = Math.floor(Math.random() * 3);
          o.emitter = Math.random() < 0.25;
          o.parent = this.orbs.indexOf(pr);
          o._baseR = o.r;
          this.orbs.push(o);
        }
      }
    }

    // particles: emitted by emitter orbs
    if (p.spawnParticles !== 0) {
      this._spawnAcc += dtc * p.emitterRate * (0.5 + emo * 1.5);
      // beat burst: spawn a ring of particles from every emitter
      if (a.beat > 0.6) {
        const emitters2 = orbs.filter((o) => o.emitter && o.r >= 0.1);
        for (const o of emitters2) {
          const col = this._bandRGB(o.band);
          const ring = 10 + Math.floor(a.beat * 10);
          for (let k = 0; k < ring; k++) {
            const ang = (k / ring) * Math.PI * 2;
            const sp = (1.2 + a.beat * 1.5) * (1 + emo);
            this.spawnParticle(o.x, o.y, o.z, col, 0.1, 0.9 + Math.random() * 0.6);
            const pn = this.particles[this.particles.length - 1];
            pn.vx = Math.cos(ang) * sp;
            pn.vy = Math.sin(ang * 0.5) * sp * 0.5;
            pn.vz = Math.sin(ang) * sp;
          }
        }
      }
      const rate = Math.floor(this._spawnAcc);
      this._spawnAcc -= rate;
      const emitters = orbs.filter((o) => o.emitter && o.r >= 0.1);
      for (let e = 0; e < rate; e++) {
        if (!emitters.length) break;
        const o = emitters[Math.floor(Math.random() * emitters.length)];
        const col = this._bandRGB(o.band);
        const ang = Math.random() * Math.PI * 2;
        const up = Math.random() * Math.PI * 2;
        const sp = (0.5 + Math.random() * 0.8) * (1 + emo * 1.4);
        this.spawnParticle(o.x, o.y, o.z, col, 0.08 + Math.random() * 0.1, 1.6 + Math.random() * 1.4);
        const pn = this.particles[this.particles.length - 1];
        pn.vx = Math.cos(ang) * Math.cos(up) * sp;
        pn.vy = Math.sin(up) * sp * 0.5 + 0.2;
        pn.vz = Math.sin(ang) * Math.cos(up) * sp;
      }
    }

    this._updateParticles(dtc, a, p);
  }

  _fountain(dt, a, p) {
    const cfg = this.cfg || {};
    const side = cfg.fountainSide || 'bottom';
    const emo = a.energy;
    const rate = (4 + emo * 14) * dt * 60;
    const count = Math.floor(rate);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 5;
      const y = side === 'bottom' ? -2.8 : 2.8;
      const z = (Math.random() - 0.5) * 2;
      const col = this._bandRGB(Math.floor(Math.random() * 3));
      const up = (2 + Math.random() * 3.2) * (0.6 + emo * 1.2);
      const sp = this.spawnParticle(x, y, z, col, 0.1 + Math.random() * 0.14, 2.2 + Math.random() * 1.6);
      const pn = this.particles[this.particles.length - 1];
      pn.vx = (Math.random() - 0.5) * 0.8;
      pn.vy = side === 'bottom' ? up : -up;
      pn.vz = (Math.random() - 0.5) * 0.8;
      // columnar (matrix): tight vertical columns
      if (cfg.columnar) { pn.vx = 0; pn.vz = 0; pn.x = Math.round(x * 6) / 6; pn.z = Math.round(z * 6) / 6; }
    }
    this._updateParticles(dt, a, p);
  }

  _updateParticles(dt, a, p) {
    const pts = this.particles;
    const emo = a.energy;
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i];
      pt.life -= dt;
      if (pt.life <= 0) { pts.splice(i, 1); continue; }
      // orbit particles around a parent orb: pick nearest large orb and swirl
      if (p.spawnParticles !== 0 && this.orbs.length) {
        // gravity-ish pull toward center + swirl for emitted particles
        const c = 0.6;
        pt.vx -= pt.x * c * dt * 0.6;
        pt.vy -= pt.y * c * dt * 0.6;
        pt.vz -= pt.z * c * dt * 0.6;
      }
      // swirl
      const sw = 0.4 * dt * (1 + emo);
      const px = pt.x, pz = pt.z;
      pt.vx += -pz * sw;
      pt.vz += px * sw;
      // slight buoyancy for fountain
      if (this.cfg && this.cfg.fountain) {
        pt.vy += (this.cfg.fountainSide === 'bottom' ? 0 : -0.3) * dt;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      // fade tail
      pt.size = Math.max(0.01, pt.size - dt * 0.004);
    }
  }

  _bandRGB(band) {
    // band colors provided by caller via param
    return this.bandRGB ? this.bandRGB(band) : [1, 1, 1];
  }

  // upload orb state to textures
  upload(gl, texOrbs, texData) {
    const n = Math.min(this.orbs.length, MAX_ORBS);
    const oa = new Float32Array(MAX_ORBS * 4);
    const da = new Float32Array(MAX_ORBS * 4);
    for (let i = 0; i < MAX_ORBS; i++) {
      if (i < n) {
        const o = this.orbs[i];
        oa[i * 4] = o.x; oa[i * 4 + 1] = o.y; oa[i * 4 + 2] = o.z; oa[i * 4 + 3] = o.r;
        da[i * 4] = o.band; da[i * 4 + 1] = o.emitter; da[i * 4 + 2] = o.parent >= 0 ? 1 : 0; da[i * 4 + 3] = o.heat;
      } else {
        oa[i * 4 + 3] = -1; // radius -1 = invisible
      }
    }
    const gl2 = gl;
    gl2.bindTexture(gl2.TEXTURE_2D, texOrbs);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA32F, MAX_ORBS, 1, 0, gl2.RGBA, gl2.FLOAT, oa);
    gl2.bindTexture(gl2.TEXTURE_2D, texData);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA32F, MAX_ORBS, 1, 0, gl2.RGBA, gl2.FLOAT, da);
  }
}

function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

module.exports = { Scene, MAX_ORBS };
if (typeof window !== "undefined" && window.__export) { window.__export("scene", module.exports); }

})();
