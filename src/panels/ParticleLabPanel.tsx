import { useEffect, useRef, useState } from 'react';
import { PanelShell, Slider } from '../ui/controls';
import { useNexus } from '../state/store';
import {
  WebGPUComputeDemo,
  type WebGpuStatus,
} from '../webgpu/computeDemo';

const COUNT_STEPS = [4000, 8000, 12000, 18000, 24000];

export function ParticleLabPanel() {
  const particles = useNexus((s) => s.particles);
  const set = useNexus((s) => s.setParticleParam);
  const gpuSupported = useNexus((s) => s.webgpuSupported);

  return (
    <PanelShell kicker="04 / Particle Lab" title="Halo simulation">
      <Slider
        label="Cohesion"
        value={particles.cohesion}
        min={0}
        max={3}
        step={0.05}
        onChange={(v) => set('cohesion', v)}
        hint="Spring constant pulling each particle to its home position on the shell."
      />
      <Slider
        label="Pointer attraction"
        value={particles.attraction}
        min={0}
        max={4}
        step={0.05}
        onChange={(v) => set('attraction', v)}
        hint="Inverse-square pull toward the pointer's intersection with the interaction sphere. Press to repel."
      />
      <Slider
        label="Turbulence"
        value={particles.turbulence}
        min={0}
        max={3}
        step={0.05}
        onChange={(v) => set('turbulence', v)}
        hint="Divergence-limited swirl field built from crossed sine waves."
      />
      <Slider
        label="Halo size"
        value={particles.size}
        min={1}
        max={6}
        step={0.1}
        onChange={(v) => set('size', v)}
        hint="Perspective-attenuated world size of the instanced halo sprites."
      />
      <Slider
        label="Trail opacity"
        value={particles.trailOpacity}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => set('trailOpacity', v)}
        hint="Alpha of the 3,000 velocity-stretched trail segments."
      />

      <div className="ctl">
        <div className="ctl-head">
          <span className="ctl-name">Particle count</span>
          <span className="ctl-value">{particles.count.toLocaleString()} live</span>
        </div>
        <div className="seg" role="group" aria-label="Active particle count">
          {COUNT_STEPS.map((n) => (
            <button key={n} aria-pressed={particles.count === n} onClick={() => set('count', n)}>
              {n / 1000}k
            </button>
          ))}
        </div>
        <p className="ctl-hint">
          The buffer is allocated once for 24,000 particles; counts are a prefix, so changing this
          never reallocates GPU memory.
        </p>
      </div>

      <WebGpuSection supported={gpuSupported} />
    </PanelShell>
  );
}

function WebGpuSection({ supported }: { supported: boolean | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const demoRef = useRef<WebGPUComputeDemo | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<WebGpuStatus | null>(null);
  const particles = useNexus((s) => s.particles);

  useEffect(() => {
    return () => {
      demoRef.current?.dispose();
      demoRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (running) {
      demoRef.current?.dispose();
      demoRef.current = null;
      setRunning(false);
      setStatus(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const demo = await WebGPUComputeDemo.create(
      canvas,
      () => ({
        turbulence: particles.turbulence,
        cohesion: particles.cohesion,
        attraction: particles.attraction,
      }),
      setStatus,
    );
    demoRef.current = demo;
    setRunning(demo.isRunning && supported === true);
  };

  const runningStatus = status?.kind === 'running' ? status : null;

  return (
    <div className="ctl" style={{ marginTop: 24 }}>
      <div className="ctl-head">
        <span className="ctl-name">WebGPU compute experiment</span>
        <span className="ctl-value">
          {supported === null ? 'probing' : supported ? 'available' : 'unavailable'}
        </span>
      </div>

      {supported !== true && (
        <blockquote className="panel-note">
          {supported === false
            ? 'WebGPU is not available in this browser. The CPU/WebGL simulation above remains fully functional — this absence is detected and reported, never faked.'
            : 'Detecting WebGPU capability…'}
        </blockquote>
      )}

      {supported === true && (
        <>
          <div className="gpu-box">
            <div className="gpu-canvas-wrap">
              <canvas ref={canvasRef} aria-label="WebGPU GPU-driven particle demonstration" />
            </div>
            <div className="gpu-meta">
              <span>65,536 particles · 1,024 workgroups</span>
              <span className={running ? 'ok' : undefined}>
                {running
                  ? `${(runningStatus?.fps ?? 0).toFixed(0)} fps · submit ${(runningStatus?.computeCpuSubmitMs ?? 0).toFixed(2)} ms`
                  : 'GPU compute idle'}
              </span>
            </div>
            {status && status.kind !== 'running' && (
              <div className="gpu-status">{status.message}</div>
            )}
          </div>
          <button className="chip" onClick={() => void toggle()} aria-pressed={running}>
            {running ? 'Stop GPU compute' : 'Start GPU compute'}
          </button>
          <p className="ctl-hint">
            All 65,536 particles of this demo are integrated in a WGSL compute pass — the CPU only
            records command buffers each frame. The CPU submission time shown is measured with
            performance.now(); true GPU timings would require the timestamp-query feature.
          </p>
        </>
      )}
    </div>
  );
}
