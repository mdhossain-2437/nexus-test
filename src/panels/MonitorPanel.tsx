import { PanelShell } from '../ui/controls';
import { usePerf } from '../state/perf';

function Cell({
  k,
  v,
  cls,
  src,
}: {
  k: string;
  v: string;
  cls?: string;
  src: 'measured' | 'gpu-reported' | 'unavailable';
}) {
  return (
    <div className="mcell">
      <div className="k">{k}</div>
      <div className={`v ${cls ?? ''}`}>{v}</div>
      <div className="src">
        {src === 'measured' ? 'measured' : src === 'gpu-reported' ? 'driver-reported' : 'unavailable'}
      </div>
    </div>
  );
}

export function MonitorPanel() {
  const stats = usePerf((s) => s.stats);

  const fpsClass = stats.fps >= 55 ? 'good' : stats.fps >= 30 ? '' : 'warn';

  return (
    <PanelShell kicker="06 / Performance Monitor" title="Measured render statistics">
      <div className="mgrid">
        <Cell k="FPS" v={stats.fps.toFixed(0)} cls={fpsClass} src="measured" />
        <Cell k="Frame (EMA)" v={`${stats.frameTimeMs.toFixed(1)} ms`} src="measured" />
        <Cell k="Draw calls" v={String(stats.drawCalls)} src="measured" />
        <Cell k="Triangles" v={stats.triangles.toLocaleString()} src="measured" />
        <Cell k="GL points / frame" v={stats.points.toLocaleString()} src="measured" />
        <Cell k="Live particles" v={stats.particleCount.toLocaleString()} src="measured" />
        <Cell k="Geometries" v={String(stats.geometries)} src="measured" />
        <Cell k="Textures" v={String(stats.textures)} src="measured" />
        <Cell k="Programs" v={String(stats.programs)} src="measured" />
        <Cell k="Pixel ratio" v={`${stats.pixelRatio.toFixed(2)}×`} src="measured" />
        <Cell k="Context" v={stats.webglVersion} src="measured" />
        <Cell k="Max tex size" v={String(stats.maxTextureSize ?? '—')} src="gpu-reported" />
        <Cell k="JS heap" v={stats.jsHeapMB !== null ? `${stats.jsHeapMB.toFixed(0)} MB` : '—'}
          src={stats.jsHeapMB !== null ? 'measured' : 'unavailable'} />
        <Cell k="Adaptive scale" v={`${(stats.adaptiveScale * 100).toFixed(0)}%`} src="measured" />
      </div>

      <div className="mcell" style={{ marginBottom: 20 }}>
        <div className="k">GPU renderer</div>
        <div className="v" style={{ fontSize: 11, lineHeight: 1.6 }}>
          {stats.gpuRenderer}
        </div>
        <div className="src">
          {stats.gpuRendererSource === 1
            ? 'driver-reported via WEBGL_debug_renderer_info'
            : 'browser does not expose the renderer string'}
        </div>
      </div>

      <blockquote className="panel-note">
        Every figure is sampled from the running renderer (renderer.info, performance timers,
        capability probes) at 4 Hz — em-dash values are surfaced as unavailable rather than
        approximated. Frame time is an exponential moving average used by the adaptive resolution
        controller; JS heap exists only on Chromium-derived browsers.
      </blockquote>
    </PanelShell>
  );
}
