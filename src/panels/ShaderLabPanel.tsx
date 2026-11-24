import { PanelShell, Slider } from '../ui/controls';
import { useNexus } from '../state/store';

/**
 * Live controls for the core ShaderMaterial. Each control maps 1:1 to a
 * uniform declared in src/shaders/core.ts — nothing is decorative.
 */
export function ShaderLabPanel() {
  const shader = useNexus((s) => s.shader);
  const set = useNexus((s) => s.setShaderParam);

  return (
    <PanelShell kicker="03 / Shader Lab" title="Core material program">
      <Slider
        label="Distortion"
        value={shader.distortion}
        min={0}
        max={0.9}
        step={0.01}
        onChange={(v) => set('distortion', v)}
        hint="Amplitude of the two-octave simplex displacement in the vertex shader."
      />
      <Slider
        label="Noise scale"
        value={shader.noiseScale}
        min={0.4}
        max={4}
        step={0.05}
        onChange={(v) => set('noiseScale', v)}
        hint="Frequency of the surface noise — higher values fragment the crest into filaments."
      />
      <Slider
        label="Fresnel power"
        value={shader.fresnelPower}
        min={0.5}
        max={6}
        step={0.1}
        onChange={(v) => set('fresnelPower', v)}
        hint="Exponent of (1 - |N·V|)^p — higher values tighten the rim into a thin halo."
      />
      <Slider
        label="Palette shift"
        value={shader.paletteShift}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set('paletteShift', v)}
        hint="Phase offset into the cosine palette used for procedural color transitions."
        format={(v) => v.toFixed(2)}
      />
      <Slider
        label="Pointer influence"
        value={shader.mouseInfluence}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => set('mouseInfluence', v)}
        hint="Strength of the surface bulge that tracks the projected pointer direction."
      />
      <Slider
        label="Time scale"
        value={shader.timeScale}
        min={0}
        max={3}
        step={0.05}
        onChange={(v) => set('timeScale', v)}
        hint="Global multiplier on the uTime uniform. Superseded only by reduced-motion mode."
      />

      <blockquote className="panel-note">
        The fragment program performs an IQ-style <em>double domain warp</em>: fbm output q warps the
        sampling domain of a second fbm r, and r together with |q| indexes a cosine palette. That
        is the deliberate mathematical centerpiece — no textures are involved in producing this
        surface. Set time scale to zero and drag distortion to freeze the field.
      </blockquote>
    </PanelShell>
  );
}
