import { PanelShell, Slider } from '../ui/controls';
import { useNexus } from '../state/store';

const SWATCHES = ['#c8cfd6', '#b7986a', '#7d8ba0', '#5f6c63', '#c9d1ce', '#3f4046'];

export function MaterialStudioPanel() {
  const material = useNexus((s) => s.material);
  const set = useNexus((s) => s.setMaterialParam);

  return (
    <PanelShell kicker="05 / Material Studio" title="Orbital ring material">
      <div className="ctl">
        <div className="ctl-head">
          <span className="ctl-name">Base color</span>
          <span className="ctl-value" style={{ color: material.color }}>
            {material.color.toUpperCase()}
          </span>
        </div>
        <div className="color-row">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className="color-cell"
              style={{ background: c }}
              aria-pressed={material.color.toLowerCase() === c}
              aria-label={`Set base color ${c}`}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <input
            type="color"
            value={material.color}
            aria-label="Custom base color"
            onChange={(e) => set('color', e.target.value)}
          />
        </div>
      </div>

      <Slider
        label="Metalness"
        value={material.metalness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set('metalness', v)}
        hint="0 = dielectric, 1 = pure metal. Reflected color comes from the procedural environment map."
      />
      <Slider
        label="Roughness"
        value={material.roughness}
        min={0.02}
        max={1}
        step={0.01}
        onChange={(v) => set('roughness', v)}
        hint="Microsurface roughness — drives both the direct highlights and the env blur."
      />
      <Slider
        label="Transmission"
        value={material.transmission}
        min={0}
        max={1}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => set('transmission', v)}
        hint="Glass-like transmittance (MeshPhysicalMaterial). Costs a background render pass per pixel — heaviest at full screen."
      />
      <Slider
        label="Opacity"
        value={material.opacity}
        min={0.05}
        max={1}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => set('opacity', v)}
        hint="Transparent rendering activates automatically below 1."
      />
      <Slider
        label="Emissive intensity"
        value={material.emissiveIntensity}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => set('emissiveIntensity', v)}
        hint="Feeds the ring's own light into the bloom pass."
      />
      <Slider
        label="Light intensity"
        value={material.lightIntensity}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => set('lightIntensity', v)}
        hint="Global multiplier on key, fill, rim and ambient lights."
      />

      <blockquote className="panel-note">
        Values apply live to one shared MeshPhysicalMaterial across all three rings — visible
        material response is immediate; there is no preview mode or placeholder in this panel.
      </blockquote>
    </PanelShell>
  );
}
