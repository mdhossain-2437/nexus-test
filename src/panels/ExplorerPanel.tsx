import { PanelShell } from '../ui/controls';
import { useNexus, type LayerState, type ViewPreset } from '../state/store';

const LAYER_INFO: Record<keyof LayerState, { name: string; build: string; note: string }> = {
  core: {
    name: 'Core',
    build: 'IcosahedronGeometry(1.35, 64) — a subdivided icosphere, ~41k triangles, fully shader-displaced',
    note: 'Two octaves of 3D simplex noise plus a pointer-following bulge, shaded by domain-warped fbm.',
  },
  rings: {
    name: 'Orbital rings',
    build: 'Three torus meshes (24 × 220 segments) at mutually inclined angles',
    note: 'One shared MeshPhysicalMaterial — this is the surface Material Studio controls.',
  },
  lattice: {
    name: 'Micro-lattice',
    build: '1,152 instanced rods on a two-shell Fibonacci sphere — a single draw call',
    note: 'Each rod is oriented radially, giving the shell a crystalline, caged read at grazing angles.',
  },
  halo: {
    name: 'Particle halo',
    build: 'Up to 24,000 simulated points + 3,000 velocity-stretched trail segments',
    note: 'Springs, swirl and pointer forces integrated on the CPU with zero per-frame allocations.',
  },
};

const PRESETS: Array<{ value: ViewPreset; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'core', label: 'Core' },
  { value: 'rings', label: 'Rings' },
  { value: 'horizon', label: 'Horizon' },
];

export function ExplorerPanel() {
  const layers = useNexus((s) => s.layers);
  const toggleLayer = useNexus((s) => s.toggleLayer);
  const selected = useNexus((s) => s.selectedLayer);
  const selectLayer = useNexus((s) => s.selectLayer);
  const viewPreset = useNexus((s) => s.viewPreset);
  const setViewPreset = useNexus((s) => s.setViewPreset);

  const selectedInfo = selected ? LAYER_INFO[selected] : null;

  return (
    <PanelShell kicker="02 / Object Explorer" title="Anatomy of the Nexus Core">
      {(Object.keys(LAYER_INFO) as Array<keyof LayerState>).map((key) => (
        <div className="ctl" key={key}>
          <div className="tgl-row">
            <button
              className="chip"
              aria-pressed={selected === key}
              onClick={() => selectLayer(key)}
              title="Select this layer to inspect its construction"
            >
              {LAYER_INFO[key].name}
            </button>
            <button
              className="tgl"
              role="switch"
              aria-checked={layers[key]}
              aria-label={`Show ${LAYER_INFO[key].name}`}
              onClick={() => toggleLayer(key)}
            />
          </div>
          {selectedInfo && selected === key && (
            <p className="ctl-hint">
              {selectedInfo.build}
              <br />
              {selectedInfo.note}
            </p>
          )}
        </div>
      ))}

      <div className="ctl">
        <div className="ctl-head">
          <span className="ctl-name">Camera presets</span>
        </div>
        <div className="seg" role="group" aria-label="Camera view presets">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              aria-pressed={viewPreset === p.value}
              onClick={() => setViewPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="ctl-hint">
          Presets ease the camera over ~1.4 s (cubic ease-out). Orbit control returns as soon as the
          move completes. Changes to the preset tween the camera target as well as its position.
        </p>
      </div>

      <blockquote className="panel-note">
        Click any layer directly in the scene to identify it — the hit test raycasts against the
        core, the rings and the instanced lattice (three.js instanced raycast included). Selecting
        here only changes the inspector, never the simulation.
      </blockquote>
    </PanelShell>
  );
}
