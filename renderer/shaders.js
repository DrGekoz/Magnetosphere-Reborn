(function(){
'use strict';
// All GLSL sources for the visualizer.
// Main scene = raymarched metaball field (sum of gaussian blobs = smooth union),
// lit by animated key light + volumetric fog/god rays, reflective env shading,
// procedural starfield. 2D retro modes (bars/scope/plasma) replace the scene.

const SH = {};

// ---------------------------------------------------------------------------
// Main raymarch shader (orbs mode)
// ---------------------------------------------------------------------------
SH.MAIN_VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }
`;

SH.MAIN_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragDepth;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy, uBass, uMid, uTreble, uBeat;
uniform float uFrame;
uniform int uOrbCount;
uniform sampler2D uOrbs;      // xyz=pos w=radius
uniform sampler2D uOrbData;   // x=band y=emitter z=parentOrb w=phase
uniform float uDebugOrbs;     // 1 = draw 3 hardcoded test orbs
uniform mat3 uCam;
uniform vec3 uCamPos;
uniform float uZoom;
uniform float uLightAngle;    // 0..1
uniform vec3 uLightCol;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uGodRays;
uniform float uMergeAmount;
uniform float uReflect, uRough, uEmissive, uAbsorb, uRefract;
uniform vec3 uBandCol[3];
uniform float uBandSat[3];
uniform float uBandLight[3];
uniform float uColorMix;
uniform vec3 uBgCol;
uniform float uBgGlow;
uniform float uStarDensity, uStarBright, uStarTwinkle, uStarSpeed;
uniform float uChromatic;
uniform float uBeatFlash;
uniform float uHeatLamp;      // 0/1 -> light at bottom
uniform float uQuality;       // step multiplier
uniform float uDebugField;    // 1 = visualize field distance (debug)

const int MAX_ORBS = 48;
const float PI = 3.14159265359;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i+vec3(0,0,0)),hash13(i+vec3(1,0,0)),f.x),
                 mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),
                 mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z); }

vec3 uLightDir3() {
  float a = uLightAngle * PI * 2.0;
  float y = mix(0.15, 0.85, uHeatLamp > 0.5 ? 0.2 : 0.5 + 0.5*sin(a*0.5+0.6));
  return normalize(vec3(cos(a)*0.7, y, sin(a)*0.7));
}

// Metaball field. Smooth-min union of sphere SDFs = true distance field with
// merged bridges between close orbs. Gaussian density sum drives band colors.
// Returns SDF (positive outside, negative inside) + accumulated band color + weight.
float field(vec3 p, out vec3 col, out float wsum) {
  float d = 1e9;
  float k = uMergeAmount * 0.55 + 0.02;   // blend width (keep orbs distinct)
  vec3 acc = vec3(0.0);
  wsum = 0.0;
  int n = uOrbCount;
  if (uDebugOrbs > 0.5) n = 3;
  bool first = true;
  for (int i = 0; i < MAX_ORBS; i++) {
    if (i >= n) break;
    vec4 o;
    vec4 od;
    if (uDebugOrbs > 0.5) {
      // hardcoded test orbs around origin
      float a = float(i) * 2.094;
      o = vec4(cos(a)*1.6, sin(float(i)*3.7)*0.4, sin(a)*1.6, 0.9);
      od = vec4(float(i), 1.0, 0.0, 0.0);
    } else {
      o = texelFetch(uOrbs, ivec2(i,0), 0);
      od = texelFetch(uOrbData, ivec2(i,0), 0);
    }
    vec3 dp = p - o.xyz;
    float r = o.w;
    float di = length(dp) - r;
    if (first) {
      d = di;
      first = false;
    } else {
      // IQ smooth-union: never increases past the min (true union with blend)
      float h = clamp(0.5 + 0.5*(di - d)/k, 0.0, 1.0);
      d = min(d, di) - k*h*(1.0-h)*0.5;
    }
    float w = exp(-(dot(dp,dp))/(r*r*1.5));
    int band = int(od.x + 0.5);
    band = clamp(band, 0, 2);
    acc += uBandCol[band] * w;
    wsum += w;
  }
  if (wsum > 0.001) col = acc / wsum; else col = uBandCol[0];
  return d;
}
float fieldN(vec3 p){ vec3 c; float w; return field(p, c, w); }

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.02, -0.02);
  return normalize(
    e.xyy*fieldN(p+e.xyy) + e.yyx*fieldN(p+e.yyx) +
    e.yxy*fieldN(p+e.yxy) + e.xxx*fieldN(p+e.xxx));
}

// fake environment for reflections: vertical gradient + band nebula + glow
vec3 envSample(vec3 rd, vec3 baseCol) {
  float h = rd.y*0.5+0.5;
  vec3 sky = mix(uBgCol, uBgCol*1.6, h);
  float n1 = vnoise(rd*3.0 + vec3(1.7, 3.1, 0.4));
  float n2 = vnoise(rd*6.0 - vec3(2.3, 0.9, 1.1));
  vec3 neb = baseCol * (0.35 + 0.65*n1*n2) * uBgGlow;
  float lg = pow(max(dot(rd, uLightDir3()), 0.0), 8.0);
  neb += uLightCol * lg * 0.6;
  return sky + neb;
}

// starfield at infinity (3 parallax layers), flickers to music
vec3 stars(vec3 rd) {
  vec3 col = vec3(0.0);
  float flick = 0.6 + 0.4*sin(uTime*uStarSpeed*2.0);
  float mus = uStarTwinkle * (0.5 + 0.5*uEnergy) + uBeat*0.35 + uBeatFlash*0.2;
  for (int L = 0; L < 3; L++) {
    float layer = float(L);
    vec3 p = rd * (40.0 + layer*60.0);
    vec3 id = floor(p);
    vec3 fr = fract(p) - 0.5;
    vec2 seed = id.xy + id.z*17.13 + layer*93.7;
    float h = hash12(seed);
    if (h > uStarDensity*0.55) continue;
    vec2 off = vec2(hash12(seed+3.7), hash12(seed+9.1)) - 0.5;
    float d = length(fr.xy + off*0.4);
    float tw = 0.35 + 0.65*abs(sin(uTime*(0.5+h*2.0)*uStarSpeed + h*40.0));
    float a = smoothstep(0.08, 0.0, d) * (0.25+0.45*tw) * uStarBright * (0.4 + 0.3*mus);
    float tint = mix(0.9, 1.0, h);
    col += vec3(tint*0.9, tint, tint*1.05) * a * (0.5 + 0.5*h);
    float sp = smoothstep(0.12, 0.0, abs(fr.y)) * smoothstep(0.3, 0.0, abs(fr.x)) * uBeat;
    col += vec3(1.0) * sp * 0.5 * h;
  }
  return col;
}

// volumetric god rays + fog: march from surface toward light, accumulate light shafts
vec3 volumetric(vec3 ro, vec3 p, vec3 baseCol, vec3 n) {
  vec3 L = uLightDir3();
  float t = 0.02;
  float trans = 1.0;
  vec3 insc = vec3(0.0);
  int steps = int(8.0 * uQuality);
  float stepLen = 0.14;
  for (int i = 0; i < 12; i++) {
    if (i >= steps) break;
    vec3 q = p + L*t;
    vec3 ctmp; float w;
    float f = field(q, ctmp, w);
    float dens = uFogDensity * (0.5 + 0.5*vnoise(q*2.0 + uTime*0.05));
    dens += (1.0 - clamp(-f*0.8, 0.0, 1.0)) * w * 0.9;
    float shadow = (f < 0.05) ? 0.08 : 1.0;
    float scat = dens * stepLen;
    trans *= exp(-scat);
    vec3 scatCol = uLightCol * (0.5 + 0.5*shadow) + baseCol * 0.35;
    insc += scatCol * scat * trans * uGodRays * (1.2 + uEnergy*0.8);
    t += stepLen * (0.8 + 0.4*hash12(gl_FragCoord.xy + float(i)*17.0));
    if (trans < 0.02) break;
  }
  vec3 fogCol = uFogCol * (0.8 + 0.4*uEnergy) + uLightCol*0.15*uGodRays;
  return insc + fogCol * (1.0 - trans) * (0.5 + 0.5*uEnergy);
}

void main() {
  vec2 uv = vUV;
  vec2 p = (uv*2.0 - 1.0);
  p.x *= uRes.x / uRes.y;
  vec3 rd = normalize(uCam * vec3(p, uZoom));

  float beat = uBeat * uBeatFlash * 0.6;

  vec3 bgCol = mix(uBgCol, uBgCol*1.15, rd.y*0.5+0.5);
  vec3 neb = vec3(0.0);
  {
    float n1 = vnoise(rd*4.0 + vec3(1.2, 2.0, 0.3) + uTime*0.012);
    float n2 = vnoise(rd*8.0 - vec3(0.7, 1.1, 1.6) - uTime*0.008);
    vec3 nebCol = mix(uBandCol[0], uBandCol[1], n1*0.5+0.5);
    nebCol = mix(nebCol, uBandCol[2], n2*0.5+0.5);
    neb = nebCol * (0.04 + 0.18*n1*n2) * uBgGlow * (1.0 + beat);
  }
  bgCol += neb;
  bgCol += stars(rd);

  vec3 ro = uCamPos;
  float t = 0.02;
  float tmax = 18.0;
  bool hit = false;
  vec3 colAcc = uBandCol[0];
  float wsum = 1.0;
  int msteps = int(56.0 * uQuality);
  for (int i = 0; i < 96; i++) {
    if (i >= msteps) break;
    vec3 q = ro + rd*t;
    float d = field(q, colAcc, wsum);
    if (d < 0.004) { hit = true; break; }
    t += max(d*0.9, 0.012);
    if (t > tmax) break;
  }

  vec3 col = bgCol;
  float depth = tmax;
  if (uDebugField > 0.5) {
    // debug: show where the march hits
    float tt = 0.02;
    bool dbgHit = false;
    int dbgSteps = 0;
    for (int i = 0; i < 96; i++) {
      if (i >= msteps) break;
      vec3 q = ro + rd*tt;
      float f = fieldN(q);
      if (f < 0.004) { dbgHit = true; break; }
      tt += max(f*0.9, 0.012);
      dbgSteps = i;
      if (tt > tmax) break;
    }
    vec3 dc = dbgHit ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0); // green hit / red miss
    // flash by steps
    dc = mix(dc, vec3(1.0), float(dbgSteps)/96.0 * 0.4);
    fragColor = vec4(dc, 1.0);
    fragDepth = vec4(tmax, 0.0, 0.0, 1.0);
    return;
  }
  if (hit) {
    vec3 q = ro + rd*t;
    vec3 n = calcNormal(q);
    vec3 v = normalize(ro - q);
    vec3 L = uLightDir3();
    depth = t;

    vec3 base = colAcc;
    vec3 mixed = (uBandCol[0]+uBandCol[1]+uBandCol[2])/3.0;
    // only blend when deep in merge; cap the muddy effect
    float mergeBlend = clamp(wsum-1.0, 0.0, 1.0);
    base = mix(base, mixed, uColorMix * mergeBlend * 0.4);
    float wc = clamp(wsum, 0.5, 6.0);

    float diff = max(dot(n, L), 0.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 rimCol = mix(uBandCol[1], uLightCol, 0.5);

    vec3 H = normalize(L + v);
    float rough = uRough;
    float spec = pow(max(dot(n, H), 0.0), 8.0 + 96.0*(1.0-rough)) * (1.0 - rough*0.7);
    vec3 specCol = mix(base * 1.4, vec3(1.0), 0.25) * uReflect;  // tinted specular

    vec3 R = reflect(-v, n);
    vec3 e1 = envSample(R, base);
    vec3 R2 = reflect(-v, n + vec3(rough*0.4, rough*0.4, 0.0));
    vec3 e2 = envSample(R2, base);
    vec3 refl = mix(e1, e2, 0.5);

    float coreDepth = clamp((wsum - 1.0) * 1.2, 0.0, 1.5);
    float absorb = exp(-uAbsorb * coreDepth * 3.0);

    vec3 nn = normalize(n + vec3(vnoise(q*3.0)-0.5, vnoise(q*3.0+vec3(5.0))-0.5, 0.0)*uRefract*0.6);

    float em = uEmissive * (0.7 + 0.5*uEnergy + beat*0.8);
    float core = exp(-coreDepth*1.4);
    vec3 emiss = base * em * core * wc * (0.8 + 0.2*sin(uTime*3.0 + length(q)*2.0));

    float li = 1.0 + uEnergy*0.9 + beat;

    vec3 shade = base * diff * li * uLightCol * (1.0 - uAbsorb*0.5);
    shade += specCol * spec * li * uLightCol;
    shade += refl * uReflect * (0.25 + 0.35*uEnergy) * li;
    shade += rimCol * fres * (0.5 + 0.5*uEnergy) * 0.8;
    shade *= absorb;
    shade += emiss;
    col = shade;

    vec3 vol = volumetric(ro, q, base, n);
    col = col * exp(-uFogDensity*0.8) + vol;
  } else {
    float tdist = smoothstep(0.0, tmax, t);
    vec3 fogCol = uFogCol * (0.7 + 0.5*uEnergy) + uLightCol*0.25*uGodRays*(0.5+0.5*sin(uTime*0.1));
    col = mix(col, fogCol, tdist*0.7);
    vec3 L = uLightDir3();
    float shaft = pow(max(dot(rd, L), 0.0), 24.0) * uGodRays * (0.3 + 0.4*uEnergy);
    col += uLightCol * shaft * 0.5;
  }

  if (uHeatLamp > 0.5) {
    float warm = pow(max(0.0, 1.0 - vUV.y), 2.0) * (0.25 + 0.4*uEnergy);
    col = mix(col, vec3(1.0, 0.55, 0.22), warm*0.35);
  }

  fragColor = vec4(col, 1.0);
  fragDepth = vec4(depth, wsum, 0.0, 1.0);
}
`;
SH.BARS_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragDepth;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy, uBass, uBeat;
uniform sampler2D uFft;
uniform vec3 uBandCol[3];
uniform vec3 uBgCol;
const int BARS = 96;
void main(){
  vec2 uv = vUV;
  float h = 1.0 - uv.y;
  vec3 col = uBgCol * 0.6;
  float x = uv.x * float(BARS);
  int bi = int(x);
  float v = 0.0;
  for (int k = -1; k <= 1; k++) {
    int b = bi + k;
    if (b < 0 || b >= BARS) continue;
    float fv = texelFetch(uFft, ivec2(b,0), 0).r;
    float fracv = 1.0 - abs(x - float(b) - 0.5);
    v = max(v, fv * fracv * (0.4 + uBass*0.6));
  }
  v = v * (0.35 + 0.65*uEnergy) + uBeat*0.12;
  float bh = v * 0.85;
  float band = floor(mix(0.0, 3.0, float(bi)/float(BARS)));
  vec3 bc = band < 1.0 ? uBandCol[0] : (band < 2.0 ? uBandCol[1] : uBandCol[2]);
  float top = 0.5 - bh;
  float barA = 0.0;
  if (h > top && h < 0.5) barA = smoothstep(top, top+0.02, h) * (0.6 + 0.4*v);
  float botA = 0.0;
  float hbot = 0.5 + bh;
  if (h > 0.5 && h < hbot) botA = smoothstep(hbot, hbot-0.03, h) * 0.25 * v;
  vec3 barCol = bc * (1.5 + uEnergy) + vec3(1.0)*uBeat*0.4;
  col += barCol * barA;
  col += barCol * botA;
  col += bc * uBeat * 0.08;
  fragColor = vec4(col, 1.0);
  fragDepth = vec4(10.0, 0.0, 0.0, 1.0);
}
`;

SH.SCOPE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragDepth;
uniform float uTime;
uniform float uEnergy, uBass, uBeat;
uniform sampler2D uWave;
uniform vec3 uBgCol;
void main(){
  vec2 uv = vUV;
  vec3 col = uBgCol * 0.35;
  float n = 0.0;
  for (int l = 0; l < 4; l++) {
    float fl = float(l);
    float yc = 0.25 + fl*0.166;
    if (abs(uv.y - yc) > 0.09) continue;
    float x = uv.x;
    float s = texelFetch(uWave, ivec2(int(x*1023.0),0), 0).r;
    float y = yc + s*0.075*(1.0+uBass*0.6);
    float d = abs(uv.y - y) / (0.012 + 0.004*uEnergy);
    n += exp(-d*d*8.0) * (0.7 + 0.3*uEnergy);
  }
  vec3 ph = vec3(0.3, 1.0, 0.45) * (0.8 + 0.4*uEnergy) + vec3(0.6,1.0,0.7)*uBeat*0.5;
  col += ph * n * 1.4;
  col += ph * uEnergy * 0.05;
  fragColor = vec4(col, 1.0);
  fragDepth = vec4(10.0, 0.0, 0.0, 1.0);
}
`;

SH.PLASMA_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragDepth;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy, uBass, uBeat;
uniform sampler2D uFft;
uniform vec3 uBandCol[3];
uniform vec3 uBgCol;
float vnoise2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 uv = vUV;
  vec2 p = uv*3.0;
  float t = uTime*0.25;
  float bass = uBass * 0.4 + 0.6;
  float v = 0.0;
  v += sin(p.x*2.0 + t + sin(p.y*1.5 + t*0.7)*0.5)*bass;
  v += sin(p.y*2.0 - t*1.3 + cos(p.x*1.7 - t*0.4)*0.6);
  v += sin((p.x+p.y)*1.3 + t*0.9 + uEnergy*2.0);
  v += sin((p.x*1.8 - p.y*1.1) + t*1.7);
  v += vnoise2(p*2.0 + t)*uEnergy*2.0;
  v *= 0.25 + 0.1*uBass*3.0;
  v = v*0.5 + 0.5;
  float hue = v + uTime*0.02;
  vec3 col = mix(uBandCol[0], uBandCol[1], smoothstep(0.2,0.8,hue));
  col = mix(col, uBandCol[2], smoothstep(0.5,1.0,hue));
  col *= (0.6 + 0.6*v) * (0.8 + 0.4*uEnergy);
  col += vec3(1.0)*uBeat*0.1;
  col = mix(col, uBgCol*0.3, smoothstep(0.15,0.0,v));
  fragColor = vec4(col, 1.0);
  fragDepth = vec4(10.0, 0.0, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Bloom
// ---------------------------------------------------------------------------
SH.BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uThreshold;
void main(){ vec3 c = texture(uTex, vUV).rgb; float b = max(c.r, max(c.g, c.b)); c *= smoothstep(uThreshold, uThreshold*1.6, b); fragColor = vec4(c,1.0); }
`;

SH.BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform vec2 uRes;
void main(){
  vec2 px = 1.0/uRes;
  vec3 c = texture(uTex, vUV).rgb * 0.227027;
  c += texture(uTex, vUV + uDir*px*1.3846).rgb * 0.3162162;
  c += texture(uTex, vUV - uDir*px*1.3846).rgb * 0.3162162;
  c += texture(uTex, vUV + uDir*px*3.2307).rgb * 0.0702703;
  c += texture(uTex, vUV - uDir*px*3.2307).rgb * 0.0702703;
  fragColor = vec4(c, 1.0);
}
`;

// fade pass for particle trails persistence
SH.FADE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uFade;
void main(){ vec3 c = texture(uTex, vUV).rgb * uFade; fragColor = vec4(c, 1.0); }
`;

// ---------------------------------------------------------------------------
// Particles (additive point sprites into trails FBO)
// ---------------------------------------------------------------------------
SH.PART_VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aCol;
layout(location=2) in float aSize;
layout(location=3) in float aLife;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uPxSize;
out vec3 vCol;
out float vLife;
out float vDepth;
void main(){
  vec4 cp = uView * vec4(aPos, 1.0);
  vec4 c = uProj * cp;
  gl_Position = c;
  float sz = aSize * uPxSize / max(0.001, -cp.z);
  gl_PointSize = clamp(sz, 0.5, 64.0);
  vCol = aCol; vLife = aLife;
  vDepth = length(cp.xyz); // camera-space distance
}
`;

SH.PART_FRAG = `#version 300 es
precision highp float;
in vec3 vCol;
in float vLife;
in float vDepth;
uniform sampler2D uDepth;
uniform vec2 uRes;
out vec4 fragColor;
void main(){
  vec2 c = gl_PointCoord*2.0-1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float a = smoothstep(1.0, 0.0, d);
  a *= a * vLife;
  vec4 dep = texture(uDepth, gl_FragCoord.xy/uRes);
  float occ = 1.0;
  if (dep.x < 16.0) occ = smoothstep(0.5, 0.0, vDepth - dep.x); // fade when behind surface
  fragColor = vec4(vCol * (a * occ), a * occ);
}
`;

// ---------------------------------------------------------------------------
// Composite: scene + bloom + trails + vignette + scanlines + dither + CA
// ---------------------------------------------------------------------------
SH.COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uTrails;
uniform float uBloomIntensity;
uniform float uVignette;
uniform float uScanlines;
uniform float uChromatic;
uniform float uEnergy, uBeat;
uniform vec2 uRes;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 uv = vUV;
  vec2 cc = uv - 0.5;
  float ca = uChromatic * (0.3 + 0.5*uEnergy) * length(cc);
  vec3 col;
  if (ca > 0.0005) {
    col.r = texture(uScene, uv + cc*ca*0.012).r;
    col.g = texture(uScene, uv).g;
    col.b = texture(uScene, uv - cc*ca*0.012).b;
  } else {
    col = texture(uScene, uv).rgb;
  }
  col += texture(uBloom, uv).rgb * uBloomIntensity;
  col += texture(uTrails, uv).rgb;
  // exposure + tonemap + gamma
  col *= 0.5;                       // exposure
  col = col / (1.0 + col);         // Reinhard
  col = pow(col, vec3(1.05));      // gamma
  float vg = smoothstep(0.85, 0.35, length(cc));
  col *= mix(1.0, vg, uVignette);
  if (uScanlines > 0.001) {
    float sl = 0.92 + 0.08*sin(uv.y * uRes.y * 3.14159);
    col *= mix(1.0, sl, uScanlines);
  }
  col += (hash12(uv*uRes) - 0.5) * 0.008;
  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

module.exports = SH;
if (typeof window !== "undefined" && window.__export) { window.__export("shaders", module.exports); }

})();
