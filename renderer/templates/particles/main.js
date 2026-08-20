// Interactive Particles Music Visualizer — adapted from Codrops (Tiago Canzian)
// MIT License — credit: Coala Music/ARKx, Yuri Artiukh, Ashima Arts (noise), Three.js
'use strict';
(function() {
  // GLSL vertex shader (Ashima Arts simplex noise + curl)
  const VERTEX = `
    varying float vDistance;
    uniform float time; uniform float offsetSize; uniform float size;
    uniform float offsetGain; uniform float amplitude;
    uniform float frequency; uniform float maxDistance;

    vec3 mod289(vec3 x){ return x-floor(x*(1./289.))*289.; }
    vec2 mod289(vec2 x){ return x-floor(x*(1./289.))*289.; }
    vec3 permute(vec3 x){ return mod289(((x*34.)+1.)*x); }

    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.,i1.z,i2.z,1.) )
        + i.y + vec4(0.,i1.y,i2.y,1.) )
        + i.x + vec4(0.,i1.x,i2.x,1.) );
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0+1.0;
      vec4 s1 = floor(b1)*2.0+1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw+s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
      vec4 m = max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
      m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }

    void main(){
      vec3 newpos = position;
      float c1=snoise(vec3(newpos.x*frequency,time*.01,newpos.y*frequency));
      float c2=snoise(vec3(newpos.y*frequency,time*.01,newpos.z*frequency));
      float c3=snoise(vec3(newpos.z*frequency,time*.01,newpos.x*frequency));
      vec3 target = position + normal*.1 + vec3(c1,c2,c3)*amplitude;
      float d = length(newpos-target)/maxDistance;
      newpos = mix(position,target,pow(d,4.));
      newpos.z += sin(time)*(.1*offsetGain);
      vec4 mvPosition = modelViewMatrix*vec4(newpos,1.);
      gl_PointSize = size+(pow(d,3.)*offsetSize)*(1./-mvPosition.z);
      gl_Position = projectionMatrix*mvPosition;
      vDistance = d;
    }`;

  const FRAGMENT = `
    varying float vDistance;
    uniform vec3 startColor; uniform vec3 endColor; uniform vec3 beatPulse;

    float circle(in vec2 _st,in float _radius){
      vec2 dist=_st-vec2(.5);
      return 1.-smoothstep(_radius-(_radius*.01),_radius+(_radius*.01),dot(dist,dist)*4.);
    }

    void main(){
      vec2 uv = vec2(gl_PointCoord.x,1.-gl_PointCoord.y);
      float alpha = circle(uv,1.);
      vec3 color = mix(startColor,endColor,vDistance);
      color += beatPulse*vDistance*0.3;
      gl_FragColor = vec4(color,alpha*vDistance);
    }`;

  function elasticOut(t, strength) {
    if (t === 0 || t === 1) return t;
    const s = strength / 4;
    return Math.pow(2,-10*t)*Math.sin((t-s)*(2*Math.PI)/s)+1;
  }

  let THREE = null;
  let ready = false;
  let engine = null;

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__mag !== 'mag-three') return;
    THREE = d.THREE;
    document.getElementById('particles-canvas').style.display = 'block';
    try { init(); } catch(e) { console.error('[particles] init:', e.message); }
  });

  function init() {
    if (!THREE || ready) return;
    ready = true;

    const container = document.getElementById('particles-container');
    const canvas = document.getElementById('particles-canvas');
    
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 1);

    const camera = new THREE.PerspectiveCamera(70, container.clientWidth/container.clientHeight, 0.1, 10000);
    camera.position.z = 12;

    const scene = new THREE.Scene();
    const holder = new THREE.Object3D();
    holder.rotateX(Math.PI/2);
    scene.add(holder);

    const uniforms = {
      time: { value: 0 },
      offsetSize: { value: 2 },
      size: { value: 1.1 },
      frequency: { value: 2 },
      amplitude: { value: 1 },
      offsetGain: { value: 0 },
      maxDistance: { value: 1.8 },
      startColor: { value: new THREE.Color(0xff00ff) },
      endColor: { value: new THREE.Color(0x00ffff) },
      beatPulse: { value: new THREE.Color(0xffffff) },
    };

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      uniforms,
    });

    let currentType = 'box';
    let pointsMesh = null;
    let timeVal = 0;
    let beatCount = 0;
    let lastBeatTime = 0;
    let params = {};

    function buildMesh() {
      if (pointsMesh) {
        holder.remove(pointsMesh);
        pointsMesh.geometry.dispose();
        pointsMesh.material.dispose();
        pointsMesh = null;
      }
      let geo;
      if (currentType === 'cylinder') {
        const rs = Math.max(1,Math.floor(Math.random()*2)+1);
        const hs = Math.max(1,Math.floor(Math.random()*4)+1);
        geo = new THREE.CylinderGeometry(1,1,4,64*rs,64*hs,true);
        uniforms.offsetSize.value = Math.floor(Math.random()*30)+30;
        uniforms.size.value = 2;
      } else {
        geo = new THREE.BoxGeometry(1,1,1,
          Math.floor(Math.random()*16)+5,
          Math.floor(Math.random()*40)+1,
          Math.floor(Math.random()*75)+5
        );
        uniforms.offsetSize.value = Math.floor(Math.random()*30)+30;
        uniforms.size.value = 1.1;
      }
      pointsMesh = new THREE.Points(geo, material);
      pointsMesh.rotation.set(Math.PI/2,0,0);
      holder.add(pointsMesh);
    }

    buildMesh();

    // Rotation animation
    function animateRot(target, props, dur, str) {
      const froms = {};
      for (const k in props) froms[k] = target[k];
      const st = performance.now();
      const tick = () => {
        const t = Math.min((performance.now()-st)/(dur*1000),1);
        const p = t<1 ? elasticOut(t,str) : 1;
        for (const k in froms) target[k]=froms[k]+(props[k]-froms[k])*p;
        if(t<1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    animateRot(holder.rotation, {
      x: Math.random()*Math.PI,
      z: Math.random()*Math.PI*2,
    }, 3, 0.8);

    // Audio
    let hostAudio = { energy: 0, bass: 0, mid: 0, treble: 0, freqData: null };
    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (!d || d.__mag !== 'mag-audio') return;
      if (d.fft) hostAudio.freqData = d.fft;
      hostAudio.energy = d.energy||0;
      hostAudio.bass = d.bass||0;
      hostAudio.mid = d.mid||0;
      hostAudio.treble = d.treble||0;
    });

    // Params handler
    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (!d || d.__mag !== 'mag-particles-params') return;
      Object.assign(params, d.params);
      if (params.startColor) try { uniforms.startColor.value.set('#'+params.startColor); } catch(e) {}
      if (params.endColor) try { uniforms.endColor.value.set('#'+params.endColor); } catch(e) {}
      if (params.particleFrequency !== undefined) uniforms.frequency.value = params.particleFrequency;
      if (params.particleAmplitude !== undefined) uniforms.amplitude.value = params.particleAmplitude;
    });

    function updateAudio() {
      const a = hostAudio;
      const smooth = 0.12;
      const lowEnergy = a.freqData ? THREE.MathUtils.mapLinear(a.freqData[0]||0,0,255,0,1) : 0;
      
      uniforms.amplitude.value += (0.8+THREE.MathUtils.mapLinear(a.treble,0,0.6,-0.1,0.2)-uniforms.amplitude.value)*smooth;
      uniforms.offsetGain.value += (a.mid*0.6-uniforms.offsetGain.value)*smooth;
      uniforms.frequency.value += (0.5+lowEnergy*2.5-uniforms.frequency.value)*smooth;
      const speed = params.particleSpeed || 0.3;
      timeVal += THREE.MathUtils.clamp(0.2+lowEnergy*0.3*speed, 0.2, 0.5);

      if (a.energy > 0.55 && performance.now()-lastBeatTime > 400) {
        lastBeatTime = performance.now();
        beatCount++;
        uniforms.beatPulse.value.setRGB(1,1,1);
        setTimeout(()=>{ uniforms.beatPulse.value.setRGB(0,0,0); },120);
        
        if (beatCount%4===0) {
          currentType = currentType==='box'?'cylinder':'box';
          buildMesh();
          const of = uniforms.frequency.value;
          const nf = THREE.MathUtils.randFloat(0.5,3);
          const st2 = performance.now();
          const af = () => {
            const t = Math.min((performance.now()-st2)/2000,1);
            const p = t===1?1:t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
            uniforms.frequency.value = of+(nf-of)*p;
            if(t<1) requestAnimationFrame(af);
          };
          af();
          animateRot(holder.rotation, {
            y: Math.random()*Math.PI,
            z: Math.random()*Math.PI,
          }, Math.random()<0.8?15:1, 0.2);
        }
      }
    }

    function loop() {
      requestAnimationFrame(loop);
      updateAudio();
      uniforms.time.value = timeVal;
      renderer.render(scene, camera);
    }
    loop();

    window.addEventListener('resize', ()=>{
      camera.aspect = container.clientWidth/container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Signal ready
    try { window.parent.postMessage({__mag:'mag-particles-ready'},'*'); } catch(e) {}
  }
})();
