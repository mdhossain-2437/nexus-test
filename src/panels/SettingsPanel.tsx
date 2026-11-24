import { PanelShell, Segmented, Toggle } from '../ui/controls';
import { useNexus, type Quality } from '../state/store';

export function SettingsPanel() {
  const quality = useNexus((s) => s.quality);
  const setQuality = useNexus((s) => s.setQuality);
  const postFX = useNexus((s) => s.postFX);
  const setPostFX = useNexus((s) => s.setPostFX);
  const shadows = useNexus((s) => s.shadows);
  const setShadows = useNexus((s) => s.setShadows);
  const antialias = useNexus((s) => s.antialias);
  const setAntialias = useNexus((s) => s.setAntialias);
  const animating = useNexus((s) => s.animating);
  const toggleAnimating = useNexus((s) => s.toggleAnimating);
  const reducedMotion = useNexus((s) => s.reducedMotion);
  const setReducedMotion = useNexus((s) => s.setReducedMotion);
  const performanceMode = useNexus((s) => s.performanceMode);
  const setPerformanceMode = useNexus((s) => s.setPerformanceMode);

  return (
    <PanelShell kicker="07 / Settings" title="Rendering & motion">
      <div className="ctl">
        <div className="ctl-head">
          <span className="ctl-name">Rendering quality</span>
          <span className="ctl-value">
            {quality === 'high' ? 'DPR ≤ 2' : quality === 'medium' ? 'DPR ≤ 1.5' : 'DPR ≤ 1'}
          </span>
        </div>
        <Segmented<Quality>
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
          value={quality}
          onChange={setQuality}
          ariaLabel="Rendering quality"
        />
        <p className="ctl-hint">
          Caps the device pixel ratio and retunes the bloom pass. Below the cap, an adaptive
          controller scales resolution between 60–100 % based on a frame-time EMA.
        </p>
      </div>

      <Toggle label="Post-processing" checked={postFX} onChange={setPostFX}
        hint="Bloom (UnrealBloomPass) + output color transform. Off = direct forward render." />
      <Toggle label="Shadow mapping" checked={shadows} onChange={setShadows}
        hint="PCF shadows from the key light onto the catcher plane below the object." />
      <Toggle label="Antialiasing" checked={antialias} onChange={setAntialias}
        hint="MSAA on the composer target when post-processing is on; the base context flag applies on next load if post is off. Honest limitation of the WebGL pipeline." />
      <Toggle label="Animation" checked={animating} onChange={toggleAnimating}
        hint="Space also toggles this. Freezes shader time, choreography and the particle integrator; the camera stays interactive." />
      <Toggle label="Reduced motion" checked={reducedMotion} onChange={setReducedMotion}
        hint="Honours prefers-reduced-motion when the session starts. Zeroes ambient motion while keeping full interactivity." />
      <Toggle label="Performance mode" checked={performanceMode} onChange={setPerformanceMode}
        hint="Fixes DPR at 1, disables adaptive scaling and lens choreography — for benchmarking and low-power machines." />

      <blockquote className="panel-note">
        Quality changes are applied live: the resolution reshapes immediately, bloom parameters
        retune and lights rebuild in place. No setting requires a reload.
      </blockquote>
    </PanelShell>
  );
}
