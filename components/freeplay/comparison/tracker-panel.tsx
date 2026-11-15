"use client";

import { useState, type FormEvent } from "react";
import { BookmarkPlus, Download, RotateCcw, Trash2 } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { downloadCsv } from "@/components/freeplay/graphs-panel";
import type { SlotMetrics } from "@/lib/comparison";
import { MAX_SNAPSHOTS, pairKey, useComparison, type Snapshot } from "@/lib/comparison-store";
import { useFreeplay } from "@/lib/freeplay-store";
import type { TerrainStats } from "@/lib/terrain-stats";
import { COMPOSITION_OXIDES, lowConfidenceOxides } from "@/lib/science/composition";
import type { CompositionStats } from "@/lib/use-composition";

export type TrackedSide = { site: FreeplaySite | null; metrics: SlotMetrics | null; terrain: string | null; layers: TerrainStats | null; composition: CompositionStats | null; meteor: Snapshot["a"]["meteor"] | null; loading: boolean; color: string };

const noteClass = "hud-input mt-1.5 min-h-20 resize-y text-sm leading-relaxed text-bone placeholder:text-muted-foreground/60";
const fmtWindow = (s: Snapshot) => `${s.startIso.slice(0, 10)} · ${s.durationHours < 48 ? `${s.durationHours} h` : `${+(s.durationHours / 24).toFixed(1)} d`}`;

/** Loads a snapshot's two presets and window. Uses the current preset objects, so renames and radius edits carry over. */
function restore(s: Snapshot, presets: FreeplaySite[]) {
  const a = presets.find((p) => p.id === s.a.site.id), b = presets.find((p) => p.id === s.b.site.id);
  if (!a || !b) return;
  const comparison = useComparison.getState();
  comparison.setSlot("a", a);
  comparison.setSlot("b", b);
  const freeplay = useFreeplay.getState();
  freeplay.setStart(s.startIso);
  freeplay.setDuration(s.durationHours);
  freeplay.setPanel(s.panelAreaM2, s.panelEfficiency);
}

function exportLog(log: Snapshot[]) {
  const side = (x: Snapshot["a"]) => [
    x.site.name, x.site.latitudeDeg, x.site.longitudeDeg, x.terrain,
    x.metrics.sunlightPct.toFixed(2), x.metrics.sunlightHours.toFixed(1), x.metrics.longestDarkHours.toFixed(1),
    x.metrics.earthPct.toFixed(2), x.metrics.longestBlackoutHours.toFixed(1), x.metrics.peakSunEl.toFixed(2), x.metrics.energyKWh.toFixed(3),
    // Blank = the data has nothing for this site (or the entry predates these columns).
    x.layers?.slopeDeg?.toFixed(2) ?? "", x.layers?.elevationM?.toFixed(1) ?? "", x.layers?.insidePsr == null ? "" : x.layers.insidePsr ? "yes" : "no",
    ...COMPOSITION_OXIDES.flatMap((oxide) => {
      const comp = x.composition;
      if (!comp) return ["", "", ""];
      const low = lowConfidenceOxides(comp.oxidesWtPct, comp.sigmaWtPct).includes(oxide);
      return [low ? "" : comp.oxidesWtPct[oxide].toFixed(2), comp.sigmaWtPct[oxide].toFixed(2), low ? "low confidence" : "reported"];
    }),
    x.composition?.resolutionKm ?? "", x.meteor?.name ?? "", x.meteor?.referenceUtc ?? "", x.meteor?.exposurePct.toFixed(1) ?? "",
  ];
  const cols = ["name", "lat_deg", "lon_east_deg", "terrain", "sunlit_pct", "sunlit_hours", "longest_dark_h", "earth_pct", "longest_blackout_h", "peak_sun_el_deg", "energy_kwh", "slope_deg", "elevation_m", "inside_psr", ...COMPOSITION_OXIDES.flatMap((oxide) => [`${oxide}_wt_pct`, `${oxide}_sigma_wt_pct`, `${oxide}_status`]), "composition_resolution_km", "meteor_stream", "meteor_reference_utc", "meteor_geometric_exposure_pct"];
  // Free text can contain commas, quotes and newlines, so quote every text field. A leading = + - @ would
  // run as a formula when the file is opened in a spreadsheet, so those get a leading apostrophe.
  const q = (v: string | number) => {
    if (typeof v === "number") return v;
    const flat = String(v).replace(/\r?\n/g, " ");
    return `"${(/^[=+\-@\t\r]/.test(flat) ? `'${flat}` : flat).replace(/"/g, '""')}"`;
  };
  downloadCsv(`lunaris360_comparison_log_${new Date().toISOString().slice(0, 10)}.csv`,
    ["saved_utc", "label", "window_start_utc", "duration_hours", "panel_area_m2", "panel_efficiency", ...cols.map((c) => `a_${c}`), ...cols.map((c) => `b_${c}`)],
    log.map((s) => [s.savedAt, s.label, s.startIso, s.durationHours, s.panelAreaM2, s.panelEfficiency, ...side(s.a), ...side(s.b)].map(q)));
}

/** Notes and a tracked-data log that live beside the comparison, saved in this browser. */
export function TrackerPanel({ a, b }: { a: TrackedSide; b: TrackedSide }) {
  const siteNotes = useComparison((s) => s.siteNotes);
  const pairNotes = useComparison((s) => s.pairNotes);
  const log = useComparison((s) => s.log);
  const presets = useFreeplay((s) => s.savedSites);
  const { setSiteNote, setPairNote, addSnapshot, setSnapshotLabel, removeSnapshot } = useComparison.getState();
  const startIso = useFreeplay((s) => s.startIso);
  const durationHours = useFreeplay((s) => s.durationHours);
  const panelAreaM2 = useFreeplay((s) => s.panelAreaM2);
  const panelEfficiency = useFreeplay((s) => s.panelEfficiency);
  const [label, setLabel] = useState("");

  const key = pairKey(a.site, b.site);
  const canLog = !!(a.site && b.site && a.metrics && b.metrics && a.terrain && b.terrain && !a.loading && !b.loading);
  const logIt = (event: FormEvent) => {
    event.preventDefault();
    if (!canLog || !a.site || !b.site || !a.metrics || !b.metrics || !a.terrain || !b.terrain) return;
    addSnapshot({
      label: label.trim(), startIso, durationHours, panelAreaM2, panelEfficiency,
      a: { site: a.site, terrain: a.terrain, metrics: a.metrics, ...(a.layers ? { layers: a.layers } : {}), ...(a.composition ? { composition: a.composition } : {}), ...(a.meteor ? { meteor: a.meteor } : {}) },
      b: { site: b.site, terrain: b.terrain, metrics: b.metrics, ...(b.layers ? { layers: b.layers } : {}), ...(b.composition ? { composition: b.composition } : {}), ...(b.meteor ? { meteor: b.meteor } : {}) },
    });
    setLabel("");
  };

  return <section aria-label="Notes and tracked data" className="hud-panel flex flex-col gap-5 p-4">
    <div>
      <h2 className="type-heading text-base text-bone">Notes</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Saved in this browser as you type.</p>
      <label className="mt-3 block text-xs text-muted-foreground">Decision notes for this pair
        <textarea value={key ? pairNotes[key] ?? "" : ""} disabled={!key} onChange={(e) => key && setPairNote(key, e.target.value)} maxLength={4000}
          placeholder={key ? "Why one site wins, open questions, who to ask…" : "Choose two presets to write notes about the pair."} className={noteClass} />
      </label>
      {([["A", a], ["B", b]] as const).map(([name, side]) => <label key={name} className="mt-3 block text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: side.color }} />Notes on {name}{side.site ? ` · ${side.site.name}` : ""}</span>
        <textarea value={side.site ? siteNotes[side.site.id] ?? "" : ""} disabled={!side.site} onChange={(e) => side.site && setSiteNote(side.site.id, e.target.value)} maxLength={4000}
          placeholder={side.site ? "Terrain concerns, landing hazards, science value…" : `Choose a preset for ${name}.`} className={noteClass} />
      </label>)}
    </div>

    <div className="border-t border-line/80 pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="type-heading text-base text-bone">Tracked data{log.length ? ` · ${log.length}` : ""}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Log the current numbers to compare dates, panel sizes or site pairs over time.</p>
        </div>
        {log.length > 0 && <button type="button" onClick={() => exportLog(log)} className="inline-flex shrink-0 items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs text-muted-foreground hover:text-bone"><Download size={13} />CSV</button>}
      </div>
      <form onSubmit={logIt} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="snapshot-label">Snapshot label</label>
        <input id="snapshot-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Label (optional)" className="hud-input min-w-0 flex-1 text-sm" />
        <button type="submit" disabled={!canLog} title={canLog ? "Save these numbers to the log" : "Waiting for both sites to load"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded bg-retro-red px-3 text-xs font-semibold uppercase tracking-[0.08em] text-void hover:bg-[#ff91a2] disabled:cursor-not-allowed disabled:opacity-40"><BookmarkPlus size={14} />Log</button>
      </form>

      {log.length === 0
        ? <p className="mt-3 text-sm text-muted-foreground">Nothing logged yet. Each entry records both sites, the window and the panel assumptions.</p>
        : <ul className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
            {log.map((s) => <li key={s.id} className="rounded-md border border-line/80 bg-void/50 p-2.5">
              <div className="flex items-center gap-2">
                <input key={`${s.id}:${s.label}`} defaultValue={s.label} aria-label="Snapshot label" placeholder="Untitled" maxLength={80}
                  onBlur={(e) => { if (e.target.value !== s.label) setSnapshotLabel(s.id, e.target.value.trim()); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm text-bone hover:border-line focus:border-retro-purple focus:outline-none" />
                {(() => {
                  const available = presets.some((p) => p.id === s.a.site.id) && presets.some((p) => p.id === s.b.site.id);
                  return <button type="button" onClick={() => restore(s, presets)} disabled={!available} title={available ? "Load these presets and window" : "One of these presets has been deleted"} aria-label={`Restore ${s.label || "snapshot"}`}
                    className="grid size-7 shrink-0 place-items-center rounded border border-line text-muted-foreground hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={13} /></button>;
                })()}
                <button type="button" onClick={() => removeSnapshot(s.id)} aria-label={`Delete ${s.label || "snapshot"}`} className="grid size-7 shrink-0 place-items-center rounded border border-line text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><Trash2 size={13} /></button>
              </div>
              <p className="type-data mt-0.5 px-1 text-[0.58rem] text-muted-foreground">{fmtWindow(s)} · saved {s.savedAt.slice(0, 16).replace("T", " ")} UTC</p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 px-1 text-xs">
                {([["A", s.a], ["B", s.b]] as const).map(([name, side]) => <div key={name} className="contents">
                  <dt className="type-data text-muted-foreground">{name}</dt>
                  <dd className="min-w-0 text-bone"><span className="block truncate">{side.site.name}</span>
                    <span className="type-data text-[0.62rem] tabular-nums text-muted-foreground">Sun {side.metrics.sunlightPct.toFixed(0)}% · Earth {side.metrics.earthPct.toFixed(0)}% · {side.metrics.energyKWh.toFixed(1)} kWh</span></dd>
                </div>)}
              </dl>
            </li>)}
          </ul>}
      {log.length >= MAX_SNAPSHOTS && <p className="mt-2 text-xs text-muted-foreground">The log keeps the latest {MAX_SNAPSHOTS} entries.</p>}
    </div>
  </section>;
}
