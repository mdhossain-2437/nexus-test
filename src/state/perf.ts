import { create } from 'zustand';

/**
 * Measured runtime statistics, sampled by the engine (~4 Hz).
 * Every field here is read from the browser or renderer — never estimated.
 */
export interface PerfStats {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  /** renderer.capabilities — null when webgl2 flag unavailable. */
  webglVersion: string;
  maxTextureSize: number | null;
  maxVertexAttribs: number | null;
  /** JS heap MB, only on Chromium (performance.memory). */
  jsHeapMB: number | null;
  pixelRatio: number;
  /** 1 = GPU-provided string; 2 = heuristic guess from UNMASKED fallback; 3 = unavailable. */
  gpuRendererSource: 1 | 2 | 3;
  gpuRenderer: string;
  particleCount: number;
  adaptiveScale: number;
}

interface PerfState {
  stats: PerfStats;
  setStats: (s: PerfStats) => void;
}

const initialStats: PerfStats = {
  fps: 0,
  frameTimeMs: 0,
  drawCalls: 0,
  triangles: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  webglVersion: '—',
  maxTextureSize: null,
  maxVertexAttribs: null,
  jsHeapMB: null,
  pixelRatio: 1,
  gpuRendererSource: 3,
  gpuRenderer: 'unavailable',
  particleCount: 0,
  adaptiveScale: 1,
};

export const usePerf = create<PerfState>((set) => ({
  stats: initialStats,
  setStats: (stats) => set({ stats }),
}));
