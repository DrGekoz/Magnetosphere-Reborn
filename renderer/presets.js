(function(){
'use strict';
// Presets: parameter schema, materials, global themes. Pure data + color helpers.

// ---------------------------------------------------------------------------
// Parameter schema — drives the settings panel UI. Each entry auto-creates a
// slider/toggle/dropdown bound to the engine.
// ---------------------------------------------------------------------------
const SECTIONS = [
  { id: 'colors', label: 'COLORS' },
  { id: 'orbs', label: 'ORBS & PHYSICS' },
  { id: 'material', label: 'MATERIAL' },
  { id: 'light', label: 'LIGHT & FOG' },
  { id: 'bg', label: 'BACKGROUND' },
  { id: 'fx', label: 'EFFECTS' },
  { id: 'audio', label: 'AUDIO' },
  { id: 'perf', label: 'PERFORMANCE' },
];

const PARAM_SCHEMA = [
  // colors — 3 hue bands (start/end/width + location)
  { key: 'band0HueStart', label: 'Orb Band 1 Hue Start', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'band0HueEnd', label: 'Orb Band 1 Hue End', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'band0Sat', label: 'Orb Band 1 Saturation', section: 'colors', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'band0Light', label: 'Orb Band 1 Lightness', section: 'colors', type: 'slider', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'band1HueStart', label: 'Orb Band 2 Hue Start', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'band1HueEnd', label: 'Orb Band 2 Hue End', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'band1Sat', label: 'Orb Band 2 Saturation', section: 'colors', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'band1Light', label: 'Orb Band 2 Lightness', section: 'colors', type: 'slider', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'band2HueStart', label: 'Orb Band 3 Hue Start', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'band2HueEnd', label: 'Orb Band 3 Hue End', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'band2Sat', label: 'Orb Band 3 Saturation', section: 'colors', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'band2Light', label: 'Orb Band 3 Lightness', section: 'colors', type: 'slider', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'colorMix', label: 'Merge Color Blend', section: 'colors', type: 'slider', min: 0, max: 1, step: 0.01 },
  // orbs & physics
  { key: 'orbCount', label: 'Orb Count', section: 'orbs', type: 'slider', min: 4, max: 48, step: 1 },
  { key: 'orbSize', label: 'Orb Size', section: 'orbs', type: 'slider', min: 0.2, max: 2.2, step: 0.05 },
  { key: 'gravity', label: 'Gravity', section: 'orbs', type: 'slider', min: -2, max: 2, step: 0.05 },
  { key: 'magnetism', label: 'Magnetism', section: 'orbs', type: 'slider', min: 0, max: 2, step: 0.05 },
  { key: 'swirl', label: 'Swirl', section: 'orbs', type: 'slider', min: 0, max: 3, step: 0.05 },
  { key: 'centerPull', label: 'Center Pull', section: 'orbs', type: 'slider', min: 0, max: 1.5, step: 0.05 },
  { key: 'jitter', label: 'Jitter (idle motion)', section: 'orbs', type: 'slider', min: 0, max: 1, step: 0.02 },
  { key: 'heatLamp', label: 'Heat Lamp (lava mode)', section: 'orbs', type: 'toggle', def: 0 },
  { key: 'heatPower', label: 'Heat Power', section: 'orbs', type: 'slider', min: 0, max: 3, step: 0.05 },
  { key: 'merge', label: 'Orbs Merge (metaballs)', section: 'orbs', type: 'toggle', def: 1 },
  { key: 'mergeAmount', label: 'Merge Amount', section: 'orbs', type: 'slider', min: 0, max: 1.5, step: 0.01 },
  { key: 'viscosity', label: 'Viscosity', section: 'orbs', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'spawnSmall', label: 'Spawn Small Orbs', section: 'orbs', type: 'toggle', def: 1 },
  { key: 'spawnParticles', label: 'Orb Particles', section: 'orbs', type: 'toggle', def: 1 },
  { key: 'emitterRate', label: 'Particle Rate', section: 'orbs', type: 'slider', min: 0, max: 4, step: 0.1 },
  // material
  { key: 'material', label: 'Material', section: 'material', type: 'dropdown', options: ['Wax', 'Black Hole', 'Classic', 'Molten Metal', 'Water', 'Honey', 'Blood'] },
  { key: 'reflect', label: 'Reflectivity', section: 'material', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'rough', label: 'Roughness', section: 'material', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'emissive', label: 'Emissive Glow', section: 'material', type: 'slider', min: 0, max: 2, step: 0.02 },
  { key: 'absorb', label: 'Absorption (core dark)', section: 'material', type: 'slider', min: 0, max: 1.5, step: 0.02 },
  { key: 'refract', label: 'Refraction', section: 'material', type: 'slider', min: 0, max: 1, step: 0.01 },
  // light & fog
  { key: 'lightAngle', label: 'Light Angle', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'lightColHue', label: 'Light Hue', section: 'light', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'lightColSat', label: 'Light Saturation', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'lightColLight', label: 'Light Brightness', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'fogDensity', label: 'Fog Density', section: 'light', type: 'slider', min: 0, max: 1.5, step: 0.01 },
  { key: 'fogColHue', label: 'Fog Hue', section: 'light', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'fogColSat', label: 'Fog Saturation', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'fogColLight', label: 'Fog Brightness', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'godRays', label: 'God Rays', section: 'light', type: 'slider', min: 0, max: 2, step: 0.02 },
  // background
  { key: 'bgHue', label: 'Background Hue', section: 'bg', type: 'slider', min: 0, max: 360, step: 1 },
  { key: 'bgSat', label: 'Background Saturation', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'bgLight', label: 'Background Brightness', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'bgGlow', label: 'Nebula Glow', section: 'bg', type: 'slider', min: 0, max: 1.5, step: 0.02 },
  { key: 'starDensity', label: 'Star Density', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'starBright', label: 'Star Brightness', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'starTwinkle', label: 'Star Music Flicker', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'starSpeed', label: 'Star Speed', section: 'bg', type: 'slider', min: 0, max: 3, step: 0.05 },
  // effects
  { key: 'bloom', label: 'Bloom', section: 'fx', type: 'toggle', def: 1 },
  { key: 'bloomIntensity', label: 'Bloom Intensity', section: 'fx', type: 'slider', min: 0, max: 3, step: 0.02 },
  { key: 'vignette', label: 'Vignette', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'scanlines', label: 'Scanlines', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'chromatic', label: 'Chromatic Aberration', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'beatFlash', label: 'Beat Flash', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'motionBlur', label: 'Trail Persistence', section: 'fx', type: 'slider', min: 0.5, max: 0.99, step: 0.01 },
  { key: 'visualMode', label: 'Visual Mode', section: 'fx', type: 'dropdown', options: ['Orbs', 'Bars', 'Scope', 'Plasma', 'Fountain', 'audioMotion'] },
  // audio
  { key: 'sensitivity', label: 'Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
  { key: 'smoothing', label: 'Smoothing', section: 'audio', type: 'slider', min: 0.05, max: 0.95, step: 0.01 },
  { key: 'bassBias', label: 'Bass Bias', section: 'audio', type: 'slider', min: 0, max: 2, step: 0.05 },
  { key: 'beatThreshold', label: 'Beat Threshold', section: 'audio', type: 'slider', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'musicMotion', label: 'Music Motion Speed', section: 'audio', type: 'slider', min: 0, max: 3, step: 0.05 },
  { key: 'audioSource', label: 'Audio Source', section: 'audio', type: 'dropdown', options: ['System Audio', 'Mic', 'Demo'] },
  // performance
  { key: 'quality', label: 'Raymarch Quality', section: 'perf', type: 'slider', min: 0.4, max: 1.5, step: 0.05 },
  { key: 'adaptiveRes', label: 'Adaptive Resolution', section: 'perf', type: 'toggle', def: 1 },
  { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
  { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
];

const DEFAULTS = {
  band0HueStart: 85, band0HueEnd: 115, band0Sat: 1.0, band0Light: 0.62,
  band1HueStart: 130, band1HueEnd: 165, band1Sat: 0.95, band1Light: 0.6,
  band2HueStart: 160, band2HueEnd: 200, band2Sat: 1.0, band2Light: 0.55,
  colorMix: 0.6,
  orbCount: 20, orbSize: 1.0, gravity: -0.25, magnetism: 0.5, swirl: 0.35,
  centerPull: 0.25, jitter: 0.4, heatLamp: 0, heatPower: 1.0,
  merge: 1, mergeAmount: 0.5, viscosity: 0.35, spawnSmall: 1, spawnParticles: 1, emitterRate: 1.2,
  material: 'Classic',
  reflect: 0.5, rough: 0.35, emissive: 1.1, absorb: 0.3, refract: 0.2,
  lightAngle: 0.62, lightColHue: 80, lightColSat: 0.9, lightColLight: 0.95,
  fogDensity: 0.5, fogColHue: 150, fogColSat: 0.75, fogColLight: 0.1, godRays: 1.3,
  bgHue: 150, bgSat: 0.8, bgLight: 0.02, bgGlow: 1.1,
  starDensity: 0.75, starBright: 0.8, starTwinkle: 0.6, starSpeed: 1.0,
  bloom: 1, bloomIntensity: 2.2, vignette: 0.65, scanlines: 0, chromatic: 0.35,
  beatFlash: 0.7, motionBlur: 0.9,
  visualMode: 'Orbs',
  sensitivity: 1.0, smoothing: 0.75, bassBias: 1.0, beatThreshold: 0.22, musicMotion: 1.2, audioSource: 'System Audio',
  quality: 0.8, adaptiveRes: 1, targetFPS: 180, showFPS: 0,
};

// ---------------------------------------------------------------------------
// Materials — each sets a real viscosity + surface behavior + tint.
// ---------------------------------------------------------------------------
const MATERIALS = {
  'Wax': { viscosity: 0.8, mergeAmount: 0.95, reflect: 0.25, rough: 0.75, emissive: 0.5, absorb: 0.2, refract: 0.15, matCol: [0.95, 0.75, 0.5] },
  'Black Hole': { viscosity: 0.15, mergeAmount: 0.3, reflect: 0.85, rough: 0.15, emissive: 0.9, absorb: 1.4, refract: 0.05, matCol: [0.6, 0.7, 1.0] },
  'Classic': { viscosity: 0.35, mergeAmount: 0.65, reflect: 0.5, rough: 0.35, emissive: 0.7, absorb: 0.35, refract: 0.2, matCol: [1, 1, 1] },
  'Molten Metal': { viscosity: 0.55, mergeAmount: 0.6, reflect: 0.9, rough: 0.12, emissive: 1.6, absorb: 0.5, refract: 0.1, matCol: [1.0, 0.5, 0.2] },
  'Water': { viscosity: 0.08, mergeAmount: 0.4, reflect: 0.6, rough: 0.08, emissive: 0.3, absorb: 0.12, refract: 0.9, matCol: [0.5, 0.8, 1.0] },
  'Honey': { viscosity: 0.95, mergeAmount: 1.2, reflect: 0.4, rough: 0.4, emissive: 0.8, absorb: 0.6, refract: 0.35, matCol: [1.0, 0.8, 0.3] },
  'Blood': { viscosity: 0.6, mergeAmount: 0.8, reflect: 0.35, rough: 0.5, emissive: 0.6, absorb: 0.95, refract: 0.4, matCol: [0.9, 0.15, 0.15] },
};

// ---------------------------------------------------------------------------
// Global themes — full-scene overrides (colors, physics, mode, bg elements).
// mode: orbs | bars | scope | plasma | fountain
// ---------------------------------------------------------------------------
function T(o) { return o; }

const THEMES = [
  T({ id: 'eclipse', category: 'Sci-Fi', name: 'Eclipse', mode: 'orbs', desc: 'Dark eclipse core with glowing rim, matches the reference look.',
    params: { band0HueStart: 150, band0HueEnd: 190, band0Sat: 0.95, band0Light: 0.6, band1HueStart: 100, band1HueEnd: 140, band1Sat: 0.8, band1Light: 0.5, band2HueStart: 190, band2HueEnd: 240, band2Sat: 0.9, band2Light: 0.45, bgHue: 190, bgSat: 0.5, bgLight: 0.05, bgGlow: 0.85, fogColHue: 160, fogColSat: 0.6, fogColLight: 0.12, fogDensity: 0.5, godRays: 1.4, lightColHue: 50, lightColSat: 0.9, lightColLight: 0.95, lightAngle: 0.65, starDensity: 0.8, starBright: 0.85, starTwinkle: 0.7, material: 'Black Hole', reflect: 0.85, rough: 0.15, emissive: 1.1, absorb: 1.4, mergeAmount: 0.45, bloomIntensity: 1.8, swirl: 0.9, centerPull: 0.55, orbCount: 30, chromatic: 0.5, beatFlash: 0.9}, scene: { bigCore: true } }),

  T({ id: 'fire', category: 'Nature', name: 'Fire', mode: 'orbs', desc: 'Molten embers, upward heat, orange-red bands.',
    params: { band0HueStart: 0, band0HueEnd: 25, band0Sat: 1, band0Light: 0.55, band1HueStart: 20, band1HueEnd: 45, band1Sat: 1, band1Light: 0.5, band2HueStart: 45, band2HueEnd: 60, band2Sat: 0.95, band2Light: 0.55, bgHue: 10, bgSat: 0.5, bgLight: 0.04, bgGlow: 0.8, fogColHue: 20, fogColSat: 0.9, fogColLight: 0.15, fogDensity: 0.6, godRays: 1.5, lightColHue: 25, lightColSat: 1, lightColLight: 1, lightAngle: 0.75, material: 'Molten Metal', viscosity: 0.55, reflect: 0.8, rough: 0.15, emissive: 1.8, absorb: 0.4, gravity: -0.6, jitter: 0.7, emitterRate: 3, swirl: 0.6, bloomIntensity: 2.2, beatFlash: 1, starDensity: 0.5}, scene: { heatLamp: true, upDraft: true } }),

  T({ id: 'ice', category: 'Nature', name: 'Ice', mode: 'orbs', desc: 'Frozen glass orbs, cyan whites, low viscosity.',
    params: { band0HueStart: 180, band0HueEnd: 200, band0Sat: 0.5, band0Light: 0.8, band1HueStart: 200, band1HueEnd: 230, band1Sat: 0.6, band1Light: 0.75, band2HueStart: 160, band2HueEnd: 190, band2Sat: 0.5, band2Light: 0.85, bgHue: 210, bgSat: 0.6, bgLight: 0.06, bgGlow: 0.9, fogColHue: 195, fogColSat: 0.4, fogColLight: 0.2, fogDensity: 0.45, godRays: 1.2, lightColHue: 200, lightColSat: 0.6, lightColLight: 1, material: 'Water', viscosity: 0.08, reflect: 0.7, rough: 0.05, emissive: 0.4, absorb: 0.08, refract: 1, mergeAmount: 0.4, gravity: -0.15, bloomIntensity: 1.6, chromatic: 0.2}, scene: { icy: true } }),

  T({ id: 'water', category: 'Nature', name: 'Water', mode: 'orbs', desc: 'Deep sea glass, refraction, slow drift.',
    params: { band0HueStart: 190, band0HueEnd: 220, band0Sat: 0.9, band0Light: 0.5, band1HueStart: 210, band1HueEnd: 240, band1Sat: 0.8, band1Light: 0.45, band2HueStart: 170, band2HueEnd: 200, band2Sat: 0.85, band2Light: 0.5, bgHue: 215, bgSat: 0.8, bgLight: 0.05, bgGlow: 0.7, fogColHue: 200, fogColSat: 0.7, fogColLight: 0.12, fogDensity: 0.55, godRays: 1.8, lightColHue: 190, lightColSat: 0.8, lightColLight: 1, lightAngle: 0.8, material: 'Water', viscosity: 0.06, reflect: 0.75, rough: 0.04, emissive: 0.3, absorb: 0.1, refract: 1, mergeAmount: 0.35, gravity: -0.05, swirl: 0.2, centerPull: 0.1, bloomIntensity: 1.5, starDensity: 0.4}, scene: { caustic: true } }),

  T({ id: 'beehive', category: 'Classic', name: 'Beehive', mode: 'orbs', desc: 'Honey gold blobs, super sticky, warm light.',
    params: { band0HueStart: 35, band0HueEnd: 50, band0Sat: 1, band0Light: 0.55, band1HueStart: 40, band1HueEnd: 55, band1Sat: 0.9, band1Light: 0.5, band2HueStart: 50, band2HueEnd: 65, band2Sat: 0.85, band2Light: 0.5, bgHue: 40, bgSat: 0.6, bgLight: 0.05, bgGlow: 0.75, fogColHue: 45, fogColSat: 0.8, fogColLight: 0.14, fogDensity: 0.5, godRays: 1.1, lightColHue: 45, lightColSat: 0.9, lightColLight: 0.9, material: 'Honey', viscosity: 0.95, mergeAmount: 1.2, reflect: 0.4, rough: 0.4, emissive: 0.8, absorb: 0.55, refract: 0.3, gravity: -0.4, centerPull: 0.6, bloomIntensity: 1.3, starDensity: 0.3}, scene: { honeycomb: true } }),

  T({ id: 'space', category: 'Sci-Fi', name: 'Space', mode: 'orbs', desc: 'Classic deep space nebula, purple-blue.',
    params: { band0HueStart: 250, band0HueEnd: 290, band0Sat: 0.9, band0Light: 0.5, band1HueStart: 200, band1HueEnd: 240, band1Sat: 0.85, band1Light: 0.5, band2HueStart: 280, band2HueEnd: 320, band2Sat: 0.8, band2Light: 0.45, bgHue: 260, bgSat: 0.7, bgLight: 0.05, bgGlow: 0.9, fogColHue: 250, fogColSat: 0.6, fogColLight: 0.12, fogDensity: 0.4, godRays: 1.2, lightColHue: 280, lightColSat: 0.7, lightColLight: 0.9, material: 'Classic', reflect: 0.55, rough: 0.3, emissive: 0.8, absorb: 0.3, refract: 0.25, gravity: 0.05, swirl: 0.8, centerPull: 0.35, starDensity: 1, starBright: 1, starTwinkle: 0.8, bloomIntensity: 1.5}, scene: {} }),

  T({ id: 'blackhole', category: 'Sci-Fi', name: 'Black Hole', mode: 'orbs', desc: 'Singularity: giant dark core, accretion glow, everything spirals in.',
    params: { band0HueStart: 30, band0HueEnd: 60, band0Sat: 1, band0Light: 0.6, band1HueStart: 180, band1HueEnd: 220, band1Sat: 0.9, band1Light: 0.55, band2HueStart: 260, band2HueEnd: 300, band2Sat: 1.0, band2Light: 0.55, bgHue: 280, bgSat: 0.5, bgLight: 0.03, bgGlow: 0.5, fogColHue: 200, fogColSat: 0.6, fogColLight: 0.08, fogDensity: 0.6, godRays: 1.6, lightColHue: 40, lightColSat: 0.9, lightColLight: 1, material: 'Black Hole', viscosity: 0.1, reflect: 0.9, rough: 0.1, emissive: 1.2, absorb: 1.5, refract: 0.05, mergeAmount: 0.3, gravity: 0, swirl: 2.2, centerPull: 1.4, magnetism: 1.2, orbCount: 34, starDensity: 0.9, bloomIntensity: 2, beatFlash: 1}, scene: { bigCore: true, suck: true } }),

  T({ id: 'wormholes', category: 'Sci-Fi', name: 'Wormholes', mode: 'orbs', desc: 'Orbs orbit in toroidal rings, tunnel feel.',
    params: { band0HueStart: 160, band0HueEnd: 200, band0Sat: 0.9, band0Light: 0.6, band1HueStart: 280, band1HueEnd: 320, band1Sat: 0.8, band1Light: 0.55, band2HueStart: 30, band2HueEnd: 70, band2Sat: 1.0, band2Light: 0.55, bgHue: 200, bgSat: 0.6, bgLight: 0.04, bgGlow: 0.7, fogColHue: 220, fogColSat: 0.5, fogColLight: 0.1, fogDensity: 0.55, godRays: 1.5, lightColHue: 190, lightColSat: 0.8, lightColLight: 1, material: 'Classic', reflect: 0.6, rough: 0.25, emissive: 0.9, absorb: 0.4, refract: 0.3, mergeAmount: 0.5, gravity: 0, swirl: 2.5, centerPull: 0.8, magnetism: 0.8, orbCount: 40, bloomIntensity: 1.8, chromatic: 0.6}, scene: { torus: true } }),

  T({ id: 'lavalamp', category: 'Nature', name: 'Lava Lamp', mode: 'orbs', desc: 'Heat lamp at bottom: orbs heat, rise, cool, fall — a real lava lamp loop.',
    params: { band0HueStart: 0, band0HueEnd: 20, band0Sat: 1, band0Light: 0.6, band1HueStart: 20, band1HueEnd: 45, band1Sat: 0.95, band1Light: 0.55, band2HueStart: 45, band2HueEnd: 70, band2Sat: 1.0, band2Light: 0.55, bgHue: 350, bgSat: 0.7, bgLight: 0.04, bgGlow: 0.6, fogColHue: 15, fogColSat: 0.9, fogColLight: 0.1, fogDensity: 0.5, godRays: 1.3, lightColHue: 30, lightColSat: 1, lightColLight: 1, lightAngle: 0.25, material: 'Wax', viscosity: 0.85, mergeAmount: 1.0, reflect: 0.3, rough: 0.6, emissive: 0.9, absorb: 0.35, refract: 0.2, heatLamp: 1, heatPower: 2.2, gravity: -0.5, centerPull: 0.1, bloomIntensity: 1.8, starDensity: 0.2}, scene: { lava: true } }),

  T({ id: 'aurora', category: 'Nature', name: 'Aurora', mode: 'orbs', desc: 'Polar green-teal curtains, gentle drift.',
    params: { band0HueStart: 130, band0HueEnd: 170, band0Sat: 0.95, band0Light: 0.65, band1HueStart: 90, band1HueEnd: 130, band1Sat: 0.8, band1Light: 0.6, band2HueStart: 170, band2HueEnd: 210, band2Sat: 0.85, band2Light: 0.55, bgHue: 170, bgSat: 0.6, bgLight: 0.04, bgGlow: 1.2, fogColHue: 150, fogColSat: 0.6, fogColLight: 0.16, fogDensity: 0.6, godRays: 1.6, lightColHue: 120, lightColSat: 0.8, lightColLight: 1, material: 'Classic', reflect: 0.5, rough: 0.3, emissive: 0.9, absorb: 0.25, refract: 0.3, mergeAmount: 0.7, gravity: -0.2, swirl: 0.5, centerPull: 0.3, jitter: 0.7, bloomIntensity: 1.9}, scene: {} }),

  T({ id: 'neon', category: 'Retro', name: 'Neon Retro', mode: 'orbs', desc: 'Synthwave: magenta-pink glow, scanlines, grid stars.',
    params: { band0HueStart: 300, band0HueEnd: 330, band0Sat: 1, band0Light: 0.6, band1HueStart: 260, band1HueEnd: 290, band1Sat: 0.9, band1Light: 0.55, band2HueStart: 180, band2HueEnd: 200, band2Sat: 0.9, band2Light: 0.6, bgHue: 280, bgSat: 0.8, bgLight: 0.05, bgGlow: 0.9, fogColHue: 310, fogColSat: 0.9, fogColLight: 0.14, fogDensity: 0.5, godRays: 1.5, lightColHue: 320, lightColSat: 1, lightColLight: 1, material: 'Classic', reflect: 0.7, rough: 0.2, emissive: 1.1, absorb: 0.3, refract: 0.25, scanlines: 0.35, chromatic: 0.7, bloomIntensity: 2, beatFlash: 1, starDensity: 0.8}, scene: { synth: true } }),

  T({ id: 'bloodmoon', category: 'Energy', name: 'Blood Moon', mode: 'orbs', desc: 'Dark red eclipse, gothic.',
    params: { band0HueStart: 350, band0HueEnd: 10, band0Sat: 1, band0Light: 0.5, band1HueStart: 0, band1HueEnd: 20, band1Sat: 0.9, band1Light: 0.45, band2HueStart: 330, band2HueEnd: 350, band2Sat: 0.95, band2Light: 0.4, bgHue: 0, bgSat: 0.8, bgLight: 0.04, bgGlow: 0.7, fogColHue: 350, fogColSat: 0.9, fogColLight: 0.1, fogDensity: 0.55, godRays: 1.4, lightColHue: 0, lightColSat: 0.9, lightColLight: 0.9, material: 'Blood', viscosity: 0.6, mergeAmount: 0.8, reflect: 0.35, rough: 0.5, emissive: 0.7, absorb: 1.0, refract: 0.4, gravity: -0.35, centerPull: 0.45, bloomIntensity: 1.6, starDensity: 0.7, starBright: 0.5}, scene: { bigCore: true } }),

  T({ id: 'toxic', category: 'Sci-Fi', name: 'Toxic Swamp', mode: 'orbs', desc: 'The reference: lime-chartreuse chaos, black void, white-hot core.',
    params: { band0HueStart: 70, band0HueEnd: 95, band0Sat: 1, band0Light: 0.6, band1HueStart: 95, band1HueEnd: 130, band1Sat: 0.95, band1Light: 0.55, band2HueStart: 55, band2HueEnd: 80, band2Sat: 1, band2Light: 0.6, bgHue: 90, bgSat: 0.5, bgLight: 0.02, bgGlow: 0.8, fogColHue: 85, fogColSat: 0.8, fogColLight: 0.08, fogDensity: 0.55, godRays: 1.2, lightColHue: 110, lightColSat: 0.9, lightColLight: 0.7, lightAngle: 0.7, material: 'Classic', reflect: 0.5, rough: 0.3, emissive: 0.8, absorb: 0.35, refract: 0.3, mergeAmount: 0.45, swirl: 1.2, centerPull: 0.4, orbCount: 22, starDensity: 0.9, starBright: 0.8, starTwinkle: 0.9, bloomIntensity: 1.1, chromatic: 0.6, beatFlash: 1}, scene: { bigCore: true } }),

  T({ id: 'candy', category: 'Classic', name: 'Candy', mode: 'orbs', desc: 'Pastel bubblegum blobs.',
    params: { band0HueStart: 320, band0HueEnd: 350, band0Sat: 0.6, band0Light: 0.8, band1HueStart: 180, band1HueEnd: 220, band1Sat: 0.5, band1Light: 0.8, band2HueStart: 60, band2HueEnd: 90, band2Sat: 0.6, band2Light: 0.75, bgHue: 300, bgSat: 0.4, bgLight: 0.08, bgGlow: 0.8, fogColHue: 330, fogColSat: 0.5, fogColLight: 0.2, fogDensity: 0.35, godRays: 0.9, lightColHue: 340, lightColSat: 0.6, lightColLight: 1, material: 'Wax', viscosity: 0.6, mergeAmount: 0.8, reflect: 0.45, rough: 0.5, emissive: 0.8, absorb: 0.15, refract: 0.35, gravity: -0.15, bloomIntensity: 1.5, starDensity: 0.5, starBright: 0.6}, scene: {} }),

  T({ id: 'galaxy', category: 'Sci-Fi', name: 'Galaxy', mode: 'orbs', desc: 'Spiral arms, dense starfield.',
    params: { band0HueStart: 220, band0HueEnd: 260, band0Sat: 1.0, band0Light: 0.6, band1HueStart: 280, band1HueEnd: 320, band1Sat: 0.8, band1Light: 0.5, band2HueStart: 180, band2HueEnd: 210, band2Sat: 1.0, band2Light: 0.55, bgHue: 240, bgSat: 0.7, bgLight: 0.05, bgGlow: 0.9, fogColHue: 230, fogColSat: 0.6, fogColLight: 0.12, fogDensity: 0.45, godRays: 1.3, lightColHue: 200, lightColSat: 0.8, lightColLight: 0.95, material: 'Classic', reflect: 0.5, rough: 0.3, emissive: 0.8, absorb: 0.35, refract: 0.25, gravity: 0, swirl: 1.8, centerPull: 1.0, magnetism: 0.6, orbCount: 44, starDensity: 1, starBright: 1, bloomIntensity: 1.6}, scene: { spiral: true } }),

  T({ id: 'emberstorm', category: 'Nature', name: 'Ember Storm', mode: 'fountain', desc: 'Particle fountain: sparks shoot up, glow trails, no orbs.',
    params: { band0HueStart: 10, band0HueEnd: 40, band0Sat: 1, band0Light: 0.6, band1HueStart: 30, band1HueEnd: 60, band1Sat: 0.95, band1Light: 0.55, band2HueStart: 350, band2HueEnd: 20, band2Sat: 1, band2Light: 0.5, bgHue: 15, bgSat: 0.6, bgLight: 0.04, bgGlow: 0.6, fogColHue: 20, fogColSat: 0.8, fogColLight: 0.1, fogDensity: 0.4, godRays: 1.0, lightColHue: 30, lightColSat: 1, lightColLight: 1, material: 'Molten Metal', emissive: 1.5, reflect: 0.3, rough: 0.4, absorb: 0.2, refract: 0.1, mergeAmount: 0.3, gravity: -1.2, viscosity: 0.1, emitterRate: 4, orbCount: 0, bloomIntensity: 2.4, starDensity: 0.4, beatFlash: 1}, scene: { fountain: true, fountainSide: 'bottom' } }),

  T({ id: 'matrix', category: 'Retro', name: 'Matrix Rain', mode: 'fountain', desc: 'Green digital rain columns, glowing trails.',
    params: { band0HueStart: 110, band0HueEnd: 140, band0Sat: 1, band0Light: 0.6, band1HueStart: 100, band1HueEnd: 130, band1Sat: 0.9, band1Light: 0.55, band2HueStart: 120, band2HueEnd: 150, band2Sat: 0.95, band2Light: 0.5, bgHue: 120, bgSat: 0.6, bgLight: 0.03, bgGlow: 0.4, fogColHue: 120, fogColSat: 0.8, fogColLight: 0.08, fogDensity: 0.35, godRays: 0.8, lightColHue: 110, lightColSat: 1, lightColLight: 0.9, material: 'Classic', emissive: 1.2, reflect: 0.3, rough: 0.5, absorb: 0.2, refract: 0.1, mergeAmount: 0.2, gravity: -0.9, viscosity: 0.05, emitterRate: 3, orbCount: 0, bloomIntensity: 1.8, scanlines: 0.5, starDensity: 0.2}, scene: { fountain: true, fountainSide: 'top', columnar: true } }),

  T({ id: 'wmpclassic', category: 'Retro', name: 'WMP Classic', mode: 'bars', desc: 'The 90s: green bar spectrum analyzer.',
    params: { band0HueStart: 100, band0HueEnd: 140, band0Sat: 1, band0Light: 0.6, band1HueStart: 90, band1HueEnd: 130, band1Sat: 0.95, band1Light: 0.55, band2HueStart: 110, band2HueEnd: 150, band2Sat: 1, band2Light: 0.5, bgHue: 120, bgSat: 0.5, bgLight: 0.02, bgGlow: 0.3, fogColHue: 120, fogColSat: 0.6, fogColLight: 0.1, fogDensity: 0.3, godRays: 0.6, lightColHue: 110, lightColSat: 1, lightColLight: 1, material: 'Classic', bloom: 1, bloomIntensity: 1.2, scanlines: 0.4, starDensity: 0.1, starBright: 0.3}, scene: { bars: true } }),

  T({ id: 'wmpnight', category: 'Retro', name: 'WMP Night', mode: 'scope', desc: 'Blue oscilloscope traces in the dark.',
    params: { band0HueStart: 200, band0HueEnd: 240, band0Sat: 1, band0Light: 0.7, band1HueStart: 190, band1HueEnd: 230, band1Sat: 0.9, band1Light: 0.6, band2HueStart: 210, band2HueEnd: 250, band2Sat: 1, band2Light: 0.55, bgHue: 230, bgSat: 0.7, bgLight: 0.03, bgGlow: 0.4, fogColHue: 220, fogColSat: 0.6, fogColLight: 0.1, fogDensity: 0.25, godRays: 0.5, lightColHue: 210, lightColSat: 1, lightColLight: 1, material: 'Classic', bloomIntensity: 1.3, scanlines: 0.3, starDensity: 0.2}, scene: { scope: true } }),

  T({ id: 'wmpplasma', category: 'Retro', name: 'WMP Plasma', mode: 'plasma', desc: 'Retro plasma fractal, beat-reactive.',
    params: { band0HueStart: 280, band0HueEnd: 320, band0Sat: 1, band0Light: 0.6, band1HueStart: 180, band1HueEnd: 220, band1Sat: 0.9, band1Light: 0.55, band2HueStart: 60, band2HueEnd: 100, band2Sat: 1.0, band2Light: 0.55, bgHue: 300, bgSat: 0.6, bgLight: 0.03, bgGlow: 0.5, fogColHue: 280, fogColSat: 0.7, fogColLight: 0.1, fogDensity: 0.3, godRays: 0.5, lightColHue: 300, lightColSat: 0.9, lightColLight: 1, material: 'Classic', bloomIntensity: 1.6, scanlines: 0.4, chromatic: 0.5, starDensity: 0.15}, scene: { plasma: true } }),

  T({ id: 'prism', category: 'Classic', name: 'Prism', mode: 'orbs', desc: 'Rainbow bands across all orbs.',
    params: { band0HueStart: 0, band0HueEnd: 120, band0Sat: 1, band0Light: 0.6, band1HueStart: 120, band1HueEnd: 240, band1Sat: 1, band1Light: 0.55, band2HueStart: 240, band2HueEnd: 360, band2Sat: 1, band2Light: 0.5, bgHue: 200, bgSat: 0.4, bgLight: 0.05, bgGlow: 0.7, fogColHue: 180, fogColSat: 0.5, fogColLight: 0.12, fogDensity: 0.4, godRays: 1.1, lightColHue: 200, lightColSat: 0.8, lightColLight: 1, material: 'Classic', reflect: 0.65, rough: 0.2, emissive: 1.0, absorb: 0.2, refract: 0.4, mergeAmount: 0.55, colorMix: 0.9, swirl: 0.7, centerPull: 0.3, bloomIntensity: 1.7, chromatic: 0.6}, scene: {} }),

  T({ id: 'bubble', category: 'Classic', name: 'Bubble', mode: 'orbs', desc: 'Glassy refractive orbs, soft pastel light.',
    params: { band0HueStart: 190, band0HueEnd: 210, band0Sat: 0.7, band0Light: 0.75, band1HueStart: 160, band1HueEnd: 190, band1Sat: 0.6, band1Light: 0.8, band2HueStart: 220, band2HueEnd: 250, band2Sat: 0.7, band2Light: 0.7, bgHue: 210, bgSat: 0.5, bgLight: 0.06, bgGlow: 0.8, fogColHue: 200, fogColSat: 0.4, fogColLight: 0.18, fogDensity: 0.4, godRays: 1.0, lightColHue: 190, lightColSat: 0.6, lightColLight: 1, material: 'Water', viscosity: 0.05, mergeAmount: 0.3, reflect: 0.8, rough: 0.03, emissive: 0.3, absorb: 0.06, refract: 1, gravity: -0.1, bloomIntensity: 1.4, starDensity: 0.6, starBright: 0.7}, scene: {} }),

  T({ id: 'ultraviolet', category: 'Energy', name: 'Ultraviolet', mode: 'orbs', desc: 'Deep purple-black, neon violet glow.',
    params: { band0HueStart: 270, band0HueEnd: 300, band0Sat: 1, band0Light: 0.6, band1HueStart: 250, band1HueEnd: 280, band1Sat: 0.95, band1Light: 0.55, band2HueStart: 290, band2HueEnd: 320, band2Sat: 1, band2Light: 0.5, bgHue: 280, bgSat: 0.9, bgLight: 0.04, bgGlow: 0.85, fogColHue: 280, fogColSat: 0.9, fogColLight: 0.12, fogDensity: 0.55, godRays: 1.4, lightColHue: 290, lightColSat: 1, lightColLight: 1, material: 'Classic', reflect: 0.6, rough: 0.25, emissive: 1.0, absorb: 0.4, refract: 0.3, mergeAmount: 0.6, swirl: 1.0, centerPull: 0.4, bloomIntensity: 1.9}, scene: {} }),

  T({ id: 'plasmastorm', category: 'Energy', name: 'Plasma Storm', mode: 'orbs', desc: 'Electric chaos, flickering, high energy.',
    params: { band0HueStart: 200, band0HueEnd: 260, band0Sat: 1, band0Light: 0.6, band1HueStart: 40, band1HueEnd: 90, band1Sat: 0.9, band1Light: 0.55, band2HueStart: 280, band2HueEnd: 330, band2Sat: 1.0, band2Light: 0.55, bgHue: 240, bgSat: 0.8, bgLight: 0.04, bgGlow: 0.9, fogColHue: 220, fogColSat: 0.8, fogColLight: 0.12, fogDensity: 0.6, godRays: 1.7, lightColHue: 220, lightColSat: 1, lightColLight: 1.1, lightAngle: 0.4, material: 'Classic', reflect: 0.7, rough: 0.2, emissive: 1.4, absorb: 0.3, refract: 0.35, mergeAmount: 0.5, jitter: 1, swirl: 1.6, centerPull: 0.5, magnetism: 1.2, orbCount: 46, bloomIntensity: 2.2, chromatic: 0.8, beatFlash: 1}, scene: { storm: true } }),
];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function themeById(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }

module.exports = { SECTIONS, PARAM_SCHEMA, DEFAULTS, MATERIALS, THEMES, hsl2rgb, themeById };
if (typeof window !== "undefined" && window.__export) { window.__export("presets", module.exports); }

})();
