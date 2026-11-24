import type { ReactNode } from "react";

export function Panel({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <section className="panel w-[300px] max-w-[calc(100vw-2rem)] max-h-[70vh] flex flex-col" aria-label={title}>
      <div className="panel-head">
        <span className="label text-[var(--color-text-dim)]!">{title}</span>
        {onClose && (
          <button className="btn px-2 py-1!" onClick={onClose} aria-label={`Close ${title} panel`}>
            ✕
          </button>
        )}
      </div>
      <div className="scroll-thin overflow-y-auto px-3.5 py-2.5">{children}</div>
    </section>
  );
}

export function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="label">{label}</span>
        {value !== undefined && <span className="stat-value">{value}</span>}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label} value={format ? format(value) : value.toFixed(2)}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Row>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="label text-[var(--color-text-dim)]!">{label}</span>
      <input
        type="checkbox"
        className="switch"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="label text-[var(--color-text-dim)]!">{label}</span>
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="py-1.5">
      <span className="label">{label}</span>
      <div className="seg mt-1.5 w-full" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            className="btn flex-1 py-1.5!"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--color-line-soft)] py-1.5">
      <span className="label">{label}</span>
      <span className={`stat-value ${accent ? "text-[var(--color-accent)]!" : ""}`}>{value}</span>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">{children}</p>;
}
