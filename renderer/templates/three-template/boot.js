// boot.js — shared three.js theme host boot: canvas sizing, message listeners,
// theme selection, render loop. Talks to the Magnetosphere Reborn host app.
(function () {
  'use strict';
  var THREE = window.THREE;
  var canvas = document.getElementById('c');
  if (!canvas) return;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 0, 0);

  // lights (shared across themes that need them)
  var ambient = new THREE.AmbientLight(0x334466, 0.8);
  scene.add(ambient);
  var dirLight = new THREE.DirectionalLight(0xfff5e0, 1.4);
  dirLight.position.set(6, 12, 6);
  scene.add(dirLight);
  var pointLight = new THREE.PointLight(0x4488ff, 1.0, 40);
  pointLight.position.set(-4, 6, -4);
  scene.add(pointLight);

  var audio = { energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, fft: null, wave: null };
  var params = {};
  var activeKey = null;
  var active = null;

  function setTheme(key) {
    if (!window.__THEMES || !window.__THEMES[key]) return;
    if (activeKey === key && active) { active.update(1 / 60, performance.now() / 1000, audio, params); return; }
    // remove old theme objects
    if (active && active.objs) scene.remove(active.objs);
    activeKey = key;
    active = window.__THEMES[key];
    // reset camera for themes that want top-down etc.
    camera.position.set(0, 2, 10);
    camera.lookAt(0, 0, 0);
    if (active.init) active.init(scene, camera, renderer);
  }

  // messages from host
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || !d.__mag) return;
    if (d.__mag === 'mag-audio') {
      audio.energy = d.energy || 0;
      audio.bass = d.bass || 0;
      audio.mid = d.mid || 0;
      audio.treble = d.treble || 0;
      audio.beat = d.beat || 0;
      if (d.fft) audio.fft = d.fft;
      if (d.wave) audio.wave = d.wave;
    }
    if (d.__mag === 'mag-three-template-params') {
      var p = d.params || {};
      params = p;
      var key = p.theme;
      if (!key) {
        // fall back to a theme index mapping if no explicit theme
        key = 'lines';
      }
      setTheme(key);
    }
    if (d.__mag === 'mag-three-template-resize' && d.w && d.h) {
      canvas.width = d.w; canvas.height = d.h;
      camera.aspect = d.w / d.h;
      camera.updateProjectionMatrix();
      renderer.setSize(d.w, d.h);
    }
  });

  // default theme
  setTheme('lines');

  function loop() {
    requestAnimationFrame(loop);
    var t = performance.now() / 1000;
    if (active && active.update) {
      try { active.update(1 / 60, t, audio, params); } catch (e) {}
    }
    renderer.render(scene, camera);
  }
  loop();

  try { window.parent.postMessage({ __mag: 'mag-three-template-ready' }, '*'); } catch (e) {}
})();
