# NEXUS — Architecture & Technical Decisions

## 1. High-level architecture

NEXUS is one persistent WebGL scene. There are no routes and no separate "pages": the seven
sections are overlay panels in front of a single canvas, which keeps the object alive and
continuous as the user moves between labs.

```
┌──────────────── React tree (UI only) ────────────────┐
│ NavRail · PanelHost (7 panels) · Veil · HUD · Notices│
└──────────────┬───────────────────────────────────────┘
               │ subscribe / get (Zustand)
┌──────────────▼──────────────── NEXUS render loop ────┐
│ NexusEngine ── pointer ──► raycaster ──► interactions │
│    ├── scene graph (nexusObject, particleField)      │
│    ├── EffectComposer (render → bloom → output)       │
│    ├── adaptive DPR controller (frame-time EMA)        │
│    └── stats sampler (4 Hz) ──► perf store             │
└───────────────────────────────────────────────────────┘
               ▲ independent module
┌──────────────┴────────────────────────────────────┐
│ WebGPUComputeDemo (own canvas, WGSL compute+render) │
└────────────────────────────────────────────────────┘
```

Two Zustand stores split concerns deliberately:

- `state/store.ts` — *intent* (settings, parameters, layer visibility). Written by React,
  read by both React and the engine.
- `state/perf.ts` — *measurement* (sampled 4 Hz by the engine). Written only by the engine,
  read only by the Monitor. Keeping it separate means telemetry updates re-render exactly
  one component, never the render loop.

## 2. Why an imperative engine instead of React Three Fiber

R3F is an excellent reconciler for declarative scene composition. NEXUS's needs are the
opposite profile:

- One scene, one object graph whose lifetime is the session — nothing mounts/unmounts
  with the UI tree.
- A bespoke render loop with adaptive resolution, counted-frame instrumentation,
  context-loss handling and visibility suspension — all imperative by nature.
- A tenuous boundary is worse than an explicit one: the engine reads intent from the store
  in a single `subscribe` handler and translates it into uniform/material/light updates.

The React tree therefore owns *pixels of the interface*, and the engine owns *the frame*.
No reconciler overhead, no hidden re-mounts, explicit `dispose()` for the entire resource graph.

## 3. State flow

`React (panels) → store → engine.subscribe → scene objects` and
`engine (stats sampler) → perf store → Monitor component`.

- Sliders in the Shader Lab write plain numbers into `shader` params; the engine maps each
  key to the matching core uniform (`uDistortion`, `uNoiseScale`, `uFresnelPower`,
  `uPaletteShift`, `uMouseInfluence`) — a 1:1 mapping, no intermediate layer to drift out
  of sync.
- Material Studio writes to the shared `MeshPhysicalMaterial` of the rings, including the
  transparent/needsUpdate transitions required by `transmission` and `opacity < 1`.
- Quality/post/shadow/motion flags are read inside the loop; a change of view preset arms a
  cubic-eased camera tween that hands control back to OrbitControls on completion.

## 4. The centrepiece

`scene/nexusObject.ts` constructs the object; there is no asset pipeline:

| Part | Construction |
|---|---|
| Core | `IcosahedronGeometry(1.35, 64)` — ~41k triangles, `ShaderMaterial` with a custom vertex/fragment pair (see below) |
| Rings | 3 × `TorusGeometry(r, tube, 24, 220)` at mutual inclinations, one shared `MeshPhysicalMaterial` |
| Lattice | `InstancedMesh(BoxGeometry, …, 1152)`; directions from a golden-angle Fibonacci sphere with deterministic `mulberry32` jitter, rods oriented radially via `lookAt`; two radii shells (3.05 / 3.75) |
| Shadow | `PlaneGeometry(30,30)` + `ShadowMaterial(0.32)` at y = −4.4 |

Determinism matters: the same `mulberry32` seeds reproduce the identical lattice and halo
home positions on every load, on every machine.

## 5. Shader Lab — what the GLSL actually does

All sources live in `src/shaders/`. The core program implements, in order:

1. **Procedural noise** — the Ashima/McEwan 3D simplex noise (public-domain reference
   implementation), included once and composed into both program stages.
2. **Vertex displacement** — two octaves travelling across the sphere plus a
   `pow(dot(n, mouseDir), 12)` bulge that follows the projected pointer and sharpens on
   hover; displaced positions feed a per-vertex energy term.
3. **Fresnel** — `pow(1 − |N·V|, uFresnelPower)` drives the rim.
4. **Domain distortion (the mathematical centerpiece)** — an Inigo Quilez double warp:
   `q = fbm(p + …)`, `r = fbm(p + 1.7·q)`; both `r` and `|q|` index a cosine palette
   (`a + b·cos(2π(c·t+d))`). Four fbm octaves of simplex noise per channel.
5. **Mouse interaction / time uniforms** — `uMouse` (object-space pointer ray direction),
   `uHover`, `uTime`, all live-editable.
6. **Procedural color transitions** — the palette phase is a uniform (`uPaletteShift`),
   so hues morph continuously without any texture.

The halo (`particles.ts`) is an instanced-billboard program (see §7) and the trails are a
head/tail fading two-vertex segment shader with a shared opacity uniform.

## 6. Particle simulation

`scene/particleField.ts` allocates once for the maximum capacity (24,000); "count" is a
prefix (`InstancedBufferGeometry.instanceCount`), so changing it never reallocates GPU
memory. Per frame, a single `step()` updates typed arrays in place:

```
v += (home − p) · cohesion · dt          // spring to a spherical home shell
v += (a − p) · k / (|a − p|² + 0.35) dt  // pointer attractor / repulsor
v += swirl(p, t, seed) · turbulence · dt // divergence-limited crossed sine field
v *= damping^dt; p += v · dt              // integrate, clamp hard shell radius
```

Trails are 3,000 velocity-stretched segments written on a stride so trail counts stay fixed
for any particle count. The attractor is the pointer ray's intersection with a sphere
around the object — falling back to the ray's closest point — so the halo reacts in 3D
space, not screen space. Pointer-down flips the attractor to repulsion.

## 7. Why the halo is instanced quads, not gl_Points

During QA (Chromium headless + ANGLE/SwiftShader) the entire post-processing chain rendered
as a uniform white frame. A systematic bisect across isolated harnesses — built exactly to
chase this — isolated the trigger: **point sprites with per-vertex `gl_PointSize` and
additive blending into an offscreen FBO corrupted the whole composer output in that
environment** (constant small sizes were fine; attenuated/clamped sizes up to 48px were not).

Engineering conclusions:

- `ALIASED_POINT_SIZE_RANGE` is implementation-defined; huge attenuated point sizes
  (hundreds of pixels near the camera) were never safe to emit unclamped.
- Point sprites are absent from WebGPU entirely, so they have no future-proof value.
- Instanced billboard quads have no size limits, keep the single-draw-call budget, allow
  perspective-attenuated sizes in world units, and run identically on every driver.

The halo is therefore one `InstancedBufferGeometry` — 4 shared corner vertices, per-instance
position/seed/scale attributes, billboarded in view space with the same twinkle and palette
as before. This is the **portable** answer, and the QA suite verifies the full bloom chain
end-to-end.

## 8. WebGPU experiment

`webgpu/computeDemo.ts` is fully modular: the app works if this module never initializes.
Its design mirrors the CPU sim (home shell spring, pointer inverse-square force,
swirl field, damping, containment) so the two labs are comparable:

- 65,536 particles — 1,024 workgroups × 64 threads — integrated in a WGSL compute pass.
- Positions live in one storage buffer bound twice: writable for compute, read-only for
  the render pass (separate bind groups with correct `visibility` masks).
- Rendering uses instanced quads (4-vertex triangle strip × instance count) with the
  pointer tracked on the demo canvas; GPU loss ends the demo gracefully and never affects
  the WebGL scene.
- The probe uses `navigator.gpu.requestAdapter()` and reports *why* if unavailable; the
  CPU-visible "submit time" is measured honestly and labelled as such — true GPU timing
  would require the `timestamp-query` feature.

## 9. Performance & lifecycle engineering

- **Adaptive resolution** — a 90/10 frame-time EMA; >22 ms sustained steps the scale down
  (min 60%), <14 ms steps it up (max 100%), with 2–4 s cooldowns between adjustments;
  superseded by fixed-ratio in performance mode. Quality caps DPR at 1/1.5/2.
- **Real instrumentation** — `renderer.info.autoReset = false` + one manual `reset()` per
  frame so draw calls and triangles count the shadow pass, the scene and the whole bloom
  chain. The monitor never prints a number it did not measure; anything unavailable is
  shown as `—` with its source annotated.
- **Disposal** — `NexusEngine.dispose()` walks every resource: geometries, materials,
  render targets (bloom + composer), the PMREM environment, the renderer, controls, and
  all event listeners. Original review: no per-frame allocations anywhere in the loop
  (shared `Vector3`/`Matrix4`/`Ray` scratch objects).
- **Context loss** — `webglcontextlost` is `preventDefault()`ed and the loop stops;
  restoration resumes it. The UI surfaces the state instead of pretending nothing happened.
- **Visibility & motion** — `visibilitychange` suspends the RAF loop; `prefers-reduced-motion`
  is honoured at boot and overridable in Settings; reduced-motion zeroes ambient motion while
  keeping full interactivity.

## 10. Design system

Graphite editorial dark: near-black `#08090a` field, hairline `8%`-white borders, one acid
accent (`#d8ff7a`) reserved for measured data and active states, IBM Plex Mono for data and
Space Grotesk for display. No glassmorphism panels, no gradient wash, no glow — light comes
from the 3D scene. Panels are 384px editorial columns that become bottom sheets under
720px; the nav rail collapses to 64px with the same seven targets.

## 11. QA methodology

`qa/smoke.mjs` is not decorative: it asserts zero console errors across a scripted session,
pixel-validates the *composited* screenshot (so a plausible-looking black frame fails),
exercises every panel via keyboard, flips real state through the switches, and checks the
monitor's measured cells are numeric. The most valuable test is the one that found the
gl_Points pipeline corruption: renderability is checked at the pixels, not at the API.
