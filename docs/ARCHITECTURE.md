# NEXUS — Architecture & Technical Decisions

## 1. High-level architecture

```
┌─────────────────────────────── React (UI layer) ───────────────────────────────┐
│  App.tsx (shell, keyboard, lifecycle)                                          │
│  Nav.tsx · panels.tsx (7 sections) · ui/controls.tsx · ErrorBoundary          │
│  store.ts — zustand: view, explorer, material, particles, shader,             │
│             settings, perf, webgpu                                             │
└───────────────▲───────────────────────────────▲────────────────────────────────┘
                │ subscribe (slice-aware)       │ setPerf / setWebGPU (measured)
┌───────────────┴───────────────────────────────┴────────────────────────────────┐
│  SceneManager (engine, plain three.js, owns the canvas)                        │
│  ├─ WebGLRenderer (ACES tone mapping, PCFSoft shadows, sRGB output)            │
│  ├─ Scene: environment (PMREM RoomEnvironment), lights, fog, stars, floor     │
│  ├─ NexusObject — procedural 6-layer centerpiece                               │
│  ├─ ParticleField — GPGPU particles (ping-pong float RTs + trail history)      │
│  ├─ ShaderLab — custom ShaderMaterial surface                                  │
│  ├─ EffectComposer: RenderPass → UnrealBloomPass → OutputPass (toggleable)     │
│  └─ OrbitControls + raycasting (hover/click) + adaptive DPR + perf sampling    │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Why plain three.js instead of React Three Fiber:** the app needs direct ownership of the `WebGLRenderer`
(context loss, renderer rebuilds for MSAA), GPGPU render targets, and the post-processing composer. R3F adds a
reconciler between React and three's object graph; here the graph is small and imperative by design, so R3F would
add overhead without architectural value. React still owns all DOM/UI, and the store is the only bridge between
UI and engine — state changes are applied imperatively in `SceneManager`'s store subscription.

## 2. The centerpiece (NexusObject)

Fully procedural — no imported assets:

| Layer | Construction | Material / shader |
| --- | --- | --- |
| Plasma Core | `IcosahedronGeometry(0.92, 4)` displaced in the vertex shader by simplex noise + FBM | Custom `ShaderMaterial`: fresnel rim, noise banding, accent emissive, click pulse |
| Glass Shell | `SphereGeometry(1.55, 96, 64)` | `MeshPhysicalMaterial`: transmission 0.92, IOR 1.45, clearcoat |
| Gyro Rings | 3 × `TorusGeometry` in counter-rotating holders | Shared metallic `MeshPhysicalMaterial` (Material Studio target) |
| Orbital Lattice | 900-point Fibonacci sphere + proximity edge struts (`LineSegments`) | `PointsMaterial` + low-opacity lines |
| Satellites | `InstancedMesh` (42 spheres) on per-instance Kepler-style orbits, matrices recomputed per frame | Same metallic material |
| Halo Field | 1,600 `Points` orbiting in the vertex shader (seed attributes) | Custom additive shader with twinkle |

Explorer "explode" moves each layer group along a fixed normalized axis scaled by a 0–1 parameter; visibility
toggles map directly to layer groups; raycast hits resolve `userData.layerId` for hover/click selection.

## 3. Rendering pipeline

- **Renderer:** WebGL2, `ACESFilmicToneMapping` (exposure 1.12), sRGB output, PCFSoft shadow maps (single 2048²
  key light, configurable per quality preset).
- **Environment:** `PMREMGenerator.fromScene(RoomEnvironment)` gives image-based lighting/reflections for all PBR
  materials without loading any HDR file.
- **Post:** `RenderPass → UnrealBloomPass (threshold 0.78, strength from settings) → OutputPass`. Toggling
  post-processing bypasses the composer entirely (direct `renderer.render`), which also applies tone mapping.
- **MSAA:** antialiasing is a context-creation flag, so toggling it rebuilds the renderer on a fresh canvas and
  re-creates GPU-side resources (composer, GPGPU targets, PMREM env) — materials/geometries recompile
  automatically on the new context.

## 4. Particles (GPU simulation)

- Positions live in a 256×256 RGBA float texture (65,536 max). Each frame a fullscreen fragment shader reads the
  previous texture, integrates a noise flow field + exponential mouse repulsion, respawns out-of-bounds particles
  on a random shell, and writes into a ping-pong target.
- **Trails:** three history targets are kept; three `Points` clouds render them with fading opacities
  (1.0 / 0.38 / 0.16), additive blending. All on-GPU, no CPU readback.
- Count changes use `geometry.setDrawRange` — no reallocation. Per-frame CPU work is zero (only uniform uploads).
- Fallback: without `EXT_color_buffer_float`, targets use `HalfFloatType` (nearest filtering, still exact enough
  for positions in this range).

## 5. Shader Lab

One `ShaderMaterial` on a sphere, fragment shader implements four patterns selected by an int uniform:

1. **Aurora** — domain-warped FBM bands (`warp()` = two rounds of FBM displacement).
2. **Voronoi** — animated F1/F2 cell-distance with edge highlighting.
3. **Ripple** — mouse-centered interference rings distorted by noise.
4. **Plasma** — classic multi-sine interference field.

Shared uniforms: `uTime` (speed-scaled), `uMouse`, `uResolution`, `uFrequency`, `uDistortion`, `uHue` (Rodrigues
hue rotation), `uIntensity`. All GLSL lives in `src/lib/shaders/glsl.ts`, written GLSL1-style; three.js transpiles
to ES 3.00 on WebGL2.

## 6. WebGPU experiment

`src/lib/webgpu.ts` checks `navigator.gpu`, requests adapter + device, and runs a real compute workload
(4,194,304-element wave computation) through a WGSL compute pipeline with a storage-buffer readback, verifying
the checksum against a CPU reference. It reports GPU wall-time vs CPU wall-time and a capability string in the
Monitor panel. If any step fails or is unsupported, the status says **unavailable** with the reason — the app
never pretends WebGPU is active. The WebGL2 GPGPU particle system is the always-on GPU compute path.

## 7. Browser/GPU engineering

- **Capability detection** (`capabilities.ts`): WebGL2 presence, unmasked renderer/vendor, max texture size,
  float precision, `EXT_color_buffer_float`, `navigator.gpu`.
- **Context loss/restore:** `webglcontextlost` is intercepted (preventDefault) with a visible badge; on
  `webglcontextrestored` all render targets, the composer, the PMREM environment and the particle field are
  rebuilt.
- **Lifecycle:** single `requestAnimationFrame` loop with clamped delta; `ResizeObserver` drives resize; clock delta
  freezes when the tab is hidden (rAF stops) and when paused; full disposal on unmount (geometries, materials,
  targets, controls, renderer, canvas).
- **Memory:** no per-frame allocations in the loop (vectors reused), typed arrays preallocated, instancing for
  satellites, frustum culling disabled only for the unbounded particle clouds.

## 8. Performance engineering

- Quality presets: `low/medium/high/ultra` → pixel-ratio caps 1.0/1.5/2.0/2.5 and shadow sizes 1024/1024/2048/2048.
- Adaptive governor: every ~2 s of samples, if EMA FPS < 47 the pixel ratio steps down (min 0.5×), if > 57 it
  steps back up — measured, not assumed.
- Performance mode pins a 0.6× pixel-ratio scale and disables the governor's upscale.
- Perf monitor samples `renderer.info` every 500 ms (draw calls, triangles, points, geometries, textures) plus
  measured FPS/frame time; unavailable data renders as "—".

## 9. Accessibility & responsive design

- All controls are native `<input type="range">`, `<input type="checkbox" role="switch">`, `<button>` with
  `aria-label`/`aria-pressed`; visible `:focus-visible` outlines; keyboard shortcuts documented in the UI.
- `prefers-reduced-motion` (media query + live listener) slows animation ×0.25 and disables auto-rotation.
- Panels are viewport-bounded with internal scrolling; nav scrolls horizontally on narrow screens; the canvas is
  touch-enabled (`touch-action: none`).
- Loading overlay with `role="status"`, fatal-error overlay, and an error boundary around the whole tree.

## 10. State flow

`store.ts` (zustand) is the single source of truth. `SceneManager` subscribes and applies slice changes
imperatively (view → camera goals/visibility, settings → quality/DPR/bloom/renderer rebuild, material/particles/
shader/explorer → object uniforms and visibility). The engine writes back only measured data (`setPerf`) and
WebGPU results (`setWebGPU`). No React state duplicates engine state.
