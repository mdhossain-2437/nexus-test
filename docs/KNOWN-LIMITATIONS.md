# Known Limitations & Honest Boundaries

This project separates **measured facts** from **unverified claims**. Everything below is
stated precisely; nothing on this page is hidden behind optimistic wording.

## Rendering

- **Antialiasing toggle**: MSAA is applied by setting `.samples` on the composer's render
  targets, which is live and effective while post-processing is **on**. With post-processing
  off, the base context antialias flag is fixed at canvas creation (a WebGL constraint);
  the Settings panel states this directly rather than implying a hot-swap.
- **Transmission** in Material Studio is real `MeshPhysicalMaterial` transmission, which is
  the most expensive feature on the panel (it renders the transmission source each frame).
  On low-end GPUs expect a visible frame-time penalty at full screen.
- The monitor's `Max vertex attribs` field is reported as unavailable (`—`) because three's
  capability object does not expose it; no estimate is invented.

## Environments

- **SwiftShader / software rasterization**: during QA on Chromium's headless shell, point
  sprites with per-vertex gl_PointSize corrupted the post-processing pipeline (root cause
  analysis in `docs/ARCHITECTURE.md` §7). The halo was rewritten as instanced quads, which
  restored correctness; the QA suite now exercises the full bloom chain in that same
  hostile environment. Software rendering still yields ~10 FPS at 1440×860 — that is the
  rasterizer's ceiling, not the engine's (25 draw calls / ~175k triangles per frame).
- **WebGPU demo**: the compute path requires a WebGPU-capable browser (Chrome/Edge 113+,
  recent Firefox builds). The sandbox's headless shell exposes `navigator.gpu` but returns
  no adapter; the demo correctly reports this and the WebGL simulation carries the
  experience. As a result, **the WGSL compute path compiled and its absence path is
  verified, but the running demo itself was not exercisable in this environment** — the
  first WebGPU-capable browser will exercise it live.
- **Fonts** are loaded from Google Fonts; the design degrades gracefully to system
  fallbacks when offline (verified implicitly by the QA environment, which has no font CDN).

## Interaction

- Pointer attraction is computed against a sphere around the object (3D spatial interaction);
  on touch devices the halo responds to the drag point but has no hover semantics.
- The Explorer's `select` and `visibility` are intentionally separate controls: selecting
  never mutates the scene, visibility never mutates the inspector.
- The camera presets tween camera *and* target; an in-progress tween seizes orbit control
  until it completes (~1.4 s). Interrupting with drag is possible after it completes.

## Scope decisions

- Bloom (UnrealBloomPass) is the only artistic post effect; no SSAO/GOD-ray/DoF chain was
  bolted on — each additional pass costs fill rate, and ACES + carefully lit PBR + emissive
  bloom covers the look. AO is physically approximated by the shadow catcher and env
  lighting rather than a screen-space pass.
- `maxVertexAttribs` uses a wider perf-stat `gpuRendererSource` enum slot reserved for a
  heuristic guess that is intentionally **never produced** — if the driver string is not
  exposed, the monitor says exactly that.
- The `THREE.Clock` deprecation warning seen in three r187 was eliminated by switching to
  manual `performance.now()` timing — the QA suite treats console noise as a defect.
