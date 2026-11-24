import { useEffect, useRef } from "react";
import { SceneManager } from "./lib/SceneManager";
import { detectWebGL } from "./lib/capabilities";
import { runWebGPUExperiment } from "./lib/webgpu";
import { useNexus } from "./store";
import type { View } from "./types";
import { Nav } from "./components/Nav";
import { panelFor } from "./components/panels";

const KEY_VIEW: Record<string, View> = {
  "1": "universe",
  "2": "explorer",
  "3": "shaderlab",
  "4": "particlelab",
  "5": "material",
  "6": "monitor",
  "7": "settings",
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const ready = useNexus((s) => s.ready);
  const error = useNexus((s) => s.error);
  const contextLost = useNexus((s) => s.contextLost);
  const view = useNexus((s) => s.view);
  const setView = useNexus((s) => s.setView);
  const perf = useNexus((s) => s.perf);
  const paused = useNexus((s) => s.settings.paused);
  const setSettings = useNexus((s) => s.setSettings);

  useEffect(() => {
    if (!containerRef.current || managerRef.current) return;
    const gl = detectWebGL();
    if (!gl.webgl2) {
      useNexus.getState().setError(
        "WebGL2 is not available in this browser, so the real-time 3D pipeline cannot start. NEXUS requires WebGL2 (Chrome/Edge 80+, Firefox 78+, Safari 15+)."
      );
      return;
    }
    try {
      const manager = new SceneManager(containerRef.current);
      managerRef.current = manager;
      useNexus.getState().setReady();
      void runWebGPUExperiment().then((result) => useNexus.getState().setWebGPU({ ...result, checked: true }));
    } catch (err) {
      useNexus.getState().setError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const v = KEY_VIEW[e.key];
      if (v) {
        setView(v);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setSettings({ paused: !useNexus.getState().settings.paused });
      } else if (e.key === "r" || e.key === "R") {
        managerRef.current?.recenter();
      } else if (e.key === "Escape") {
        useNexus.getState().selectLayer(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, setSettings]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setSettings({ reducedMotion: mq.matches });
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setSettings]);

  return (
    <div className="fixed inset-0 select-none">
      <div ref={containerRef} className="absolute inset-0" />

      <header className="pointer-events-none absolute left-4 top-4 z-10 md:left-6 md:top-5">
        <h1 className="text-[15px] font-semibold tracking-[0.42em] text-[var(--color-text)]">NEXUS</h1>
        <p className="label mt-1">Interactive 3D universe · v1.0</p>
      </header>

      <div className="absolute right-4 top-4 z-10 md:right-6 md:top-5">
        <div className="panel px-1 py-0.5">
          <Nav />
        </div>
      </div>

      <aside className="absolute right-4 top-[52px] z-10 md:right-6 md:top-[60px]">{panelFor(view)}</aside>

      <div className="hint absolute bottom-4 left-4 z-10 hidden md:bottom-5 md:left-6 md:block">
        drag orbit · scroll zoom · click layer · 1–7 sections · space pause · r recenter
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex gap-4 md:bottom-5 md:right-6" aria-live="off">
        <span className="hint">{paused ? "paused" : perf.measured ? `${perf.fps.toFixed(0)} fps` : "…"}</span>
        <span className="hint">{perf.measured ? `${perf.frameMs.toFixed(1)} ms` : ""}</span>
        <span className="hint">{perf.measured ? `${perf.drawCalls} calls · ${(perf.triangles / 1000).toFixed(0)}k tris` : ""}</span>
      </div>

      {contextLost && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 border border-[var(--color-accent-dim)] bg-[var(--color-coal)] px-4 py-2">
          <span className="label text-[var(--color-accent)]!">GPU context lost — restoring…</span>
        </div>
      )}

      {!ready && !error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[var(--color-ink)]">
          <h1 className="text-[15px] font-semibold tracking-[0.42em]">NEXUS</h1>
          <div className="loader-bar" aria-hidden="true">
            <div />
          </div>
          <span className="label" role="status">
            Initializing renderer…
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[var(--color-ink)] p-6 text-center">
          <span className="label text-[var(--color-accent)]!">Unable to start</span>
          <p className="max-w-md text-[13px] leading-relaxed text-[var(--color-text-dim)]">{error}</p>
        </div>
      )}
    </div>
  );
}
