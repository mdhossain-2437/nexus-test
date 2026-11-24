import { SECTION_ORDER, useNexus, type SectionId } from '../state/store';

const LABELS: Record<SectionId, { idx: string; label: string }> = {
  universe: { idx: '01', label: 'Universe' },
  explorer: { idx: '02', label: 'Explorer' },
  shaderlab: { idx: '03', label: 'Shader Lab' },
  particlelab: { idx: '04', label: 'Particle Lab' },
  material: { idx: '05', label: 'Material' },
  monitor: { idx: '06', label: 'Monitor' },
  settings: { idx: '07', label: 'Settings' },
};

const TITLES: Record<SectionId, string> = {
  universe: 'Full-screen immersive experience — drag to orbit, scroll to zoom, click the object to identify a layer.',
  explorer: 'Inspect the layers of the Nexus Core. Click a part of the object in the scene to select it here.',
  shaderlab: 'Live controls for the core GLSL uniforms — every change is applied to the running shader.',
  particlelab: 'Real-time particle simulation with adjustable forces, plus the GPU-driven WebGPU experiment.',
  material: 'Physically based material parameters for the orbital ring assembly.',
  monitor: 'Measured, real-time rendering statistics. Nothing on this page is estimated.',
  settings: 'Rendering quality, motion and performance controls.',
};

export function NavRail() {
  const active = useNexus((s) => s.activeSection);
  const setActive = useNexus((s) => s.setActiveSection);

  return (
    <nav className="rail" aria-label="NEXUS sections">
      <div className="rail-mark">
        NEXUS
        <small>Digital Universe</small>
      </div>
      <div className="rail-nav">
        {SECTION_ORDER.map((id, i) => (
          <button
            key={id}
            className="rail-btn"
            aria-current={active === id}
            title={`${LABELS[id].label} — ${TITLES[id]} (key ${i + 1})`}
            onClick={() => setActive(id)}
          >
            <span className="idx">{LABELS[id].idx}</span>
            <span className="lbl">{LABELS[id].label}</span>
          </button>
        ))}
      </div>
      <div className="rail-foot">
        KEYS 1–7 / PANELS
        <br />
        SPACE / MOTION
        <br />
        ESC / CLOSE
      </div>
    </nav>
  );
}
