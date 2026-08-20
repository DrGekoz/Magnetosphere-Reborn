// bundle entry: three core + postprocessing addons -> window.THREE
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Build a fresh namespace object that carries core + addons
const NS = Object.assign({}, THREE, {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  OutputPass,
});

window.THREE = NS;
