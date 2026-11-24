export type View =
  | "universe"
  | "explorer"
  | "shaderlab"
  | "particlelab"
  | "material"
  | "monitor"
  | "settings";

export type Quality = "low" | "medium" | "high" | "ultra";

export interface MaterialParams {
  color: string;
  metalness: number;
  roughness: number;
  transmission: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
}

export interface ParticleParams {
  count: number;
  speed: number;
  spread: number;
  mouseForce: number;
  size: number;
  color: string;
}

export interface ShaderParams {
  pattern: ShaderPattern;
  frequency: number;
  distortion: number;
  speed: number;
  hue: number;
  intensity: number;
}

export type ShaderPattern = "aurora" | "voronoi" | "ripple" | "plasma";

export interface ExplorerLayer {
  id: string;
  label: string;
  description: string;
  visible: boolean;
}

export interface QualitySettings {
  quality: Quality;
  antialias: boolean;
  postProcessing: boolean;
  bloomStrength: number;
  paused: boolean;
  reducedMotion: boolean;
  performanceMode: boolean;
}

export interface PerfStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  points: number;
  geometries: number;
  textures: number;
  particleCount: number;
  pixelRatio: number;
  renderer: string;
  glVersion: string;
  measured: boolean;
}

export interface WebGPUStatus {
  checked: boolean;
  available: boolean;
  detail: string;
  gpuComputeMs: number | null;
  cpuComputeMs: number | null;
  workload: number;
}

export interface NexusState {
  ready: boolean;
  error: string | null;
  contextLost: boolean;
  webglSupported: boolean;
  view: View;
  explorer: {
    explode: number;
    layers: ExplorerLayer[];
    selected: string | null;
  };
  material: MaterialParams;
  particles: ParticleParams;
  shader: ShaderParams;
  settings: QualitySettings;
  perf: PerfStats;
  webgpu: WebGPUStatus;
  hovered: string | null;

  setReady: () => void;
  setError: (message: string) => void;
  setContextLost: (v: boolean) => void;
  setView: (view: View) => void;
  setHovered: (id: string | null) => void;
  setExplode: (t: number) => void;
  toggleLayer: (id: string) => void;
  selectLayer: (id: string | null) => void;
  setMaterial: (patch: Partial<MaterialParams>) => void;
  setParticles: (patch: Partial<ParticleParams>) => void;
  setShader: (patch: Partial<ShaderParams>) => void;
  setSettings: (patch: Partial<QualitySettings>) => void;
  setPerf: (patch: Partial<PerfStats>) => void;
  setWebGPU: (patch: Partial<WebGPUStatus>) => void;
}
