// Bridge: connects the Interactive Particles visualizer to host app audio via postMessage
// Provides THREE + minimal GSAP substitute as globals for the embedded code
(function () {
  // Wait for parent to send THREE + audio data
  const state = { threeReady: false, audioReady: false };
  let three = null;
  let hostAudio = window.__HOST_AUDIO || { freqData: new Uint8Array(1024).fill(128), waveData: new Uint8Array(2048).fill(128), energy: 0, bass: 0, mid: 0, treble: 0, beat: 0 };

  function updateAudio() {
    try {
      const d = window.__HOST_AUDIO;
      if (!d || !d.freqData) return;
      hostAudio.energy = d.energy || 0;
      hostAudio.bass = d.bass || 0;
      hostAudio.mid = d.mid || 0;
      hostAudio.treble = d.treble || 0;
      hostAudio.beat = d.beat || 0;
      if (d.freqData && hostAudio._freqCopy) {
        hostAudio._freqCopy.set(d.freqData.subarray(0, hostAudio._freqCopy.length));
      }
    } catch (e) {}
  }

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__mag !== 'mag-audio') return;
    if (d.fft && hostAudio._freqCopy && d.fft.length <= hostAudio._freqCopy.length) {
      hostAudio._freqCopy.set(d.fft);
    }
    if (d.energy !== undefined) hostAudio.energy = d.energy;
    if (d.bass !== undefined) hostAudio.bass = d.bass;
    if (d.mid !== undefined) hostAudio.mid = d.mid;
    if (d.treble !== undefined) hostAudio.treble = d.treble;
    if (d.beat !== undefined) hostAudio.beat = d.beat;
  });

  window.__PARTICLES_BRIDGE = {
    getHostAudio: () => hostAudio,
    start: (THREE_lib) => {
      three = THREE_lib;
      state.threeReady = true;
      try { require('./main.js')(three); } catch (e) { console.error('[particles] init:', e.message); }
    },
    updateAudio: updateAudio,
  };

  document.getElementById('gl').addEventListener('click', () => {
    try { window.parent.postMessage({ __mag: 'mag-particles-ready' }, '*'); } catch (e) {}
  });
})();
