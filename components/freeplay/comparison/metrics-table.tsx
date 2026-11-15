"use client";

import { Layers3, Plus, RotateCcw, X } from "lucide-react";
import { formatDelta, formatValue, GROUP_LABELS, METRICS, metricValue, winnerFor, type MetricDef, type MetricGroup, type MetricKey, type SiteValues } from "@/lib/comparison";

export type Side = { name: string; color: string; values: SiteValues };

const GROUPS: MetricGroup[] = ["layers", "sun", "earth"];

function LayerTag({ def }: { def: MetricDef }) {
  if (!def.layer) return null;
  return <span className="type-data inline-flex items-center gap-1 rounded border border-retro-purple/35 px-1.5 py-0.5 text-[0.54rem] uppercase tracking-[0.08em] text-retro-purple"><Layers3 size={10} aria-hidden />{def.layer} layer</span>;
}

/** The chosen metric rows for two sites, with the better value marked, plus controls to add or remove rows. */
export function MetricsTable({ a, b, selected, onAdd, onRemove, onReset }: {
  a: Side; b: Side; selected: MetricKey[];
  onAdd: (key: MetricKey) => void; onRemove: (key: MetricKey) => void; onReset: () => void;
}) {
  const shown = METRICS.filter((m) => selected.includes(m.key));
  const hidden = METRICS.filter((m) => !selected.includes(m.key));
  return <div>
    <div className="overflow-x-auto rounded-lg border border-line/80">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">Chosen metrics for {a.name} and {b.name} over the same mission window</caption>
        <thead>
          <tr className="border-b border-line bg-charcoal/40 text-xs">
            <th scope="col" className="px-4 py-2.5 font-medium text-bone">Metric</th>
            {[a, b].map((side, i) => <th key={i} scope="col" className="px-4 py-2.5 font-medium text-bone">
              <span className="flex items-center gap-2"><span aria-hidden className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: side.color }} /><span className="truncate">{i === 0 ? "A" : "B"} · {side.name}</span></span>
            </th>)}
            <th scope="col" className="px-4 py-2.5 font-normal text-muted-foreground">B − A</th>
            <th scope="col" className="px-4 py-2.5 font-normal text-muted-foreground">Better</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((def) => {
            const va = metricValue(def, a.values), vb = metricValue(def, b.values);
            const winner = winnerFor(def, va, vb);
            const cell = (side: "a" | "b", value: typeof va) => `type-data px-4 py-2.5 tabular-nums ${value === undefined ? "text-bone/35" : value === null ? "text-muted-foreground/70 italic" : winner === side ? "font-semibold text-bone" : "text-muted-foreground"}`;
            return <tr key={def.key} className="border-b border-line/70 last:border-0">
              <th scope="row" className="px-4 py-2.5 font-normal text-bone">
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1"><span className="block">{def.label}</span><span className="mt-1 block"><LayerTag def={def} /></span></span>
                  <button type="button" onClick={() => onRemove(def.key)} aria-label={`Remove ${def.label}`} title="Remove this metric"
                    className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><X size={13} /></button>
                </span>
              </th>
              <td className={cell("a", va)} title={va === null ? def.noData : undefined} style={winner === "a" ? { boxShadow: `inset 3px 0 0 ${a.color}` } : undefined}>{formatValue(def, va)}</td>
              <td className={cell("b", vb)} title={vb === null ? def.noData : undefined} style={winner === "b" ? { boxShadow: `inset 3px 0 0 ${b.color}` } : undefined}>{formatValue(def, vb)}</td>
              <td className="type-data px-4 py-2.5 tabular-nums text-muted-foreground">{formatDelta(def, va, vb)}</td>
              <td className="type-data px-4 py-2.5 text-xs text-muted-foreground">{winner === "none" ? "—" : winner === "tie" ? "Tie" : winner === "a" ? "A" : "B"}</td>
            </tr>;
          })}
          {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No metrics selected. Add some below.</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-data text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Add a metric</h3>
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-muted-foreground hover:text-bone"><RotateCcw size={12} />Reset</button>
      </div>
      {hidden.length === 0
        ? <p className="mt-2 text-xs text-muted-foreground">Every metric is shown.</p>
        : <div className="mt-2 flex flex-col gap-2">
            {GROUPS.map((group) => {
              const items = hidden.filter((m) => m.group === group);
              if (items.length === 0) return null;
              return <div key={group} role="group" aria-label={GROUP_LABELS[group]} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[0.62rem] text-muted-foreground">{GROUP_LABELS[group]}</span>
                {items.map((def) => <button key={def.key} type="button" onClick={() => onAdd(def.key)} aria-label={`Add ${def.label}`}
                  className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-bone hover:border-retro-purple/60 hover:bg-retro-purple/10"><Plus size={12} aria-hidden />{def.layer && def.group === "layers" && def.key !== "sunlightPct" ? def.layer : def.label}</button>)}
              </div>;
            })}
          </div>}
    </div>
  </div>;
}
