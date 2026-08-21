#!/usr/bin/env node
/**
 * build-bundle.js
 * 
 * Bundles three.js core + selected addons into a single UMD-style file
 * suitable for <script> tag loading in Electron renderer.
 * 
 * Run: node build-bundle.js [--watch]
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '.');
const THREE_PKG = path.join(PROJECT, 'node_modules', 'three');
const EXAMPLES = path.join(THREE_PKG, 'examples', 'jsm');
const VENDOR_DIR = path.join(PROJECT, 'renderer', 'vendor');
const OUTPUT = path.join(VENDOR_DIR, 'three.js');

// ============================================================
// FILE LISTINGS
// ============================================================

const ADDONS = [
  // ---- Post-processing passes ----
  'postprocessing/EffectComposer',
  'postprocessing/Pass',
  'postprocessing/RenderPass',
  'postprocessing/UnrealBloomPass',
  'postprocessing/BokehPass',
  'postprocessing/GTAOPass',
  'postprocessing/SSAOPass',
  'postprocessing/SSRPass',
  'postprocessing/OutputPass',
  'postprocessing/AfterimagePass',
  'postprocessing/ShaderPass',
  'postprocessing/ClearPass',
  'postprocessing/SavePass',
  'postprocessing/MaskPass',
  'postprocessing/TexturePass',
  'postprocessing/OutlinePass',
  'postprocessing/LUTPass',
  'postprocessing/FXAA*Pass',       // glob-ish placeholder
  'postprocessing/SMAA*Pass',
  'postprocessing/FilmPass',
  'postprocessing/CubeTexturePass',
  'postprocessing/RenderTransitionPass',
  // ---- Controls ----
  'controls/OrbitControls',
  'controls/TransformControls',
  // ---- Loaders ----
  'loaders/GLTFLoader',
  'loaders/MTLLoader',
  'loaders/DRACOLoader',
  'loaders/KTX2Loader',
  'loaders/OBJLoader',
  'loaders/FBXLoader',
  'loaders/RGBELoader',
  'loaders/HDRLoader',
  'loaders/HDRCubeTextureLoader',
  // ---- Utils ----
  'utils/BufferGeometryUtils',
  'utils/SkeletonUtils',
  // ---- Math / misc referenced by addons ----
  'math/SimplexNoise',
];

const SHADER_GLOBS = [
  'shaders/CopyShader',
  'shaders/LuminosityHighPassShader',
  'shaders/BokehShader',
  'shaders/SSAOShader',
  'shaders/GTAOShader',
  'shaders/PoissonDenoiseShader',
  'shaders/SSRShader',
  'shaders/FXAAShader',
  'shaders/SMAAShader',
  'shaders/FilmGrainShader',
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

let _cache = new Map();

function read(path_) {
  if (_cache.has(path_)) return _cache.get(path_);
  const content = fs.readFileSync(path_, 'utf8');
  _cache.set(path_, content);
  return content;
}

function exists(p) { return fs.existsSync(p); }

/** Resolve a relative import from a source file's directory back into our file list. */
function resolveImport(importPath, sourceRelPath) {
  // Normalize
  importPath = importPath.replace(/\\/g, '/');
  
  if (!importPath.startsWith('.')) return importPath; // bare module like 'three'
  
  // sourceRelPath e.g. "postprocessing/EffectComposer"
  const base = path.dirname(sourceRelPath); // "postprocessing"
  const resolved = path.normalize(path.join(base, importPath));
  // Remove trailing .js
  return resolved.replace(/\.js$/, '');
}

/** Check if a string looks like GLSL shader code (syntax-error on exec). */
function isGlsl(code) {
  try {
    // Try to compile as JS — valid GLSL without variable declarations usually fails
    Function(code);
    return false;
  } catch(_) {
    return true;
  }
}

/** Strip all ES-module import/export statements from JS code. */
function stripModules(code, relPath) {
  // Remove export default ... lines
  code = code.replace(/^\s*export\s+(?:default\s+)?[\w{}()\[\]]+\s*[,;]/gm, '');
  // Remove export { ... } lines
  code = code.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  // Remove import ... from '...' lines
  code = code.replace(/^\s*import\s+.+?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  
  // Handle multi-line imports: import {\n  Foo,\n  Bar\n} from 'x';
  code = code.replace(
    /import\s*\{[\s\S]*?\}\s*from\s+['"][^'"]+['"]\s*;?\s*/g, ''
  );
  // Named namespace imports: import * as X from 'y';
  code = code.replace(/import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"]\s*;?\s*/g, '');
  // Default imports: import X from 'y';
  code = code.replace(/import\s+\w+\s+from\s+['"][^'"]+['"]\s*;?\s*/g, '');
  
  return code;
}

/** Replace `.js` extensions in string literals for internal paths. */
function fixJsExts(code) {
  // 'three/addons/postprocessing/SomePass.js' -> 'three/addons/postprocessing/SomePass'
  return code.replace(/['"]([^'\"]*?)\.js['"]/g, (_, s) => {
    if (s.includes('../') || s.includes('./')) {
      return s.slice(0, -3); // strip .js from internal relative paths
    }
    return s; // bare 'three' stays
  });
}

function preprocess(code, relPath) {
  let out = stripModules(code, relPath);
  out = fixJsExts(out);
  // Remove JSDoc @type annotations
  out = out.replace(/\/\*\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, (match) => {
    if (match.includes('@type')) return '';
    return match; // keep non-type doc comments
  });
  // Remove import.meta.url
  out = out.replace(/import\.meta\.url/g, '""');
  return out;
}

// ============================================================
// DEPENDENCY RESOLUTION
// ============================================================

/** Walk the dependency graph BFS-style from starting modules. Returns deduped list. */
function resolveDependencies(startingModules) {
  const ordered = [];
  const seen = new Set();
  const queue = [...startingModules];

  while (queue.length > 0) {
    const mod = queue.shift();
    if (seen.has(mod)) continue;
    
    // Expand globs
    const expanded = expandGlobs([mod]);
    
    for (const m of expanded) {
      if (seen.has(m)) continue;
      const fullPath = path.join(EXAMPLES, m + '.js');
      
      if (!exists(fullPath)) {
        console.warn(`  [MISSING] ${m}`);
        continue;
      }
      
      seen.add(m);
      const content = read(fullPath);
      
      // Parse imports from ORIGINAL content (before stripping)
      const rawImports = content.match(/import\s+(\*+\s+\w+\s+from\s+|{[^}]*}\s+from\s+|\w+\s+from\s+)['"]([^'"]+)['"]/g) || [];
      for (const imp of rawImports) {
        const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
        if (!fromMatch) continue;
        const depPath = fromMatch[1];
        
        // Only process relative imports (internal deps)
        if (!depPath.startsWith('.')) continue;
        // Skip 'three' references
        
        const resolved = resolveImport(depPath, m);
        
        // Skip if it's 'three' (external bare spec)
        if (resolved === 'three') continue;
        
        // If resolved matches a known glob
        queue.push(resolved);
      }
      
      ordered.push({ name: m, path: fullPath, content });
    }
  }
  
  return ordered;
}

function expandGlobs(patterns) {
  const result = [];
  for (const p of patterns) {
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      const dir = p.includes('/') ? path.dirname(p) : '.';
      const actualDir = path.join(EXAMPLES, dir);
      if (exists(actualDir)) {
        const files = fs.readdirSync(actualDir).filter(f => f.startsWith(prefix) && f.endsWith('.js'));
        for (const f of files) {
          result.push(path.join(dir, f.slice(0, -3)));
        }
      }
    } else {
      result.push(p);
    }
  }
  return result;
}

// ============================================================
// MAIN BUILD
// ============================================================

function main() {
  console.log('[bundle] Building three.js vendor bundle…');
  console.log('[bundle]   Project:', PROJECT);
  console.log('[bundle]   Three.js pkg:', THREE_PKG);
  
  // Read the core build
  const corePath = path.join(THREE_PKG, 'build', 'three.module.js');
  const coreFull = read(corePath);
  
  // Extract just the module body — remove surrounding license/IIFE
  // three.module.js is a flat module file with interdependent class definitions
  // We need the entire content minus the outer license header
  
  // Find the first `export {` or `const __exports` or similar marker
  // Actually, three.module.js starts with license comments then goes straight into class/function defs
  // ending with the final export object
  
  // Strategy: keep everything between the first `var __commonJS`/`var __defProp` marker
  // and the last `};` before the closing `})();`
  
  // For r185, the structure is:
  // License header
  // function defs, class defs (interleaved)
  // var __esModuleExports = {}; ... exports ...
  
  // Just take it all after the initial license block
  let coreBody = coreFull;
  
  // Strip the initial license comment block (everything before first meaningful code)
  const firstLineOfCode = coreBody.search(/^\/\*\*[\s\S]*?SPDX.*?\*\//im);
  if (firstLineOfCode > 0) {
    coreBody = coreBody.substring(firstLineOfCode);
  }
  
  // Strip leading/trailing whitespace and the outer module wrapper if present
  coreBody = coreBody.trim();
  // Remove opening IIFE if there is one
  if (coreBody.startsWith('(function(')) {
    const closeIdx = coreBody.lastIndexOf('})(typeof');
    if (closeIdx > 0) {
      coreBody = coreBody.substring(0, closeIdx + 2); // keep up to }); 
    }
  }
  
  // Strip export statements at the end
  // Remove anything like: const __esModuleExports = {...} followed by })
  // Actually three.module.js ends with something like:
  // export { ACESFilmicToneMapping, ... };
  // We want to REMOVE these export lines since we'll assign everything to window.THREE ourselves
  
  // Match and remove the final export block
  coreBody = coreBody.replace(/\nexport\s+\{(?:[^}]*)\}\s*;?\s*$/, '');
  coreBody = coreBody.replace(/const __esModuleExports\s*=\s*\{[\s\S]*?\nmodule\.exports/g, '');
  
  // Also handle the pattern where three uses:
  // THREE = __toESM(require_three())
  // We want to preserve the class/function definitions but remove these helpers
  
  // Remove CommonJS require wrappers that esbuild may add
  coreBody = coreBody.replace(/^var __require = \(?.*?\n\)\(\);\n/m, '');
  coreBody = coreBody.replace(/^var __defProp =.*?\)\(/m, '(function(_target){');
  coreBody = coreBody.replace(/^var __getOwnPropNames = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __getOwnPropSymbols = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __hasOwnProp = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __propIsEnum = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __standardCSMap = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __esExport = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __create = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __setModuleDefault = .*(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __classPrivateFieldGet = .*?\n\}\)(?:\n|$)/gm, '');
  coreBody = coreBody.replace(/^var __classPrivateFieldSet = .*?\n\}\)(?:\n|$)/gm, '');
  
  // Clean up remaining commonJS shim functions
  // Pattern: var X = () => { ... };
  // These are used internally by esbuild for dynamic imports - they're harmless but unnecessary
  // Leave them though, they don't break anything
  
  // Final cleanup: make sure the body is valid standalone JS
  coreBody = coreBody.replace(/\nmodule\.exports\s*=.*?(?=\/\*!\s*Bundled)/, '\n');
  
  console.log(`[bundle]   Core file: ${Math.round(fs.statSync(corePath).size / 1024)} KB`);
  
  // Resolve all addon dependencies
  console.log('\n[bundle] Resolving addon dependencies...');
  const addonsRes = resolveDependencies(ADDONS);
  console.log(`[bundle]   Found ${addonsRes.length} addon/shader modules`);
  
  // Separate shaders from regular JS modules  
  const shaders = [];
  const jsModules = [];
  
  for (const mod of addonsRes) {
    if (isGlsl(mod.content)) {
      shaders.push(mod);
    } else {
      jsModules.push(mod);
    }
  }
  
  console.log(`[bundle]   ${shaders.length} shader files, ${jsModules.length} JS module files`);
  
  // Process shaders
  const shaderBlock = [];
  for (const mod of shaders) {
    // Glsl needs special handling - it's not valid JS
    // Extract the vertexShader / fragmentShader template literal strings
    const processed = preprocess(mod.content, mod.name);
    shaderBlock.push(`\n// ${mod.name}`);
    shaderBlock.push(processed);
  }
  
  // Process JS modules
  const jsBlock = [];
  for (const mod of jsModules) {
    const processed = preprocess(mod.content, mod.name);
    jsBlock.push(`\n// ${mod.name}`);
    jsBlock.push(processed);
  }
  
  // Collect all exported symbols from the addon modules
  // so we can attach them to window.THREE
  const addonExports = collectAddonExports(jsModules, shaders);
  
  // Assemble the final bundle
  const chunks = [];
  
  // Header
  chunks.push(`// Magnetosphere Reborn — bundled three.js r${detectVersion(coreFull)} core + addons`);
  chunks.push('// Auto-generated by build-bundle.js');
  chunks.push('');
  chunks.push('(function() {');
  chunks.push('"use strict";');
  chunks.push('if (typeof window === "undefined") throw new Error("three.js requires a browser environment");');
  chunks.push('');
  
  // Core
  chunks.push('// ========== three.js CORE ==========\n' + coreBody);
  chunks.push('');
  
  // Shaders
  chunks.push('// ========== SHADERS ==========\n' + shaderBlock.join('\n'));
  chunks.push('');
  
  // Addon modules
  chunks.push('// ========== ADDON MODULES ==========\n' + jsBlock.join('\n'));
  chunks.push('');
  
  // Attach everything to window.THREE
  chunks.push('// ========== EXTEND window.THREE ==========\n');
  chunks.push('Object.assign(window.THREE, {\n');
  
  // Collect all global-class-like symbols that were defined by addons
  // These are things that the original addons do: EffectComposer, UnrealBloomPass, etc.
  const symbolList = [];
  for (const mod of jsModules) {
    const name = mod.name.split('/').pop().replace(/\.js$/, '');
    // Convert PascalCase names that are likely classes
    // EffectComposer -> EffectComposer
    // Pass -> Pass
    // CopyShader -> CopyShader
    const symbolName = name;
    
    // Skip if already defined in core (we want to override/add addon-specific ones)
    if (coreBody.includes(`class ${symbolName}`) || coreBody.includes(`var ${symbolName} =`)) {
      continue; // Already in core
    }
    
    symbolList.push(symbolName);
  }
  
  // Sort for readability
  symbolList.sort();
  
  for (const sym of symbolList) {
    chunks.push(`  ${sym},`);
  }
  
  chunks.push('});');
  chunks.push('})();');
  
  // Write output
  const bundle = chunks.join('\n');
  fs.writeFileSync(OUTPUT, bundle, 'utf8');
  
  const sizeBytes = Buffer.byteLength(bundle, 'utf8');
  const sizeMb = (sizeBytes / 1024 / 1024).toFixed(1);
  console.log(`\n[bundle] ✅ Written: ${OUTPUT}`);
  console.log(`[bundle]    Size: ${sizeBytes.toLocaleString()} bytes (${sizeMb} MB)`);
  console.log(`[bundle]    Symbols added to THREE: ${symbolList.length}`);
}

function collectAddonExports(jsModules, shaders) {
  // Analyze each processed module for exports
  const allExports = [];
  
  for (const mod of [...jsModules, ...shaders]) {
    const content = mod.content;
    
    // Match class declarations: class ClassName extends ...
    const classMatches = content.match(/(?:^|[\s;])class\s+(\w+)/g);
    if (classMatches) {
      for (const m of classMatches) {
        const name = m.match(/class\s+(\w+)/)[1];
        if (!allExports.includes(name)) allExports.push(name);
      }
    }
    
    // Match named exports: const X = ... | export const X = ... | function X(...)
    const constMatches = content.match(/(?:^|[\s;])(?:export\s+)?(?:const|let|var|function)\s+(\w+)/g);
    if (constMatches) {
      for (const m of constMatches) {
        const name = m.match(/(?:export\s+)?(?:const|let|var|function)\s+(\w+)/)?.[1];
        if (name && !allExports.includes(name) && !name.startsWith('_') && name.length > 2) {
          allExports.push(name);
        }
      }
    }
  }
  
  return allExports;
}

function detectVersion(coreContent) {
  // three.module.js often has version info somewhere
  const versionMatch = coreContent.match(/version\s*[=:]\s*"([\d.]+)"/) ||
                       coreContent.match(/r(\d+)/) ||
                       coreContent.match(/\b0\.(\d+)\.\d+\b/);
  return versionMatch ? versionMatch[1] : '?';
}

main();
