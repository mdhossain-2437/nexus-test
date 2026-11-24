import { create } from 'zustand';

export type SectionId =
  | 'universe'
  | 'explorer'
  | 'shaderlab'
  | 'particlelab'
  | 'material'
  | 'monitor'
  | 'settings';

export type Quality = 'low' | 'medium' | 'high';

export interface ShaderParams {
  /** Time multiplier for all animated uniform phases. */
  timeScale: number;
  /** Amplitude of the noise-driven vertex displacement on the core. */
  distortion: number;
  /** Fresnel exponent — higher = tighter rim. */
  fresnelPower: number;
  /** Hue offset into the cosine palette. */
  paletteShift: number;
  /** How strongly the pointer pushes the surface locally. */
  mouseInfluence: number;
  /** Frequency scale of the domain-warped fbm. */
  noiseScale: number;
}

export interface ParticleParams {
  count: number;
  /** Strength of the spring pulling particles to their home shell. */
  cohesion: number;
  /** Strength of pointer attraction (negative = repulsion on press). */
  attraction: number;
  /** Pseudo-curl turbulence strength. */
  turbulence: number;
  /** World-space size multiplier of the instanced halo sprites. */
  size: number;
  /** Trail segment opacity. */
  trailOpacity: number;
}

export interface MaterialParams {
  color: string;
  metalness: number;
  roughness: number;
  transmission: number;
  opacity: number;
  emissiveIntensity: number;
  lightIntensity: number;
}

export interface LayerState {
  core: boolean;
  rings: boolean;
  lattice: boolean;
  halo: boolean;
}

export type ViewPreset = 'overview' | 'core' | 'rings' | 'horizon';

interface NexusState {
  activeSection: SectionId;
  setActiveSection: (s: SectionId) => void;

  ready: boolean;
  setReady: (v: boolean) => void;

  contextLost: boolean;
  setContextLost: (v: boolean) => void;

  unsupportedReason: string | null;
  setUnsupportedReason: (v: string | null) => void;

  // ---- rendering settings ----
  quality: Quality;
  setQuality: (q: Quality) => void;
  postFX: boolean;
  setPostFX: (v: boolean) => void;
  shadows: boolean;
  setShadows: (v: boolean) => void;
  antialias: boolean;
  setAntialias: (v: boolean) => void;
  animating: boolean;
  toggleAnimating: () => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  performanceMode: boolean;
  setPerformanceMode: (v: boolean) => void;

  // ---- labs ----
  shader: ShaderParams;
  setShaderParam: <K extends keyof ShaderParams>(k: K, v: ShaderParams[K]) => void;
  particles: ParticleParams;
  setParticleParam: <K extends keyof ParticleParams>(k: K, v: ParticleParams[K]) => void;
  material: MaterialParams;
  setMaterialParam: <K extends keyof MaterialParams>(k: K, v: MaterialParams[K]) => void;

  // ---- explorer ----
  layers: LayerState;
  toggleLayer: (k: keyof LayerState) => void;
  selectedLayer: keyof LayerState | null;
  selectLayer: (k: keyof LayerState | null) => void;
  viewPreset: ViewPreset;
  setViewPreset: (v: ViewPreset) => void;

  // ---- gpu ----
  webgpuSupported: boolean | null;
  setWebgpuSupported: (v: boolean | null) => void;
  webgpuStatus: string;
  setWebgpuStatus: (v: string) => void;
}

export const useNexus = create<NexusState>((set) => ({
  activeSection: 'universe',
  setActiveSection: (s) => set({ activeSection: s }),

  ready: false,
  setReady: (v) => set({ ready: v }),

  contextLost: false,
  setContextLost: (v) => set({ contextLost: v }),

  unsupportedReason: null,
  setUnsupportedReason: (v) => set({ unsupportedReason: v }),

  quality: 'high',
  setQuality: (q) => set({ quality: q }),
  postFX: true,
  setPostFX: (v) => set({ postFX: v }),
  shadows: true,
  setShadows: (v) => set({ shadows: v }),
  antialias: true,
  setAntialias: (v) => set({ antialias: v }),
  animating: true,
  toggleAnimating: () => set((s) => ({ animating: !s.animating })),
  reducedMotion: false,
  setReducedMotion: (v) => set({ reducedMotion: v }),
  performanceMode: false,
  setPerformanceMode: (v) => set({ performanceMode: v }),

  shader: {
    timeScale: 1,
    distortion: 0.32,
    fresnelPower: 2.6,
    paletteShift: 0.12,
    mouseInfluence: 0.65,
    noiseScale: 1.4,
  },
  setShaderParam: (k, v) => set((s) => ({ shader: { ...s.shader, [k]: v } })),

  particles: {
    count: 12000,
    cohesion: 0.9,
    attraction: 1.1,
    turbulence: 0.55,
    size: 3.1,
    trailOpacity: 0.45,
  },
  setParticleParam: (k, v) => set((s) => ({ particles: { ...s.particles, [k]: v } })),

  material: {
    color: '#c8cfd6',
    metalness: 0.95,
    roughness: 0.28,
    transmission: 0.0,
    opacity: 1,
    emissiveIntensity: 0.35,
    lightIntensity: 1,
  },
  setMaterialParam: (k, v) => set((s) => ({ material: { ...s.material, [k]: v } })),

  layers: { core: true, rings: true, lattice: true, halo: true },
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  selectedLayer: null,
  selectLayer: (k) => set({ selectedLayer: k }),
  viewPreset: 'overview',
  setViewPreset: (v) => set({ viewPreset: v }),

  webgpuSupported: null,
  setWebgpuSupported: (v) => set({ webgpuSupported: v }),
  webgpuStatus: 'probing',
  setWebgpuStatus: (v) => set({ webgpuStatus: v }),
}));

export const SECTION_ORDER: SectionId[] = [
  'universe',
  'explorer',
  'shaderlab',
  'particlelab',
  'material',
  'monitor',
  'settings',
];
