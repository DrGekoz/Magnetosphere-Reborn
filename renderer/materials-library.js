'use strict';
// materials-library.js — Physical material presets for THREE.js MeshPhysicalMaterial.
// Uses window.THREE (UMD vendor/three.js). No external dependencies.
(function () {
const T = window.THREE;
if (!T) return console.warn('[materials] THREE not loaded');

/**
 * Utility: load a texture from URL or data-URL via Image element.
 * Returns a THREE.Texture. Supports ultrahdr textures via EXR/DRACOLoader hooks if present.
 */
function loadTexture(src, options) {
  options = options || {};
  const tex = new T.Texture();
  tex.needsUpdate = true;

  if (!src) { return tex; }

  // Handle canvas-based textures (for webcam, etc.)
  if (typeof src === 'object' && src.tagName === 'CANVAS') {
    tex.image = src;
    tex.needsUpdate = true;
    return tex;
  }

  if (typeof src === 'object' && src.srcElement && src.srcElement.tagName === 'VIDEO') {
    tex.image = src.srcElement;
    tex.isVideoTexture = true;
    tex.minFilter = T.LinearFilter;
    tex.magFilter = T.LinearFilter;
    tex.format = T.RGBAFormat;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  // String path / URL / data:
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function () {
    tex.image = img;
    tex.needsUpdate = true;
    tex.flipY = true;
    if (options.wrapS !== undefined) tex.wrapS = options.wrapS; else tex.wrapS = T.RepeatWrapping;
    if (options.wrapT !== undefined) tex.wrapT = options.wrapT; else tex.wrapT = T.RepeatWrapping;
    if (options.repeat !== undefined) { tex.repeat.set(options.repeat[0], options.repeat[1]); }
    if (options.anisotropy !== undefined) tex.anisotropy = options.anisotropy;
    if (options.encoding !== undefined) tex.colorSpace = options.encoding === T.SRGBColorSpace ? T.SRGBColorSpace : T.LinearSRGBColorSpace;
    tex.colorSpace = (options.srgb !== false && options.encoding === undefined) ? T.SRGBColorSpace : T.LinearSRGBColorSpace;
  };
  img.onerror = function () {
    console.warn('[materials] Failed to load texture:', src);
  };
  img.src = src;
  return tex;
}

/**
 * Create a procedural env map as a DataTexture (single-color gradient sphere approximation).
 * Useful for testing materials without actual HDRIs.
 */
function createProceduralEnvMap(colorTop, colorBottom, size) {
  size = size || 256;
  const halfSize = Math.floor(size / 2);
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const py = Math.max(0, Math.min(size - 1, y));
    for (let x = 0; x < size; x++) {
      const i = (py * size + x) * 4;
      pixels[i]     = Math.round(colorTop[0] + (colorBottom[0] - colorTop[0]) * t);
      pixels[i + 1] = Math.round(colorTop[1] + (colorBottom[1] - colorTop[1]) * t);
      pixels[i + 2] = Math.round(colorTop[2] + (colorBottom[2] - colorTop[2]) * t);
      pixels[i + 3] = 255;
    }
  }
  const tex = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = T.NearestFilter;
  tex.magFilter = T.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Material Preset Definitions.
 * Each entry contains defaults for MeshPhysicalMaterial properties.
 */
const PRESETS = {
  clearcoat: {
    name: 'Clearcoat',
    desc: 'Glossy surface with transparent clear coat layer',
    params: {
      roughness: 0.1,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.9,
      iridescence: 0.0,
      transmission: 0.0,
      thickness: 0.5,
      attenuationColor: [1.0, 1.0, 1.0],
      attenuationDistance: 1.0,
      sheen: 0.0,
      anisotropy: 0.0,
      envMapIntensity: 1.0,
    },
  },
  transmission: {
    name: 'Transmission Glass',
    desc: 'Transparent glass/plastic with subsurface-like refraction',
    params: {
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 0.0,
      transmission: 1.0,
      thickness: 0.8,
      attenuationColor: [0.95, 0.97, 1.0],
      attenuationDistance: 2.0,
      specularIntensity: 1.0,
      specularColor: [1.0, 1.0, 1.0],
      ior: 1.5,
      envMapIntensity: 1.5,
      iridescence: 0.0,
      sheen: 0.0,
      anisotropy: 0.0,
    },
  },
  iridescence: {
    name: 'Iridescent Film',
    desc: 'Thin-film interference colors (oil on water)',
    params: {
      roughness: 0.2,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      iridescence: 1.0,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [100, 800],
      envMapIntensity: 1.2,
      sheen: 0.0,
      anisotropy: 0.0,
    },
  },
  anisotropy: {
    name: 'Anisotropic Brushed Metal',
    desc: 'Directional microfacets — brushed aluminum, satin finish',
    params: {
      roughness: 0.6,
      metalness: 0.9,
      clearcoat: 0.0,
      anisotropy: 0.9,
      anisotropyRotation: 0.0,
      anisotropyBlur: 0.5,
      envMapIntensity: 1.5,
      sheen: 0.0,
    },
  },
  metallic: {
    name: 'Polished Chrome',
    desc: 'Mirror-like perfect reflection metal',
    params: {
      roughness: 0.0,
      metalness: 1.0,
      clearcoat: 0.0,
      envMapIntensity: 2.0,
      sheen: 0.0,
      anisotropy: 0.0,
    },
  },
  emissive: {
    name: 'Neon Emissive',
    desc: 'Self-luminous neon glow',
    params: {
      roughness: 0.5,
      metalness: 0.0,
      emissiveIntensity: 3.0,
      clearcoat: 0.0,
      envMapIntensity: 0.3,
      sheen: 0.0,
      anisotropy: 0.0,
    },
  },
  rubber: {
    name: 'Soft Rubber',
    desc: 'Matte, slightly bumpy rubber surface',
    params: {
      roughness: 0.95,
      metalness: 0.0,
      clearcoat: 0.0,
      sheen: 0.8,
      sheenRoughness: 0.5,
      sheenColor: [0.5, 0.5, 0.5],
      envMapIntensity: 0.2,
      anisotropy: 0.0,
    },
  },
  ceramic: {
    name: 'Ceramic Glaze',
    desc: 'Smooth fired ceramic with subtle clearcoat',
    params: {
      roughness: 0.25,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
      reflectivity: 0.7,
      envMapIntensity: 0.8,
      sheen: 0.3,
      sheenColor: [0.8, 0.85, 0.9],
      anisotropy: 0.0,
    },
  },
  holographic: {
    name: 'Holographic Foil',
    desc: 'Rainbow-shift reflective foil',
    params: {
      roughness: 0.15,
      metalness: 1.0,
      clearcoat: 1.0,
      iridescence: 1.0,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [200, 600],
      envMapIntensity: 2.5,
      sheen: 0.5,
      sheenRoughness: 0.2,
      anisotropy: 0.3,
    },
  },
  velour: {
    name: 'Velour / Flocking',
    desc: 'Ultra-sheen soft fabric surface',
    params: {
      roughness: 0.85,
      metalness: 0.0,
      sheen: 1.0,
      sheenRoughness: 0.3,
      sheenColor: [0.3, 0.15, 0.4],
      clearcoat: 0.0,
      envMapIntensity: 0.15,
      anisotropy: 0.0,
    },
  },
};

/**
 * Generate a physical material from a preset name + optional overrides.
 */
function createMaterial(name, overrides) {
  const preset = PRESETS[name];
  if (!preset) {
    console.warn(`[materials] Unknown preset "${name}", using base MeshPhysicalMaterial`);
    return new T.MeshPhysicalMaterial(Object.assign({}, overrides || {}));
  }
  const p = Object.assign({}, preset.params, overrides || {});
  const mat = new T.MeshPhysicalMaterial({
    roughness: p.roughness ?? 0.5,
    metalness: p.metalness ?? 0.0,
    color: 0xffffff,        // set via overrides if needed
    emissive: p.emissive ?? 0x000000,
    emissiveIntensity: p.emissiveIntensity ?? 1.0,
    clearcoat: p.clearcoat ?? 0.0,
    clearcoatRoughness: p.clearcoatRoughness ?? 0.0,
    reflectivity: p.reflectivity ?? 0.5,
    iridescence: p.iridescence ?? 0.0,
    iridescenceIOR: p.iridescenceIOR ?? 1.3,
    iridescenceThicknessRange: p.iridescenceThicknessRange ?? [100, 400],
    transmission: p.transmission ?? 0.0,
    thickness: p.thickness ?? 0.5,
    attenuationColor: new T.Color().setRGB(
      (p.attenuationColor && typeof p.attenuationColor === 'object') ? p.attenuationColor[0] : 1,
      (p.attenuationColor && typeof p.attenuationColor === 'object') ? p.attenuationColor[1] : 1,
      (p.attenuationColor && typeof p.attenuationColor === 'object') ? p.attenuationColor[2] : 1,
    ),
    attenuationDistance: p.attendanceDistance ?? p.attenuationDistance ?? 1,
    specularIntensity: p.specularIntensity ?? 1.0,
    specularColor: new T.Color().setRGB(
      (p.specularColor && typeof p.specularColor === 'object') ? p.specularColor[0] : 1,
      (p.specularColor && typeof p.specularColor === 'object') ? p.specularColor[1] : 1,
      (p.specularColor && typeof p.specularColor === 'object') ? p.specularColor[2] : 1,
    ),
    ior: p.ior ?? 1.5,
    sheen: p.sheen ?? 0.0,
    sheenRoughness: p.sheenRoughness ?? 0.5,
    sheenColor: new T.Color().setRGB(
      (p.sheenColor && typeof p.sheenColor === 'object') ? p.sheenColor[0] : 0.5,
      (p.sheenColor && typeof p.sheenColor === 'object') ? p.sheenColor[1] : 0.5,
      (p.sheenColor && typeof p.sheenColor === 'object') ? p.sheenColor[2] : 0.5,
    ),
    anisotropy: p.anisotropy ?? 0.0,
    anisotropyRotation: p.anisotropyRotation ?? 0.0,
    anisotropyBlur: p.anisotropyBlur ?? 0.5,
    envMapIntensity: p.envMapIntensity ?? 1.0,
    toneMapped: true,
    ...Object.fromEntries(Object.entries(overrides || {}).filter(([k]) => !Object.prototype.hasOwnProperty.call(preset.params, k))),
  });
  return mat;
}

/**
 * Apply textures to a material from preset definitions.
 * Handles bumpMap, normalMap, aoMap, displacementMap, envMap, emissiveMap, clearcoatNormalMap, clearcoatRoughnessMap, iridescenceMap, anisotropyMap.
 */
function applyTexturesToMaterial(mat, textureDefs) {
  textureDefs = textureDefs || {};
  const mappings = {
    bumpMap: 'bumpMap',
    normalMap: 'normalMap',
    aoMap: 'aoMap',
    displacementMap: 'displacementMap',
    roughnessMap: 'roughnessMap',
    metalnessMap: 'metalnessMap',
    emissiveMap: 'emissiveMap',
    clearcoatNormalMap: 'clearcoatNormalMap',
    clearcoatRoughnessMap: 'clearcoatRoughnessMap',
    clearcoatMask: 'clearcoatMask',
    iridescenceMap: 'iridescenceMap',
    iridescenceThicknessMap: 'iridescenceThicknessMap',
    anisotropyMap: 'anisotropyMap',
    sheenRoughnessMap: 'sheenRoughnessMap',
    sheenColorMap: 'sheenColorMap',
    transmissionMap: 'transmissionMap',
    thicknessMap: 'thicknessMap',
  };

  for (const [prop, key] of Object.entries(mappings)) {
    if (textureDefs[prop]) {
      const def = textureDefs[prop];
      let tex;
      if (def.texture) {
        tex = def.texture;
      } else if (def.url) {
        tex = loadTexture(def.url, { srgb: def.srgb !== false, wrapS: def.wrapS, wrapT: def.wrapT, repeat: def.repeat, anisotropy: def.anisotropy });
      } else if (def.data && def.type === 'data') {
        // Inline typed array data (e.g., from webcam canvas)
        const d = def.data;
        const w = def.width || 256, h = def.height || 256;
        tex = new T.DataTexture(d, w, h, T.RGBAFormat);
        tex.needsUpdate = true;
        tex.wrapS = T.ClampToEdgeWrapping;
        tex.wrapT = T.ClampToEdgeWrapping;
      } else {
        tex = loadTexture(def);
      }
      if (tex && tex.image) {
        mat[key] = tex;
        if (key === 'aoMap' || key === 'bumpMap' || key === 'displacementMap' || key === 'clearcoatRoughnessMap') {
          // Grayscale mapping
          tex.colorSpace = T.LinearSRGBColorSpace;
        }
        // auto-scale UVs
        if (def.repeatUV) {
          tex.repeat.set(def.repeatUV[0] || 1, def.repeatUV[1] || 1);
        }
      }
    }
  }

  // envMap is special — needs CubeTexture or PMREMGenerator
  if (textureDefs.envMap) {
    if (textureDefs.envMap.cubeTexture) {
      mat.envMap = textureDefs.envMap.cubeTexture;
    } else if (textureDefs.envMap.texture) {
      mat.envMap = textureDefs.envMap.texture;
    }
  }

  return mat;
}

/**
 * UltrHDR texture support.
 * Load a high-dynamic-range image (EXR, HDR, or .png with UHR flag).
 * Returns THREE.Texture with proper encoding.
 */
function loadUltrHDRTexture(src) {
  // Check if any DRACOLoader or RGBELoader exists in window.THREE
  try {
    if (T.RGBELoader) {
      const loader = new T.RGBELoader();
      return loader.load(src, (t) => {
        t.mapping = T.EquirectangularReflectionMapping;
        t.colorSpace = T.LinearSRGBColorSpace;
        t.generateMipmaps = true;
        t.minFilter = T.LinearMipmapLinearFilter;
        t.magFilter = T.LinearFilter;
      });
    }
  } catch(e) {}
  try {
    if (T.EXRLoader) {
      const loader = new T.EXRLoader();
      return loader.load(src, (t) => {
        t.mapping = T.EquirectangularReflectionMapping;
        t.colorSpace = T.LinearSRGBColorSpace;
        t.generateMipmaps = true;
      });
    }
  } catch(e) {}
  // Fallback: treat as regular texture but mark for HDR use
  const tex = loadTexture(src, { encoding: T.ACESFilmicEncoding, srgb: false });
  tex.mapping = T.EquirectangularReflectionMapping;
  tex.name = 'ultrhdr_' + (tex.name || '');
  return tex;
}

/**
 * Generate a reflection cubemap from scene content (render-to-texture approach).
 * Captures 6 faces from environment probes positioned at target.
 */
function captureEnvironment(scene, camera, target, size) {
  size = size || 512;
  const rtOptions = {
    minFilter: T.LinearMipmapLinearFilter,
    magFilter: T.LinearFilter,
    format: T.RGBAFormat,
    type: T.HalfFloatType,
    generateMipmaps: true,
    stencil: false,
  };

  // Use CubeCamera (available in UMD vendor)
  try {
    const cubeCamera = new T.CubeCamera(0.1, 100, rtOptions);
    const origVisible = [];
    scene.traverse(c => {
      if (c.isMesh) { origVisible.push([c, c.visible]); c.visible = false; }
    });
    // Hide everything except reflection targets briefly
    cubeCamera.position.copy(target || new T.Vector3());
    cubeCamera.update(scene.renderer || null, scene);
    // Restore
    for (const [c, vis] of origVisible) { c.visible = vis; }
    return cubeCamera.renderTarget.texture;
  } catch(e) {
    console.warn('[materials] Environment capture failed:', e.message);
    return null;
  }
}

/**
 * Quick helper: create a basic env map from a list of 6 images.
 */
function createEnvMapFromImages(images, pmremGen) {
  // images = [posX, negX, posY, negY, posZ, negZ] (Image elements or URLs)
  const cubeRT = new T.WebGLCubeRenderTarget(256, { format: T.RGBAFormat, type: T.HalfFloatType });
  // If PMREMGenerator available, use it
  if (pmremGen && T.PMREMGenerator) {
    const gen = pmremGen;
    const cubeTex = new T.CubeTexture(images.map(img => {
      if (img instanceof T.Texture) return img.image || img;
      return img;
    }));
    const envMap = gen.fromCubemap(cubeTex).texture;
    return envMap;
  }
  // Simple: return as DataTexture fallback
  return createProceduralEnvMap([128, 128, 128], [32, 32, 32], 256);
}

// ---- Public API ----
const MaterialsLibrary = {
  PRESETS,
  getPreset(name) { return PRESETS[name] || null; },
  getAllPresets() { return Object.keys(PRESETS); },
  createMaterial: createMaterial,
  applyTextures: applyTexturesToMaterial,
  loadTexture: loadTexture,
  loadUltrHDRTexture: loadUltrHDRTexture,
  createProceduralEnvMap: createProceduralEnvMap,
  captureEnvironment: captureEnvironment,
  createEnvMapFromImages: createEnvMapFromImages,
};

if (typeof window !== 'undefined' && window.__export) {
  window.__export('materials-library', MaterialsLibrary);
}
module.exports = MaterialsLibrary;

})();
