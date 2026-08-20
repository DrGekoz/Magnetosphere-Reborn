(function(){
'use strict';
// Settings panel UI: HeroIcons inline SVG, all params from schema, material
// dropdown, global themes (paginated, categorized, with SVG thumbnails),
// custom presets (localStorage), About modal with credits. No external deps.

const { SECTIONS, PARAM_SCHEMA, DEFAULTS, MATERIALS, THEMES, hsl2rgb } = window.__modules.presets;

// HeroIcons (outline) inline SVGs
const ICONS = {
  settings: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>',
  palette: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/></svg>',
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/></svg>',
  globe: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/></svg>',
  bolt: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ic"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>',
};

const CREDITS = [
  { name: 'MilkDrop3', url: 'https://github.com/milkdrop2077/MilkDrop3', desc: 'Audio routing + preset concepts (WASAPI loopback, beat detection)' },
  { name: 'audioMotion-analyzer', url: 'https://github.com/hvianna/audioMotion-analyzer', desc: 'High-res audio spectrum analyzer (AGPL-3.0), integrated as a visual mode' },
  { name: 'party-mode / vizz.fm', url: 'https://github.com/preziotte/party-mode', desc: 'Browser music visualizer inspiration (d3.js / WebGL)' },
  { name: 'The Book of Shaders', url: 'https://github.com/patriciogonzalezvivo/thebookofshaders', desc: 'Shader education & reference' },
  { name: 'tinyraytracer', url: 'https://github.com/ssloy/tinyraytracer', desc: 'Raytracing reference' },
  { name: 'The-Forge', url: 'https://github.com/ConfettiFX/The-Forge', desc: 'Cross-platform rendering framework (considered, not used)' },
];

class UI {
  constructor(callbacks) {
    this.cb = callbacks; // {onChange(key,val), onApplyTheme(theme), onSavePreset(name,params), onDeletePreset(name), onQuit}
    this.open = false;
    this.els = {};
    this.themePage = 0;
    this.themeCat = 'All';
    this.perPage = 6;
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'ui-root';

    const fps = document.createElement('div');
    fps.id = 'fps';
    root.appendChild(fps);

    // Settings gear is the ONLY top-right control (user: no quit button)
    const gear = document.createElement('button');
    gear.id = 'settings-btn';
    gear.title = 'Settings';
    gear.innerHTML = ICONS.settings;
    gear.addEventListener('click', () => this.toggle());
    root.appendChild(gear);

    const panel = document.createElement('div');
    panel.id = 'panel';
    panel.className = 'hidden';
    panel.innerHTML = this._panelHTML();
    root.appendChild(panel);
    document.body.appendChild(root);

    this._bindPanel(panel);
  }

  _panelHTML() {
    const materials = Object.keys(MATERIALS).map((m) => `<option value="${m}">${m}</option>`).join('');
    let html = `
      <div class="panel-head">
        <div class="panel-title">${ICONS.sparkles} Settings</div>
        <div class="panel-close" id="panel-close">${ICONS.close}</div>
      </div>
      <div class="panel-scroll">
      <div class="section">
        <div class="sec-label">${ICONS.globe} GLOBAL THEMES</div>
        <div id="theme-cats" class="cat-row"></div>
        <div id="theme-grid" class="theme-grid"></div>
        <div id="theme-pager" class="pager-row"></div>
        <div class="theme-row" style="margin-top:8px">
          <button id="preset-add" title="Save current settings as custom preset" class="icon-btn">${ICONS.plus}</button>
        </div>
        <div id="custom-presets" class="preset-list"></div>
      </div>
      <div class="section">
        <div class="sec-label">${ICONS.bolt} QUICK ACTIONS</div>
        <div class="theme-row">
          <button id="randomize" class="mini-btn">Randomize</button>
          <button id="reset-all" class="mini-btn">Reset</button>
        </div>
      </div>
    `;
    for (const sec of SECTIONS) {
      html += `<div class="section"><div class="sec-label">${ICONS.palette} ${sec.label}</div>`;
      const params = PARAM_SCHEMA.filter((p) => p.section === sec.id);
      for (const p of params) {
        if (p.key === 'material') {
          html += `<div class="param"><label for="p-material">Material</label><select id="p-material" class="p-drop">${materials}</select></div>`;
          continue;
        }
        html += this._paramHTML(p);
      }
      html += `</div>`;
    }
    html += `<div class="section"><button id="about-btn" class="mini-btn" style="width:100%">${ICONS.info} About / Credits</button></div>`;
    html += `</div>`;
    return html;
  }

  _paramHTML(p) {
    const id = `p-${p.key}`;
    if (p.type === 'dropdown') {
      const opts = (p.options || []).map((o) => `<option value="${o}">${o}</option>`).join('');
      return `<div class="param"><label for="${id}">${p.label}</label><select id="${id}" class="p-drop">${opts}</select></div>`;
    }
    if (p.type === 'toggle') {
      return `<div class="param"><label for="${id}">${p.label}</label><input type="checkbox" id="${id}" class="p-toggle"></div>`;
    }
    return `<div class="param"><label for="${id}">${p.label}</label>
      <div class="slider-row"><input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step || 0.01}" class="p-slider"><span class="p-val" id="${id}-val"></span></div></div>`;
  }

  _bindPanel(panel) {
    this.els = {};
    panel.querySelectorAll('[id]').forEach((el) => { this.els[el.id] = el; });

    panel.querySelector('#panel-close').addEventListener('click', () => this.toggle(false));
    this.els['preset-add'].addEventListener('click', () => {
      const name = prompt('Preset name:');
      if (name) this.cb.onSavePreset(name, this.currentParams());
    });
    this.els['randomize'].addEventListener('click', () => this.cb.onRandomize());
    this.els['reset-all'].addEventListener('click', () => this.cb.onResetAll());
    this.els['about-btn'].addEventListener('click', () => this._openAbout());

    // theme category chips
    this._renderCats();
    this._renderThemeGrid();

    for (const p of PARAM_SCHEMA) {
      const el = this.els[`p-${p.key}`];
      if (!el) continue;
      if (p.type === 'slider') {
        el.addEventListener('input', () => {
          const v = parseFloat(el.value);
          this.els[`p-${p.key}-val`].textContent = this._fmt(v);
          this.cb.onChange(p.key, v);
        });
      } else if (p.type === 'toggle') {
        el.addEventListener('change', () => this.cb.onChange(p.key, el.checked ? 1 : 0));
      } else if (p.type === 'dropdown') {
        el.addEventListener('change', () => this.cb.onChange(p.key, el.value));
      }
    }
    // material dropdown bound to param key 'material'
    const matEl = this.els['p-material'];
    if (matEl) matEl.addEventListener('change', () => this.cb.onChange('material', matEl.value));

    this._renderCustomPresets();
  }

  _allThemes() {
    return THEMES.map((t) => ({ ...t, category: t.category || this._guessCat(t) }));
  }
  _guessCat(t) {
    const n = t.name.toLowerCase();
    if (['eclipse', 'space', 'black hole', 'wormholes', 'galaxy', 'toxic'].some((k) => n.includes(k))) return 'Sci-Fi';
    if (['fire', 'ice', 'water', 'lava lamp', 'aurora', 'ember storm'].some((k) => n.includes(k))) return 'Nature';
    if (['wmp', 'plasma', 'neon', 'matrix', 'scope', 'bars'].some((k) => n.includes(k))) return 'Retro';
    if (['candy', 'prism', 'bubble'].some((k) => n.includes(k))) return 'Classic';
    if (['blood', 'ultraviolet', 'storm'].some((k) => n.includes(k))) return 'Energy';
    return 'Dark';
  }

  _renderCats() {
    const cont = this.els['theme-cats'];
    if (!cont) return;
    const cats = ['All', ...new Set(this._allThemes().map((t) => t.category))];
    cont.innerHTML = '';
    for (const c of cats) {
      const b = document.createElement('button');
      b.className = 'cat-chip' + (c === this.themeCat ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', () => { this.themeCat = c; this.themePage = 0; this._renderCats(); this._renderThemeGrid(); });
      cont.appendChild(b);
    }
  }

  _filteredThemes() {
    return this._allThemes().filter((t) => this.themeCat === 'All' || t.category === this.themeCat);
  }

  _renderThemeGrid() {
    const cont = this.els['theme-grid'];
    const pager = this.els['theme-pager'];
    if (!cont) return;
    const list = this._filteredThemes();
    const pages = Math.max(1, Math.ceil(list.length / this.perPage));
    this.themePage = Math.min(this.themePage, pages - 1);
    const slice = list.slice(this.themePage * this.perPage, (this.themePage + 1) * this.perPage);
    cont.innerHTML = '';
    for (const t of slice) {
      const card = document.createElement('div');
      card.className = 'theme-card' + (this._activeId === t.id ? ' active' : '');
      card.innerHTML = `<img class="theme-thumb" src="${this._thumbSVG(t)}" alt="${t.name}"><div class="theme-name">${t.name}</div><div class="theme-desc">${t.desc || ''}</div>`;
      card.addEventListener('click', () => { this._activeId = t.id; this.cb.onApplyTheme(t); this._renderThemeGrid(); });
      cont.appendChild(card);
    }
    pager.innerHTML = '';
    if (pages > 1) {
      const prev = document.createElement('button');
      prev.className = 'mini-btn'; prev.textContent = '< Prev';
      prev.disabled = this.themePage === 0;
      prev.addEventListener('click', () => { this.themePage--; this._renderThemeGrid(); });
      const next = document.createElement('button');
      next.className = 'mini-btn'; next.textContent = 'Next >';
      next.disabled = this.themePage >= pages - 1;
      next.addEventListener('click', () => { this.themePage++; this._renderThemeGrid(); });
      const cnt = document.createElement('span');
      cnt.className = 'pager-count';
      cnt.textContent = `${this.themePage + 1} / ${pages}`;
      pager.appendChild(prev); pager.appendChild(cnt); pager.appendChild(next);
    }
  }

  _thumbSVG(t) {
    const p = t.params || {};
    const band0 = hsl2rgb(p.band0HueStart || 140, p.band0Sat || 0.9, p.band0Light || 0.55);
    const band1 = hsl2rgb(p.band1HueStart || 90, p.band1Sat || 0.9, p.band1Light || 0.55);
    const band2 = hsl2rgb(p.band2HueStart || 220, p.band2Sat || 0.9, p.band2Light || 0.5);
    const bg = hsl2rgb(p.bgHue || 180, p.bgSat || 0.5, p.bgLight || 0.05);
    const c = (v) => `rgb(${Math.round(v[0] * 255)},${Math.round(v[1] * 255)},${Math.round(v[2] * 255)})`;
    const starN = (p.starDensity || 0.5) * 40;
    let stars = '';
    for (let i = 0; i < starN; i++) {
      const x = (i * 37.7) % 100, y = (i * 53.3) % 100, r = 0.4 + (i % 3) * 0.3;
      stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="rgba(255,255,255,${0.2 + (i % 5) * 0.12})"/>`;
    }
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">
        <rect width="160" height="90" fill="${c(bg)}"/>
        <defs><radialGradient id="g0" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${c(band0)}" stop-opacity="0.9"/><stop offset="100%" stop-color="${c(band0)}" stop-opacity="0"/></radialGradient>
        <radialGradient id="g1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${c(band1)}" stop-opacity="0.9"/><stop offset="100%" stop-color="${c(band1)}" stop-opacity="0"/></radialGradient>
        <radialGradient id="g2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${c(band2)}" stop-opacity="0.9"/><stop offset="100%" stop-color="${c(band2)}" stop-opacity="0"/></radialGradient></defs>
        ${stars}
        <circle cx="80" cy="45" r="26" fill="url(#g0)"/>
        <circle cx="56" cy="38" r="14" fill="url(#g1)"/>
        <circle cx="104" cy="52" r="16" fill="url(#g2)"/>
        <circle cx="80" cy="45" r="9" fill="${c(bg)}" opacity="0.85"/>
      </svg>`
    )}`;
  }

  _openAbout() {
    const modal = document.createElement('div');
    modal.className = 'about-modal';
    let items = '';
    for (const cr of CREDITS) {
      items += `<div class="credit-item"><a href="${cr.url}" target="_blank">${cr.name}</a><div class="credit-desc">${cr.desc}</div></div>`;
    }
    modal.innerHTML = `
      <div class="about-box">
        <div class="about-head"><span>About / Credits</span><span class="about-close" id="about-close">${ICONS.close}</span></div>
        <div class="about-body">
          <p class="about-title">Magnetosphere Reborn</p>
          <p class="about-sub">Real-time raymarched metaball music visualizer. Reacts to system audio, raytraced reflections, volumetric god rays, adaptive resolution. Single portable exe (Electron + WebGL2).</p>
          <p class="about-built">Built by DrGekoz</p>
          <div class="about-credits">${items}</div>
          <p class="about-license">audioMotion-analyzer is included under AGPL-3.0. Source available on request / at the project repo.</p>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('#about-close')) modal.remove(); });
  }

  _renderCustomPresets() {
    const cont = this.els['custom-presets'];
    if (!cont) return;
    cont.innerHTML = '';
    const presets = JSON.parse(localStorage.getItem('itv-custom-presets') || '[]');
    for (const pr of presets) {
      const row = document.createElement('div');
      row.className = 'preset-row';
      const btn = document.createElement('button');
      btn.className = 'mini-btn preset-name';
      btn.textContent = pr.name;
      btn.addEventListener('click', () => this.cb.onApplyCustom(pr.name));
      const del = document.createElement('button');
      del.className = 'icon-btn small';
      del.innerHTML = ICONS.trash;
      del.title = 'Delete preset';
      del.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onDeletePreset(pr.name); });
      row.appendChild(btn);
      row.appendChild(del);
      cont.appendChild(row);
    }
  }

  currentParams() {
    const out = {};
    for (const p of PARAM_SCHEMA) {
      const el = this.els[`p-${p.key}`];
      if (!el) continue;
      out[p.key] = p.type === 'toggle' ? (el.checked ? 1 : 0) : (p.type === 'dropdown' ? el.value : parseFloat(el.value));
    }
    const matEl = this.els['p-material'];
    if (matEl) out.material = matEl.value;
    return out;
  }

  _fmt(v) { return (Math.round(v * 100) / 100).toString(); }

  setParams(params) {
    for (const p of PARAM_SCHEMA) {
      const el = this.els[`p-${p.key}`];
      if (!el || !(p.key in params)) continue;
      if (p.type === 'slider') {
        el.value = params[p.key];
        this.els[`p-${p.key}-val`].textContent = this._fmt(params[p.key]);
      } else if (p.type === 'toggle') {
        el.checked = params[p.key] === 1 || params[p.key] === true;
      } else {
        el.value = params[p.key];
      }
    }
    const matEl = this.els['p-material'];
    if (matEl && params.material) matEl.value = params.material;
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    const panel = this.els['panel'] || document.getElementById('panel');
    if (!panel) return;
    panel.classList.toggle('hidden', !this.open);
    const btn = this.els['settings-btn'];
    if (btn) btn.classList.toggle('active', this.open);
  }

  setFPS(text) {
    const el = this.els['fps'] || document.getElementById('fps');
    if (el) el.textContent = text;
  }
}

if (typeof window !== 'undefined' && window.__export) { window.__export('ui', UI); }
module.exports = UI;

})();
