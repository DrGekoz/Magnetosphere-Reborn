# 🪐 Magnetosphere Reborn

<div align="center">

![Magnetosphere Reborn](https://img.shields.io/badge/Magnetosphere%20Reborn-Music%20Visualizer-181717?style=for-the-badge&logo=electron&logoColor=white)

[![Electron](https://img.shields.io/badge/Electron-37-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![WebGL2](https://img.shields.io/badge/WebGL2-Raymarching-990000?style=for-the-badge&logo=webgl&logoColor=white)]()
[![NVIDIA](https://img.shields.io/badge/NVIDIA-RTX%203070-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](https://nvidia.com)
[![Windows](https://img.shields.io/badge/Windows-Portable%20EXE-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://microsoft.com)
[![FPS](https://img.shields.io/badge/Performance-180%20FPS-FF6B35?style=for-the-badge)]()
[![Wallpaper Engine](https://img.shields.io/badge/Wallpaper%20Engine-Ready-8A2BE2?style=for-the-badge)]()
[![Audio](https://img.shields.io/badge/Audio-Any%20App-00B172?style=for-the-badge&logo=spotify&logoColor=white)]()

## ❤️ Support This Project

<a href="https://www.buymeacoffee.com/drgekoz" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

![Magnetosphere Reborn showcase](docs/images/screenshot_1.png)

**A real-time raymarched metaball music visualizer. Glowing orbs merge and flow like liquid, react to whatever is playing on your system, and render with raytraced reflections, volumetric god rays, and a procedural starfield — at 180fps on an RTX 3070. Ships as a single portable exe. No install. No virtual audio cables.**

[The Visual Engine](#-the-visual-engine) · [Audio Routing](#-audio-routing) · [Themes & Materials](#-themes--materials) · [Supported Hardware](#supported-hardware) · [Getting Started](#getting-started) · [Features](#-features)

</div>

## 🎥 Example Output

<p align="center">
  <a href="https://github.com/DrGekoz/Magnetosphere-Reborn">
    <img src="https://img.shields.io/badge/Screenshots_In_README-View-FF6B35?style=for-the-badge&logo=image" alt="Magnetosphere screenshots">
  </a>
</p>

Every frame is a raymarched scene: metaball orbs that smoothly union into each other, band-colored by the music, lit by a key light that casts real volumetric god rays through fog, with reflective surfaces and a starfield that flickers to the beat.

---

> **Status:** Runs **fully locally on an RTX 3070 8GB** — no cloud, no API keys, no audio routing software. Captures system audio directly (Spotify, YouTube, Apple Music, Winamp, games — anything). One 80MB portable exe.

---

## What is Magnetosphere Reborn?

Magnetosphere Reborn is a music visualizer built as a **web app wrapped in a single portable exe** (Electron + WebGL2). No engine, no install — raw GLSL shaders running on your GPU, driven by a live FFT of whatever your system is playing.

The core is a **raymarched metaball field**: dozens of orbs (each mapped to a frequency band) that merge into each other like liquid metal when close. When music plays they glow, pulse, and spawn particle trails; when it goes quiet they settle into a dark **eclipse** state — a black core with a glowing rim.

Built for **music lovers, streamers, and desktop customization fans** who want a gorgeous, reactive visualizer that just works — no configuration, no virtual audio cable, no subscription.

> **I built this as a personal Wallpaper Engine companion** — the same exe runs as a desktop wallpaper or a standalone fullscreen visualizer. Press `ALT+Enter` for fullscreen (the hint hides itself inside Wallpaper Engine).

---

## 🧠 How the rendering works

Magnetosphere Reborn does **all rendering on the GPU with hand-written GLSL** — no 3D engine, no scene graph, no overhead. The whole thing is a set of fragment shaders:

- **Raymarching** — every pixel marches a ray through a metaball SDF (smooth-min union of spheres). The field is evaluated per-step against all orbs, giving real liquid merging (not just circles that overlap).
- **Metaball physics** — a CPU sim (viscosity, magnetism, gravity, swirl, center pull, anti-cluster repulsion) moves the orbs; the GPU re-evaluates the field every frame. Music scales movement speed and radius.
- **Volumetric fog + god rays** — the key light actually lights the fog: a volumetric pass marches toward the light source, accumulating in-scattered light that orbs shadow, producing real shafts.
- **Raytraced reflections** — surfaces reflect a procedural environment (band-colored nebula + light glow) with roughness-blurred secondary rays.
- **Adaptive resolution governor** — renders at native resolution, and only scales up when there's FPS headroom to spare, holding your target frame rate (default 180fps).

The result: **a 7-layer post stack (bloom → tonemap → vignette → scanlines → chromatic aberration → dither) over a fully raymarched scene**, running at 180fps on a single RTX 3070.

---

## 💻 Optimized for 8GB VRAM / triple 1080p

- **Renders at native resolution** — no pixelated upscaling; the adaptive governor starts at 1.0x and only goes up.
- **Measured 180fps** at 1080p on an RTX 3070 (triple-monitor ready).
- **Efficient raymarch** — sphere-tracing with early exit, quality slider for weaker GPUs.
- **Particles on GPU** — additive point sprites with trail persistence FBO, zero CPU per-particle cost.

**The only thing you need is a GPU that supports WebGL2** (any NVIDIA/AMD/Intel from the last ~8 years). On an RTX 3070 you get the full 180fps experience; weaker cards use the Quality slider.

---

## 🎵 Audio Routing

Magnetosphere Reborn captures **system audio directly** via WASAPI loopback (through Electron's `getDisplayMedia` with the main-process handler — no picker, no permission popup, no virtual cables). It listens to whatever your default output device plays:

| Source | Works? |
|---|---|
| Spotify / Apple Music / Tidal | ✅ |
| YouTube / YouTube Music | ✅ |
| Winamp / foobar2000 / VLC | ✅ |
| Games / Discord / any app | ✅ |
| Microphone (option in settings) | ✅ |

A **Demo mode** (synthesized beat) is built in as a fallback when no audio is playing.

---

## 🎨 Themes & Materials

### Global Themes (24)

Paginated, categorized template selector with live thumbnails:

| Category | Themes |
|---|---|
| **Sci-Fi** | Eclipse, Space, Black Hole, Wormholes, Galaxy, Toxic Swamp |
| **Nature** | Fire, Ice, Water, Lava Lamp, Aurora, Ember Storm |
| **Retro** | WMP Classic, WMP Night, WMP Plasma, Neon Retro, Matrix Rain |
| **Classic** | Beehive, Candy, Prism, Bubble |
| **Energy** | Blood Moon, Ultraviolet, Plasma Storm |

Themes can change **anything** — colors, physics (gravity/magnetism/swirl), background elements, even the entire visual mode. The **Lava Lamp** theme is a real lava lamp: a heat light at the bottom warms orbs → they rise → cool at the top → fall back down, forever.

### Materials (7)

Each material changes surface behavior AND viscosity (how the metaballs flow):

| Material | Viscosity | Look |
|---|---|---|
| **Wax** | High | Blobby lava-lamp flow, matte |
| **Black Hole** | Low | Absorptive dark core, high reflect |
| **Classic** | Medium | Balanced glossy orb |
| **Molten Metal** | Medium | Hot emissive metal, mirror finish |
| **Water** | Very low | Glassy refraction, tight specular |
| **Honey** | Very high | Thick slow merge, golden |
| **Blood** | High | Dark absorptive red, viscous |

### Visual Modes

Orbs (raymarched metaballs) · Bars · Scope · Plasma · Fountain · **audioMotion** (draggable/resizable high-res spectrum analyzer overlay).

---

## Supported Hardware

| Component | Requirement |
|---|---|
| OS | Windows 10/11 (64-bit) |
| GPU | Any WebGL2-capable card; RTX 3070 = 180fps @ 1080p |
| RAM | 2GB+ (runs in ~200MB) |
| Storage | 80MB (single exe) |
| Audio | Any default output device (WASAPI loopback) |

No installers, no runtimes, no Node, no Python — the exe is self-contained.

---

## Getting Started

### Install & Run

```bash
# Option 1: just run the portable exe
Magnetosphere-Reborn.exe

# Option 2: run from source
npm install
npm start
```

**Fullscreen:** `ALT+Enter` (a hint pill shows at the bottom when windowed; it hides itself in fullscreen and inside Wallpaper Engine). `ESC` quits.

**Keyboard shortcuts** (MilkDrop3-style, credit: [MilkDrop3](https://github.com/milkdrop2077/MilkDrop3) / BeatDrop):

| Key | Action |
|---|---|
| `C` | Randomize colors (shuffle the 3 band hues live) |
| `A` / `Z` | Previous / next global theme |
| `N` | Toggle auto-rotate theme every 8 beats |
| `ALT+Enter` | Toggle fullscreen |
| `ESC` | Close settings / quit |

### 🖥️ Wallpaper Engine

The same exe works as a desktop wallpaper:

1. In Wallpaper Engine, click **Add Wallpaper → Browse...** and point it at `Magnetosphere-Reborn.exe`, OR
2. Use any **Application/Window** wallpaper type targeting the exe with the `--wallpaper` flag (always-on-top, no taskbar, no fullscreen hint).

```bash
Magnetosphere-Reborn.exe --wallpaper
```

### 🎛️ Settings Panel

Click the **gear** (top-right). Every parameter is mapped to a control:

| Section | Controls |
|---|---|
| **Global Themes** | Paginated grid with thumbnails, category filter, custom presets (`+`) |
| **Colors** | 3 hue bands (start/end hue + saturation + lightness), merge color blend |
| **Orbs & Physics** | Count, size, gravity, magnetism, swirl, center pull, jitter, heat lamp, merge toggle/amount, viscosity, spawn small orbs, particles, particle rate |
| **Material** | Wax / Black Hole / Classic / Molten Metal / Water / Honey / Blood |
| **Light & Fog** | Light angle + color, fog density/color, god rays |
| **Background** | Color, nebula glow, star density/brightness/twinkle/speed |
| **Effects** | Bloom, vignette, scanlines, chromatic aberration, beat flash, trail persistence, visual mode |
| **Audio** | Sensitivity, smoothing, bass bias, beat threshold, **music motion speed**, source (System / Mic / Demo) |
| **Performance** | Raymarch quality, adaptive resolution, target FPS, FPS counter |
| **About** | Credits + license |

### Build the exe yourself

```bash
npm install
npm run dist        # -> release/Magnetosphere-Reborn.exe (portable, single file)
```

---

## Project Structure

```
Magnetosphere-Reborn/
├── main.js                    Electron main: frameless window, audio loopback handler,
│                              fullscreen toggle, wallpaper mode, capture mode
├── preload.js                 contextBridge (quit, fullscreen, wallpaper, capture)
├── package.json               electron-builder config (portable exe)
├── README.md
│
└── renderer/
    ├── index.html             App shell + CSS (dark glass UI, HeroIcons, hint pill)
    ├── umd.js                 Browser module shim (window.__modules)
    ├── shaders.js             ALL GLSL: raymarch, bars/scope/plasma, bloom, particles, composite
    ├── gl.js                  WebGL2 engine: FBO chain, programs, GPU particles
    ├── presets.js             PARAM_SCHEMA, defaults, materials, 24 themes, hsl2rgb
    ├── scene.js               Orb physics (viscosity/magnetism/heat/merge) + particles
    ├── audio.js               AudioEngine: WASAPI loopback + FFT + beat detect + demo
    ├── ui.js                  Settings panel: theme grid, sliders, About modal, presets
    ├── app.js                 Orchestrator: render loop, adaptive res, audioMotion overlay
    └── vendor/
        └── audiomotion.js     audioMotion-analyzer (AGPL-3.0) — spectrum overlay mode
```

---

## Features

- **Raymarched metaball field** — orbs merge into each other (toggleable), large orbs spawn small ones, colors blend on merge depth
- **Eclipse idle state** — no music = dark core with glowing rim; music = orbs bloom to the beat
- **Volumetric fog + god rays** — the key light really lights the fog, orbs cast shadows in it
- **Raytraced reflections** — rough reflective surfaces with environment sampling
- **7 materials** with real viscosity changes
- **24 global themes** (paginated selector with thumbnails + custom presets)
- **3 color bands** with hue-width sliders (start/end)
- **Particles with trails** that orbit orbs; small orbs orbit large ones; beat ring bursts
- **audioMotion-analyzer overlay** — draggable, resizable (16:9), position remembered
- **Procedural starfield** that flickers to the music
- **Adaptive resolution** — native res, only scales up; holds target FPS (default 180)
- **System audio capture** — no virtual cables, works with any app
- **Single portable exe** — 80MB, no install, Wallpaper Engine ready
- **ALT+Enter fullscreen** with auto-hiding hint

---

## Credits

Built by **DrGekoz**. This project references and builds upon:

| Project | URL | Used for |
|---|---|---|
| MilkDrop3 | https://github.com/milkdrop2077/MilkDrop3 | Audio routing + preset concepts (WASAPI loopback, beat detection); keyboard shortcuts (`C` randomize colors, `A`/`Z` prev/next preset, `N` auto-rotate on beat) |
| audioMotion-analyzer | https://github.com/hvianna/audioMotion-analyzer | High-res spectrum analyzer, integrated as a visual mode (**AGPL-3.0**) |
| party-mode / vizz.fm | https://github.com/preziotte/party-mode | Browser music visualizer inspiration |
| The Book of Shaders | https://github.com/patriciogonzalezvivo/thebookofshaders | Shader education & reference |
| tinyraytracer | https://github.com/ssloy/tinyraytracer | Raytracing reference |
| The-Forge | https://github.com/ConfettiFX/The-Forge | Considered for the renderer, not used (stayed on WebGL2) |

### License

This project is licensed **AGPL-3.0** because it bundles **audioMotion-analyzer** (AGPL-3.0). Full source for the bundled audioMotion-analyzer is at its repository above; the vendored copy ships in `renderer/vendor/audiomotion.js`.
