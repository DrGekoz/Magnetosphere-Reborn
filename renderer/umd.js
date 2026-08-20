'use strict';
// UMD-ish shim so the same files work in browser (plain <script>) and Node.
(function () {
  if (typeof window === 'undefined') return; // Node: leave module alone
  if (!window.__umdLoaded) {
    window.__umdLoaded = true;
    window.__modules = {};
    window.module = { exports: {} };
    window.__export = function (name, mod) { window.__modules[name] = mod; };
  }
})();
