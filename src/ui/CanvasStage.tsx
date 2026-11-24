import { useEffect, useRef } from 'react';
import { NexusEngine } from '../engine/NexusEngine';
import { usePerf } from '../state/perf';
import { useNexus } from '../state/store';

/**
 * Owns the WebGL canvas and the engine instance. The engine is created once
 * and disposed on unmount — the full three.js resource graph (geometries,
 * materials, render targets, environment map) is freed explicitly.
 */
export function CanvasStage() {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<NexusEngine | null>(null);
  const setReady = useNexus((s) => s.setReady);
  const setUnsupported = useNexus((s) => s.setUnsupportedReason);
  const setStats = usePerf((s) => s.setStats);

  useEffect(() => {
    const holder = holderRef.current;
    const canvas = canvasRef.current;
    if (!holder || !canvas) return;

    const engine = NexusEngine.create(canvas, holder);
    engineRef.current = engine;

    if (!engine) {
      setUnsupported(useNexus.getState().unsupportedReason ?? 'WebGL 2 unavailable.');
      return;
    }

    engine.start();

    // First-frame confirmation: mark ready once the loop has actually ticked.
    let cancelled = false;
    requestAnimationFrame(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      void setStats; // stats store is global; it survives stage teardown
    };
  }, [setReady, setUnsupported, setStats]);

  return (
    <div className="stage" ref={holderRef} data-testid="stage">
      <canvas ref={canvasRef} aria-label="NEXUS 3D universe" role="img" />
    </div>
  );
}
