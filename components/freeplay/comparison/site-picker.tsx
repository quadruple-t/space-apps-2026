"use client";

import type { FreeplaySite } from "@/data/sites";

const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "S" : "N"}`;

/** Chooses one of the user's presets. The other slot's preset is disabled so the two sides always differ. */
export function SitePicker({ label, color, value, presets, otherId, onChange }: {
  label: string;
  color: string;
  value: FreeplaySite | null;
  presets: FreeplaySite[];
  otherId: string | null;
  onChange: (site: FreeplaySite | null) => void;
}) {
  return <label className="block min-w-0 text-xs text-muted-foreground">
    <span className="type-data flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.14em]">
      <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: color }} />{label}
    </span>
    <select value={value?.id ?? ""} onChange={(e) => onChange(presets.find((s) => s.id === e.target.value) ?? null)} className="hud-input mt-1.5 text-sm text-bone">
      <option value="">Choose a preset…</option>
      {presets.map((s) => <option key={s.id} value={s.id} disabled={s.id === otherId}>{s.name} · {fmtLat(s.latitudeDeg)}, {s.longitudeDeg.toFixed(1)}°E</option>)}
    </select>
  </label>;
}
