import { create } from "zustand";
import type {
  NexusState,
  PerfStats,
  QualitySettings,
  ExplorerLayer,
} from "./types";

const DEFAULT_LAYERS: ExplorerLayer[] = [
  { id: "core", label: "Plasma Core", description: "Icosahedral core with fresnel + simplex-noise shader.", visible: true },
  { id: "shell", label: "Glass Shell", description: "Dielectric transmission sphere with procedural micro-detail.", visible: true },
  { id: "gyro", label: "Gyro Rings", description: "Three counter-rotating metallic torus rings.", visible: true },
  { id: "lattice", label: "Orbital Lattice", description: "Fibonacci point lattice with connecting struts.", visible: true },
  { id: "satellites", label: "Satellites", description: "Instanced bodies on Kepler-style orbital paths.", visible: true },
  { id: "halo", label: "Halo Field", description: "Additive particle halo orbiting the core.", visible: true },
];

const defaultSettings = (): QualitySettings => ({
  quality: "high",
  antialias: true,
  postProcessing: true,
  bloomStrength: 0.55,
  paused: false,
  reducedMotion:
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  performanceMode: false,
});

const defaultPerf = (): PerfStats => ({
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  particleCount: 0,
  pixelRatio: 1,
  renderer: "unavailable",
  glVersion: "unavailable",
  measured: false,
});

export const useNexus = create<NexusState>((set) => ({
  ready: false,
  error: null,
  contextLost: false,
  webglSupported: true,
  view: "universe",
  explorer: { explode: 0, layers: DEFAULT_LAYERS, selected: null },
  material: {
    color: "#c9d4e3",
    metalness: 0.9,
    roughness: 0.22,
    transmission: 0.0,
    opacity: 1.0,
    emissive: "#d7ff3f",
    emissiveIntensity: 0.35,
  },
  particles: {
    count: 24000,
    speed: 0.6,
    spread: 1.0,
    mouseForce: 1.0,
    size: 0.08,
    color: "#d7ff3f",
  },
  shader: {
    pattern: "aurora",
    frequency: 3.2,
    distortion: 0.65,
    speed: 0.5,
    hue: 0.32,
    intensity: 1.0,
  },
  settings: defaultSettings(),
  perf: defaultPerf(),
  webgpu: { checked: false, available: false, detail: "not checked", gpuComputeMs: null, cpuComputeMs: null, workload: 0 },
  hovered: null,

  setReady: () => set({ ready: true }),
  setError: (message) => set({ error: message, ready: true }),
  setContextLost: (v) => set({ contextLost: v }),
  setView: (view) => set({ view }),
  setHovered: (hovered) => set({ hovered }),
  setExplode: (t) => set((s) => ({ explorer: { ...s.explorer, explode: t } })),
  toggleLayer: (id) =>
    set((s) => ({
      explorer: {
        ...s.explorer,
        layers: s.explorer.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
      },
    })),
  selectLayer: (selected) => set((s) => ({ explorer: { ...s.explorer, selected } })),
  setMaterial: (patch) => set((s) => ({ material: { ...s.material, ...patch } })),
  setParticles: (patch) => set((s) => ({ particles: { ...s.particles, ...patch } })),
  setShader: (patch) => set((s) => ({ shader: { ...s.shader, ...patch } })),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setPerf: (patch) => set((s) => ({ perf: { ...s.perf, ...patch } })),
  setWebGPU: (patch) => set((s) => ({ webgpu: { ...s.webgpu, ...patch } })),
}));
