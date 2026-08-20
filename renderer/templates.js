'use strict';
// Template engine registry — each template declares its native engine, its own
// params schema (the settings panel rebuilds from this), and a thumbnail.
// (function(){})();

(function () {
  // Engine types:
  //  'three'     — three.js orb engine (renderer/three-orb.js)
  //  'milk'      — butterchurn MilkDrop2 (renderer/milk.js)
  //  'audiomotion'— audioMotion-analyzer overlay (renderer/vendor/audiomotion.js)
  //  'raymarch'  — original WebGL2 raymarch (renderer/shaders.js)
  //  'iframe'    — vendored third-party repo run in a sandboxed iframe (renderer/templates/<id>/)
  //  'canvas2d'  — native 2D canvas engine

  // Per-template param schemas. Each template can define its own SECTIONS + PARAM_SCHEMA;
  // the settings panel rebuilds when the template changes.
  const TEMPLATE_SCHEMAS = {
    // ---- orbs (three.js) ----
    orbs: {
      sections: [
        { id: 'colors', label: 'COLORS' },
        { id: 'orbs', label: 'ORBS & PHYSICS' },
        { id: 'material', label: 'MATERIAL' },
        { id: 'light', label: 'LIGHT & FOG' },
        { id: 'bg', label: 'BACKGROUND' },
        { id: 'fx', label: 'EFFECTS' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
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
        { key: 'material', label: 'Material', section: 'material', type: 'dropdown', options: ['Wax', 'Black Hole', 'Classic', 'Molten Metal', 'Water', 'Honey', 'Blood', 'Metal'] },
        { key: 'reflect', label: 'Reflectivity', section: 'material', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'rough', label: 'Roughness', section: 'material', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'emissive', label: 'Emissive Glow', section: 'material', type: 'slider', min: 0, max: 2, step: 0.02 },
        { key: 'absorb', label: 'Absorption (core dark)', section: 'material', type: 'slider', min: 0, max: 1.5, step: 0.02 },
        { key: 'refract', label: 'Refraction', section: 'material', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'lightAngle', label: 'Light Angle', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'lightColHue', label: 'Light Hue', section: 'light', type: 'slider', min: 0, max: 360, step: 1 },
        { key: 'lightColSat', label: 'Light Saturation', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'lightColLight', label: 'Light Brightness', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'fogDensity', label: 'Fog Density', section: 'light', type: 'slider', min: 0, max: 1.5, step: 0.01 },
        { key: 'fogColHue', label: 'Fog Hue', section: 'light', type: 'slider', min: 0, max: 360, step: 1 },
        { key: 'fogColSat', label: 'Fog Saturation', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'fogColLight', label: 'Fog Brightness', section: 'light', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'godRays', label: 'God Rays', section: 'light', type: 'slider', min: 0, max: 2, step: 0.02 },
        { key: 'bgHue', label: 'Background Hue', section: 'bg', type: 'slider', min: 0, max: 360, step: 1 },
        { key: 'bgSat', label: 'Background Saturation', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'bgLight', label: 'Background Brightness', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'bgGlow', label: 'Nebula Glow', section: 'bg', type: 'slider', min: 0, max: 1.5, step: 0.02 },
        { key: 'starDensity', label: 'Star Density', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'starBright', label: 'Star Brightness', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'starTwinkle', label: 'Star Music Flicker', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'starSpeed', label: 'Star Speed', section: 'bg', type: 'slider', min: 0, max: 3, step: 0.05 },
        { key: 'bloom', label: 'Bloom', section: 'fx', type: 'toggle', def: 1 },
        { key: 'bloomIntensity', label: 'Bloom Intensity', section: 'fx', type: 'slider', min: 0, max: 3, step: 0.02 },
        { key: 'vignette', label: 'Vignette', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'scanlines', label: 'Scanlines', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'chromatic', label: 'Chromatic Aberration', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'beatFlash', label: 'Beat Flash', section: 'fx', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'motionBlur', label: 'Trail Persistence', section: 'fx', type: 'slider', min: 0.5, max: 0.99, step: 0.01 },
        { key: 'sensitivity', label: 'Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'smoothing', label: 'Smoothing', section: 'audio', type: 'slider', min: 0.05, max: 0.95, step: 0.01 },
        { key: 'bassBias', label: 'Bass Bias', section: 'audio', type: 'slider', min: 0, max: 2, step: 0.05 },
        { key: 'beatThreshold', label: 'Beat Threshold', section: 'audio', type: 'slider', min: 0.05, max: 0.9, step: 0.01 },
        { key: 'musicMotion', label: 'Music Motion Speed', section: 'audio', type: 'slider', min: 0, max: 3, step: 0.05 },
        { key: 'quality', label: 'Raymarch Quality', section: 'perf', type: 'slider', min: 0.4, max: 1.5, step: 0.05 },
        { key: 'adaptiveRes', label: 'Adaptive Resolution', section: 'perf', type: 'toggle', def: 1 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },

    // ---- Frequency Blob (three.js blob) ----
    blob: {
      sections: [
        { id: 'colors', label: 'COLORS' },
        { id: 'blob', label: 'BLOB' },
        { id: 'light', label: 'LIGHT & FOG' },
        { id: 'bg', label: 'BACKGROUND' },
        { id: 'fx', label: 'EFFECTS' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
        { key: 'band0HueStart', label: 'Blob Hue Start', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
        { key: 'band0HueEnd', label: 'Blob Hue End', section: 'colors', type: 'slider', min: 0, max: 360, step: 1 },
        { key: 'band0Sat', label: 'Saturation', section: 'colors', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'band0Light', label: 'Lightness', section: 'colors', type: 'slider', min: 0.05, max: 0.9, step: 0.01 },
        { key: 'blobSpeed', label: 'Blob Wobble Speed', section: 'blob', type: 'slider', min: 0.2, max: 3, step: 0.05 },
        { key: 'blobSensitivity', label: 'Blob Music Sensitivity', section: 'blob', type: 'slider', min: 0.1, max: 3, step: 0.05 },
        { key: 'blobSize', label: 'Blob Size', section: 'blob', type: 'slider', min: 0.5, max: 2.5, step: 0.05 },
        { key: 'bloomIntensity', label: 'Glow Intensity', section: 'fx', type: 'slider', min: 0, max: 3, step: 0.02 },
        { key: 'bloom', label: 'Bloom', section: 'fx', type: 'toggle', def: 1 },
        { key: 'starDensity', label: 'Star Density', section: 'bg', type: 'slider', min: 0, max: 1, step: 0.01 },
        { key: 'sensitivity', label: 'Audio Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },

    // ---- MilkDrop ----
    milk: {
      sections: [
        { id: 'milk', label: 'MILKDROP' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
        { key: 'milkRandomPreset', label: 'Random Preset On Beat', section: 'milk', type: 'toggle', def: 0 },
        { key: 'milkAutoRotate', label: 'Auto-rotate Presets', section: 'milk', type: 'toggle', def: 0 },
        { key: 'sensitivity', label: 'Audio Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },

    // ---- audioMotion ----
    audiomotion: {
      sections: [
        { id: 'am', label: 'AUDIOMOTION' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
        { key: 'amMode', label: 'Mode', section: 'am', type: 'dropdown', options: ['bars', 'radial', 'lumiBars', 'dualscope', 'oscilloscope', 'waveform'] },
        { key: 'amGradient', label: 'Gradient', section: 'am', type: 'dropdown', options: ['classic', 'prism', 'rainbow', 'fire', 'ice', 'gold', 'solar'] },
        { key: 'amMirror', label: 'Mirror', section: 'am', type: 'toggle', def: 0 },
        { key: 'amLedBars', label: 'LED Bars', section: 'am', type: 'toggle', def: 0 },
        { key: 'amShowPeaks', label: 'Show Peaks', section: 'am', type: 'toggle', def: 1 },
        { key: 'amRadial', label: 'Radial Layout', section: 'am', type: 'toggle', def: 0 },
        { key: 'sensitivity', label: 'Audio Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },
    // ---- av3d (iframe template) ----
    av3d: {
      sections: [
        { id: 'av3d', label: 'THREE.JS VISUALIZER' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
        { key: 'av3dWire', label: 'Wireframe Detail', section: 'av3d', type: 'slider', min: 0.2, max: 2, step: 0.05 },
        { key: 'av3dSpeed', label: 'Rotation Speed', section: 'av3d', type: 'slider', min: 0, max: 3, step: 0.05 },
        { key: 'sensitivity', label: 'Audio Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },
    // ---- party-mode (iframe template) ----
    party: {
      sections: [
        { id: 'party', label: 'PARTY-MODE' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
        { key: 'partyViz', label: 'Visualization', section: 'party', type: 'dropdown', options: ['0', '1', '2', '3', '4', '5', '6', '7'] },
        { key: 'sensitivity', label: 'Audio Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },
    // ---- particles (Interactive Particles — Codrops/Tiago Canzian) ----
    particles: {
      sections: [
        { id: 'colors', label: 'COLORS' },
        { id: 'particles', label: 'PARTICLES' },
        { id: 'audio', label: 'AUDIO' },
        { id: 'perf', label: 'PERFORMANCE' },
      ],
      params: [
        { key: 'startColor', label: 'Start Color (Hex)', section: 'colors', type: 'text', placeholder: 'ff00ff' },
        { key: 'endColor', label: 'End Color (Hex)', section: 'colors', type: 'text', placeholder: '00ffff' },
        { key: 'particleFrequency', label: 'Noise Frequency', section: 'particles', type: 'slider', min: 0.5, max: 5, step: 0.1 },
        { key: 'particleAmplitude', label: 'Displacement Amount', section: 'particles', type: 'slider', min: 0, max: 3, step: 0.1 },
        { key: 'particleSpeed', label: 'Time Speed', section: 'particles', type: 'slider', min: 0.1, max: 1, step: 0.05 },
        { key: 'sensitivity', label: 'Audio Sensitivity', section: 'audio', type: 'slider', min: 0.1, max: 4, step: 0.05 },
        { key: 'targetFPS', label: 'Target FPS', section: 'perf', type: 'slider', min: 30, max: 240, step: 5 },
        { key: 'showFPS', label: 'Show FPS', section: 'perf', type: 'toggle', def: 0 },
      ],
    },
  };
  // 'thumb' = path to a static thumbnail (from the repo README where available).
  const TEMPLATES = [
    { id: 'orbs', name: 'Orbs', category: 'Core', engine: 'three', schemaId: 'orbs', desc: 'Metaball orbs with real 3D lighting, bloom, particles.', thumb: '' },
    { id: 'blob', name: 'Frequency Blob', category: 'Core', engine: 'three', schemaId: 'blob', desc: 'Icosahedron displaced by the FFT (audio-visualizer-three-js).', thumb: '' },
    { id: 'milk', name: 'MilkDrop', category: 'Core', engine: 'milk', schemaId: 'milk', desc: 'Classic MilkDrop2 shaders (butterchurn). Import .milk presets.', thumb: '' },
    { id: 'audiomotion', name: 'audioMotion', category: 'Core', engine: 'audiomotion', schemaId: 'audiomotion', desc: 'High-res spectrum analyzer (AGPL-3.0).', thumb: 'templates/thumbs/audiomotion.png' },
    { id: 'raymarch', name: 'Raymarch', category: 'Core', engine: 'raymarch', schemaId: 'orbs', desc: 'Original raymarched metaball field.', thumb: '' },
    { id: 'av3d', name: 'Three.js Visualizer', category: 'Community', engine: 'iframe', schemaId: 'av3d', desc: 'Frequency-displaced icosahedron + wireframe planes (audio-visualizer-three-js).', thumb: 'templates/thumbs/av3d.png' },
    { id: 'party-mode', name: 'party-mode', category: 'Community', engine: 'iframe', schemaId: 'party', desc: 'D3 hexbin + waveform visualizations (preziotte/party-mode).', thumb: 'templates/thumbs/party-mode.png' },
    { id: 'particles', name: 'Interactive Particles', category: 'Community', engine: 'particles', schemaId: 'particles', desc: 'Noise-displaced audio-reactive point cloud (Codrops/Tiago Canzian).', thumb: '' },
  ];

  // Static thumbs (extracted from repo READMEs) live in renderer/templates/thumbs/<id>.png
  module.exports = { TEMPLATES, TEMPLATE_SCHEMAS };
  if (typeof window !== 'undefined' && window.__export) { window.__export('templates', module.exports); }
})();
