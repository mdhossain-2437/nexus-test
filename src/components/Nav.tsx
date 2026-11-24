import { useNexus } from "../store";
import type { View } from "../types";

const ITEMS: { view: View; label: string; key: string }[] = [
  { view: "universe", label: "Universe", key: "1" },
  { view: "explorer", label: "Explorer", key: "2" },
  { view: "shaderlab", label: "Shader Lab", key: "3" },
  { view: "particlelab", label: "Particles", key: "4" },
  { view: "material", label: "Material", key: "5" },
  { view: "monitor", label: "Monitor", key: "6" },
  { view: "settings", label: "Settings", key: "7" },
];

export function Nav() {
  const view = useNexus((s) => s.view);
  const setView = useNexus((s) => s.setView);
  return (
    <nav aria-label="Sections" className="flex max-w-full overflow-x-auto scroll-thin">
      {ITEMS.map((item) => (
        <button
          key={item.view}
          className="btn"
          aria-pressed={view === item.view}
          onClick={() => setView(item.view)}
          title={`Shortcut: ${item.key}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
