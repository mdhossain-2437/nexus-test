import { useNexus } from "../store";
import type { ShaderPattern, View } from "../types";
import { ColorField, Note, Panel, Segmented, Slider, Stat, Toggle } from "./ui/controls";
import { MAX_PARTICLES_SUPPORTED } from "../lib/Particles";

export function UniversePanel() {
  const setView = useNexus((s) => s.setView);
  return (
    <Panel title="The Universe">
      <p className="text-[12px] leading-relaxed text-[var(--color-text-dim)]">
        NEXUS is a procedurally generated stellar engine — six engineered layers orbiting a plasma core, rendered in
        real time with physically based materials.
      </p>
      <Note>
        Drag to orbit · scroll to zoom · click any layer to select it. Keys 1–7 switch sections, space pauses
        simulation, R recenters the camera.
      </Note>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="btn border border-[var(--color-line)]" onClick={() => setView("explorer")}>
          Explore object →
        </button>
        <button className="btn border border-[var(--color-line)]" onClick={() => setView("particlelab")}>
          Particle lab →
        </button>
      </div>
    </Panel>
  );
}

export function ExplorerPanel() {
  const explorer = useNexus((s) => s.explorer);
  const setExplode = useNexus((s) => s.setExplode);
  const toggleLayer = useNexus((s) => s.toggleLayer);
  const selectLayer = useNexus((s) => s.selectLayer);

  return (
    <Panel title="Object Explorer">
      <Slider label="Explode" value={explorer.explode} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={setExplode} />
      <div className="mt-1 border-t border-[var(--color-line-soft)] pt-1">
        {explorer.layers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-start gap-2.5 border-b border-[var(--color-line-soft)] py-2 ${
              explorer.selected === layer.id ? "bg-[var(--color-line-soft)]" : ""
            }`}
          >
            <input
              type="checkbox"
              className="switch mt-0.5"
              aria-label={`Toggle ${layer.label}`}
              checked={layer.visible}
              onChange={() => toggleLayer(layer.id)}
            />
            <button
              className="flex-1 text-left"
              onClick={() => selectLayer(explorer.selected === layer.id ? null : layer.id)}
              aria-pressed={explorer.selected === layer.id}
            >
              <span className={`block text-[12px] ${layer.visible ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)] line-through"}`}>
                {layer.label}
              </span>
              <span className="block text-[10px] leading-snug text-[var(--color-text-faint)]">{layer.description}</span>
            </button>
          </div>
        ))}
      </div>
      <Note>Click a layer in the viewport to select it here. Explode separates the layers along engineered axes.</Note>
    </Panel>
  );
}

const PATTERNS: { value: ShaderPattern; label: string }[] = [
  { value: "aurora", label: "Aurora" },
  { value: "voronoi", label: "Voronoi" },
  { value: "ripple", label: "Ripple" },
  { value: "plasma", label: "Plasma" },
];

export function ShaderLabPanel() {
  const shader = useNexus((s) => s.shader);
  const setShader = useNexus((s) => s.setShader);
  return (
    <Panel title="Shader Lab">
      <Segmented label="Pattern" options={PATTERNS} value={shader.pattern} onChange={(pattern) => setShader({ pattern })} />
      <Slider label="Frequency" value={shader.frequency} min={0.5} max={9} onChange={(frequency) => setShader({ frequency })} />
      <Slider label="Distortion" value={shader.distortion} min={0} max={2} onChange={(distortion) => setShader({ distortion })} />
      <Slider label="Speed" value={shader.speed} min={0} max={2} onChange={(speed) => setShader({ speed })} />
      <Slider label="Hue" value={shader.hue} min={0} max={1} onChange={(hue) => setShader({ hue })} />
      <Slider label="Intensity" value={shader.intensity} min={0.1} max={2.5} onChange={(intensity) => setShader({ intensity })} />
      <Note>
        Custom fragment shader: domain-warped simplex FBM, Voronoi cell distance, mouse-centered interference, and a
        sin-plasma — all with live uniforms and pointer interaction.
      </Note>
    </Panel>
  );
}

export function ParticleLabPanel() {
  const particles = useNexus((s) => s.particles);
  const setParticles = useNexus((s) => s.setParticles);
  return (
    <Panel title="Particle Lab">
      <Slider
        label="Count"
        value={particles.count}
        min={1000}
        max={MAX_PARTICLES_SUPPORTED}
        step={1000}
        format={(v) => v.toLocaleString("en-US")}
        onChange={(count) => setParticles({ count })}
      />
      <Slider label="Flow speed" value={particles.speed} min={0} max={2} onChange={(speed) => setParticles({ speed })} />
      <Slider label="Spread" value={particles.spread} min={0.2} max={2} onChange={(spread) => setParticles({ spread })} />
      <Slider label="Mouse repulsion" value={particles.mouseForce} min={0} max={3} onChange={(mouseForce) => setParticles({ mouseForce })} />
      <Slider label="Point size" value={particles.size} min={0.02} max={0.25} step={0.005} format={(v) => v.toFixed(3)} onChange={(size) => setParticles({ size })} />
      <ColorField label="Color" value={particles.color} onChange={(color) => setParticles({ color })} />
      <Note>
        GPU-only simulation: positions live in float render targets and are advanced by a fragment shader each frame
        (ping-pong). Three history buffers render fading trails. Move the pointer through the field to repel particles.
      </Note>
    </Panel>
  );
}

export function MaterialPanel() {
  const material = useNexus((s) => s.material);
  const setMaterial = useNexus((s) => s.setMaterial);
  return (
    <Panel title="Material Studio">
      <ColorField label="Base color" value={material.color} onChange={(color) => setMaterial({ color })} />
      <Slider label="Metalness" value={material.metalness} min={0} max={1} onChange={(metalness) => setMaterial({ metalness })} />
      <Slider label="Roughness" value={material.roughness} min={0} max={1} onChange={(roughness) => setMaterial({ roughness })} />
      <Slider label="Transmission" value={material.transmission} min={0} max={1} onChange={(transmission) => setMaterial({ transmission })} />
      <Slider label="Opacity" value={material.opacity} min={0.05} max={1} onChange={(opacity) => setMaterial({ opacity })} />
      <ColorField label="Emissive" value={material.emissive} onChange={(emissive) => setMaterial({ emissive })} />
      <Slider
        label="Emissive intensity"
        value={material.emissiveIntensity}
        min={0}
        max={3}
        onChange={(emissiveIntensity) => setMaterial({ emissiveIntensity })}
      />
      <Note>Applies live to the metallic gyro/satellite PBR material, the glass shell, and the shader-driven core.</Note>
    </Panel>
  );
}

export function MonitorPanel() {
  const perf = useNexus((s) => s.perf);
  const webgpu = useNexus((s) => s.webgpu);
  const quality = useNexus((s) => s.settings.quality);
  return (
    <Panel title="Performance Monitor">
      <Stat label="FPS (measured)" value={perf.measured ? perf.fps.toFixed(1) : "—"} accent />
      <Stat label="Frame time" value={perf.measured ? `${perf.frameMs.toFixed(2)} ms` : "—"} />
      <Stat label="Draw calls" value={String(perf.drawCalls)} />
      <Stat label="Triangles" value={perf.triangles.toLocaleString("en-US")} />
      <Stat label="Points" value={perf.points.toLocaleString("en-US")} />
      <Stat label="Particles (sim)" value={perf.particleCount.toLocaleString("en-US")} />
      <Stat label="Geometries / textures" value={`${perf.geometries} / ${perf.textures}`} />
      <Stat label="Pixel ratio" value={String(perf.pixelRatio)} />
      <Stat label="Active quality" value={quality} />
      <div className="mt-2 border-t border-[var(--color-line-soft)] pt-2">
        <span className="label">GPU / browser</span>
        <div className="mt-1 space-y-1">
          <Stat label="Renderer" value={perf.renderer} />
          <Stat label="Context" value={perf.glVersion} />
          <Stat
            label="WebGPU"
            value={webgpu.checked ? (webgpu.available ? "available" : "unavailable") : "checking…"}
            accent={webgpu.available}
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-text-faint)]">{webgpu.detail}</p>
        {webgpu.workload > 0 && (
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-text-faint)]">
            Compute benchmark ({webgpu.workload.toLocaleString("en-US")} elements):{" "}
            {webgpu.gpuComputeMs !== null ? `GPU ${webgpu.gpuComputeMs} ms` : "GPU n/a"} ·{" "}
            {webgpu.cpuComputeMs !== null ? `CPU ${webgpu.cpuComputeMs} ms` : "CPU n/a"}
          </p>
        )}
      </div>
      <Note>All counters are measured from the live renderer each 500 ms. Unavailable values are shown as “—”, never estimated.</Note>
    </Panel>
  );
}

const QUALITY_OPTIONS: { value: "low" | "medium" | "high" | "ultra"; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
];

export function SettingsPanel() {
  const settings = useNexus((s) => s.settings);
  const setSettings = useNexus((s) => s.setSettings);
  return (
    <Panel title="Settings">
      <Segmented label="Quality" options={QUALITY_OPTIONS} value={settings.quality} onChange={(quality) => setSettings({ quality })} />
      <Toggle label="Antialiasing (MSAA)" checked={settings.antialias} onChange={(antialias) => setSettings({ antialias })} />
      <Toggle label="Post-processing / bloom" checked={settings.postProcessing} onChange={(postProcessing) => setSettings({ postProcessing })} />
      <Slider
        label="Bloom strength"
        value={settings.bloomStrength}
        min={0}
        max={1.5}
        onChange={(bloomStrength) => setSettings({ bloomStrength })}
      />
      <Toggle label="Pause simulation" checked={settings.paused} onChange={(paused) => setSettings({ paused })} />
      <Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(reducedMotion) => setSettings({ reducedMotion })} />
      <Toggle label="Performance mode" checked={settings.performanceMode} onChange={(performanceMode) => setSettings({ performanceMode })} />
      <Note>
        Quality drives pixel-ratio cap and shadow resolution; an adaptive governor lowers pixel ratio automatically if
        FPS drops below ~47. Reduced motion slows all animation and disables auto-rotation.
      </Note>
    </Panel>
  );
}

export function panelFor(view: View) {
  switch (view) {
    case "universe":
      return <UniversePanel />;
    case "explorer":
      return <ExplorerPanel />;
    case "shaderlab":
      return <ShaderLabPanel />;
    case "particlelab":
      return <ParticleLabPanel />;
    case "material":
      return <MaterialPanel />;
    case "monitor":
      return <MonitorPanel />;
    case "settings":
      return <SettingsPanel />;
  }
}
