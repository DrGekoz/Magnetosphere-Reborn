// bundle entry: three core + ALL addons -> window.THREE
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { MaskPass } from 'three/examples/jsm/postprocessing/MaskPass.js';
import { ClearPass } from 'three/examples/jsm/postprocessing/ClearPass.js';
import { SavePass } from 'three/examples/jsm/postprocessing/SavePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { HalftonePass } from 'three/examples/jsm/postprocessing/HalftonePass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { RenderTransitionPass } from 'three/examples/jsm/postprocessing/RenderTransitionPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { DotScreenPass } from 'three/examples/jsm/postprocessing/DotScreenPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

// Build a fresh namespace object that carries core + addons
const NS = Object.assign({}, THREE, {
  EffectComposer, RenderPass, ShaderPass, MaskPass, ClearPass, SavePass,
  UnrealBloomPass, OutputPass, BokehPass, SSAOPass, GTAOPass, SAOPass,
  SSRPass, OutlinePass, HalftonePass, RenderPixelatedPass, RenderTransitionPass,
  FilmPass, DotScreenPass, GlitchPass, SMAAPass, AfterimagePass, LUTPass, Pass,
  GLTFLoader, RGBELoader, EXRLoader,
  OrbitControls, TransformControls, RoomEnvironment, Reflector, Water, Sky,
  MarchingCubes, SimplexNoise, ConvexGeometry, TeapotGeometry, ImprovedNoise,
  mergeGeometries, SimplifyModifier,
});

window.THREE = NS;
