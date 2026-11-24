import { useEffect } from 'react';
import { CanvasStage } from './ui/CanvasStage';
import { NavRail } from './ui/NavRail';
import { ExplorerPanel } from './panels/ExplorerPanel';
import { ShaderLabPanel } from './panels/ShaderLabPanel';
import { MaterialStudioPanel } from './panels/MaterialStudioPanel';
import { MonitorPanel } from './panels/MonitorPanel';
import { ParticleLabPanel } from './panels/ParticleLabPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { SECTION_ORDER, useNexus } from './state/store';
import { usePerf } from './state/perf';
import { WebGPUComputeDemo } from './webgpu/computeDemo';

function Hints() {
  const animating = useNexus((s) => s.animating);
  const reducedMotion = useNexus((s) => s.reducedMotion);
  const fps = usePerf((s) => s.stats.fps);

  return (
    <div className="hud" aria-hidden="true">
      <b>NEXUS CORE — PROCEDURAL BUILD</b>
      <br />
      drag <span className="live">orbit</span> · scroll <span className="live">zoom</span> · press
      <span className="live"> repel halo</span> · click <span className="live">identify layer</span>
      <br />
      {reducedMotion ? (
        <span className="live">reduced motion active</span>
      ) : animating ? (
        'simulation live'
      ) : (
        'simulation paused — space resumes'
      )}
      {' · '}
      {fps.toFixed(0)} fps measured
    </div>
  );
}

function Veil() {
  const ready = useNexus((s) => s.ready);
  return (
    <div className={`veil ${ready ? 'hide' : ''}`} role="status" aria-live="polite">
      <div className="veil-title">NEXUS</div>
      <div className="veil-sub">Assembling procedural universe</div>
      <div className="veil-bar" />
    </div>
  );
}

function SystemNotice() {
  const contextLost = useNexus((s) => s.contextLost);
  const reason = useNexus((s) => s.unsupportedReason);
  if (contextLost) {
    return (
      <div className="notice" role="alert">
        <h2>WebGL context lost</h2>
        <p>
          The GPU driver dropped this context (common causes: device sleep, driver reset, tab
          pressure). The render loop is paused. If the browser restores the context, NEXUS resumes
          automatically; otherwise reload the page.
        </p>
      </div>
    );
  }
  if (reason) {
    return (
      <div className="notice" role="alert">
        <h2>WebGL 2 required</h2>
        <p>{reason}</p>
      </div>
    );
  }
  return null;
}

function PanelHost() {
  const section = useNexus((s) => s.activeSection);
  const open = section !== 'universe';
  return (
    <aside
      className={`panel-col ${open ? 'open' : ''}`}
      aria-hidden={!open}
      aria-label="Context panel"
    >
      {section === 'explorer' && <ExplorerPanel />}
      {section === 'shaderlab' && <ShaderLabPanel />}
      {section === 'particlelab' && <ParticleLabPanel />}
      {section === 'material' && <MaterialStudioPanel />}
      {section === 'monitor' && <MonitorPanel />}
      {section === 'settings' && <SettingsPanel />}
    </aside>
  );
}

export function App() {
  const setActiveSection = useNexus((s) => s.setActiveSection);
  const setActive = setActiveSection;
  const activeSection = useNexus((s) => s.activeSection);
  const toggleAnimating = useNexus((s) => s.toggleAnimating);

  // ---------- session bootstrap ----------
  useEffect(() => {
    const s = useNexus.getState();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      s.setReducedMotion(true);
    }

    // Coarse-pointer / small-viewport devices: start from a measured-friendly budget.
    const mobile =
      window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
    if (mobile) {
      s.setQuality('medium');
      s.setParticleParam('count', 6000);
      s.setShaderParam('distortion', 0.28);
    }

    // WebGPU capability probe — result always reported honestly.
    const sNow = useNexus.getState();
    sNow.setWebgpuStatus('probing');
    void WebGPUComputeDemo.probe().then((p) => {
      useNexus.getState().setWebgpuSupported(p.supported);
      useNexus.getState().setWebgpuStatus(p.message);
    });

    // ---------- keyboard controls ----------
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const isTextEntry =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (isTextEntry && e.key !== 'Escape') return;
      // Space on a focused control must activate that control, not pause motion.
      if (e.code === 'Space' && el instanceof HTMLButtonElement) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= SECTION_ORDER.length) {
        setActive(SECTION_ORDER[n - 1]);
        return;
      }
      if (e.key === 'Escape') {
        if (useNexus.getState().activeSection !== 'universe') setActive('universe');
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        toggleAnimating();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActive, toggleAnimating]);

  return (
    <div className="app">
      <NavRail />
      <CanvasStage />
      <Hints />
      <PanelHost />
      <Veil />
      <SystemNotice />
      <span hidden aria-live="polite">
        Active section: {activeSection}
      </span>
    </div>
  );
}
