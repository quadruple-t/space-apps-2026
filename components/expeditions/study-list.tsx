"use client";

/**
 * Saved comparisons and rankings. Each is a snapshot of what the science API returned on the
 * day it was saved: the date is always shown, fallback horizons stay labelled as upper bounds,
 * and "Re-run" fetches current results instead of presenting the stored ones as live.
 */
import { useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, ListOrdered, Trash2 } from "lucide-react";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import type { Study } from "@/lib/expeditions/types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === "object") : []);
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "—");
const pct = (v: unknown) => (typeof v === "number" ? `${v}%` : "—");
export const savedOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function RankingDetails({ study }: { study: Study }) {
  const data = obj(study.result.data);
  const pick = obj(data.recommendedPick);
  const rows = arr(data.sites);
  const mustSay = Array.isArray(study.result.mustSay) ? study.result.mustSay.filter((m): m is string => typeof m === "string") : [];
  return <div className="mt-2 space-y-2 text-[0.62rem] leading-snug text-muted-foreground">
    {typeof study.result.dataRange === "string" && <p>Window: {study.result.dataRange}</p>}
    {pick.siteId !== undefined && <p className="text-bone">Recommended pick: {text(rows.find((r) => r.siteId === pick.siteId)?.name ?? pick.siteId)}{typeof pick.reason === "string" ? ` — ${pick.reason}` : ""}</p>}
    <div className="overflow-x-auto">
      <table className="type-data w-full text-left text-[0.58rem]">
        <thead className="text-muted-foreground"><tr><th className="pr-2 font-normal">#</th><th className="pr-2 font-normal">Site</th><th className="pr-2 font-normal">Score</th><th className="pr-2 font-normal">Sun</th><th className="pr-2 font-normal">Earth</th><th className="font-normal">Horizon</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line/50 text-bone/90">
          <td className="pr-2">{text(r.rank)}</td>
          <td className="pr-2">{text(r.name ?? r.siteId)}{r.isRecommendedPick ? " ★" : ""}</td>
          <td className="pr-2">{text(r.score)}</td>
          <td className="pr-2">{pct(r.sunlightPercent)}{r.sharesAreUpperBounds ? "*" : ""}</td>
          <td className="pr-2">{pct(r.earthVisibilityPercent)}{r.sharesAreUpperBounds ? "*" : ""}</td>
          <td>{text(r.horizon)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {rows.some((r) => r.sharesAreUpperBounds) && <p>* Smooth-sphere fallback horizon: sunlight and visibility shares are upper bounds, not terrain-derived.</p>}
    {mustSay.length > 0 && <ul className="list-disc space-y-0.5 pl-4">{mustSay.map((m, i) => <li key={i}>{m}</li>)}</ul>}
  </div>;
}

function StudyRow({ study }: { study: Study }) {
  const { renameStudy, deleteStudy } = useExpeditions.getState();
  const [label, setLabel] = useState(study.label);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRanking = study.kind === "ranking";
  const Icon = isRanking ? ListOrdered : BarChart3;
  const act = (fn: () => Promise<void>) => { setError(null); fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); };

  return <li className="rounded border border-line/70 px-2 py-1.5">
    <div className="flex items-start gap-1.5">
      {isRanking
        ? <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${study.label}`} className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-bone">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
        : <Icon size={13} aria-hidden className="mt-1 shrink-0 text-retro-purple" />}
      <div className="min-w-0 flex-1">
        <input value={label} aria-label="Study name" maxLength={120} onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { const l = label.trim(); if (!l) setLabel(study.label); else if (l !== study.label) act(() => renameStudy(study.id, l)); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-full rounded border border-transparent bg-transparent px-1 text-xs text-bone hover:border-line focus:border-retro-purple focus:outline-none" />
        <p className="type-data px-1 text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
          {isRanking ? "Ranking" : "Comparison"} · saved {savedOn(study.createdAt)}{study.source === "mission-control" ? " · Mission Control" : ""}
        </p>
      </div>
    </div>
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-6">
      {!isRanking && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded border border-line px-2 py-0.5 text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-bone">{open ? "Hide" : "Show"}</button>}
      {confirming
        ? <span className="inline-flex items-center gap-1 text-[0.56rem] text-muted-foreground">Delete?
            <button type="button" onClick={() => act(() => deleteStudy(study.id))} className="rounded bg-retro-red/80 px-2 py-0.5 uppercase text-void">Delete</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded border border-line px-2 py-0.5 uppercase">Keep</button>
          </span>
        : <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${study.label}`} className="ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><Trash2 size={12} /></button>}
    </div>
    {open && (isRanking ? <RankingDetails study={study} /> : <ComparisonDetails study={study} />)}
    {error && <p role="alert" className="mt-1 text-[0.6rem] text-retro-red">{error}</p>}
  </li>;
}

/**
 * Saved comparisons. Mission Control studies store the shaped rows the assistant answered from;
 * older studies from the former comparison page store the science API's per-site results.
 */
function ComparisonDetails({ study }: { study: Study }) {
  if (study.source === "compare-page") return <ComparePageDetails study={study} />;
  const sites = arr(obj(study.result.data).sites);
  return <div className="mt-2 space-y-1 text-[0.62rem] text-muted-foreground">
    {typeof study.result.dataRange === "string" && <p>Window: {study.result.dataRange}</p>}
    <ul className="space-y-1">{sites.map((s, i) => {
      const horizon = obj(s.horizon);
      return <li key={i} className="text-bone/90">{text(s.siteId)}: sun {pct(s.sunlightPercent)}, Earth {pct(s.earthVisibilityPercent)}
        <span className="text-muted-foreground"> · {text(horizon.label)}{horizon.upperBound ? " (shares are upper bounds)" : ""}</span>
      </li>;
    })}</ul>
  </div>;
}

function ComparePageDetails({ study }: { study: Study }) {
  const sites = arr(study.result.sites);
  const interval = obj(study.result.interval);
  return <div className="mt-2 space-y-1 text-[0.62rem] text-muted-foreground">
    <p>Snapshot saved {savedOn(study.createdAt)}{typeof interval.start === "string" ? ` · window from ${interval.start.slice(0, 16).replace("T", " ")} UTC` : ""}{interval.durationHours !== undefined ? `, ${text(interval.durationHours)} h` : ""}</p>
    <ul className="space-y-1">{sites.map((s, i) => {
      const r = obj(s.result);
      const smooth = typeof r.horizonSource === "string" && r.horizonSource.includes("smooth");
      return <li key={i} className="text-bone/90">{text(s.siteId)}: {r.error ? "no result" : <>sun {pct(r.sunlightPercent)}, Earth {pct(r.earthVisibilityPercent)}</>}
        {typeof r.horizonSource === "string" && <span className="text-muted-foreground"> · {r.horizonSource}{smooth ? " (shares are upper bounds)" : ""}</span>}
      </li>;
    })}</ul>
  </div>;
}

export function StudyList() {
  const studies = useExpeditions((s) => s.studies);
  if (studies.length === 0) {
    return <p className="text-[0.66rem] leading-relaxed text-muted-foreground">
      No saved studies yet. Use <span className="text-bone">Save to expedition</span> under a Mission Control comparison or ranking.
    </p>;
  }
  return <ul className="space-y-1.5">{studies.map((s) => <StudyRow key={s.id} study={s} />)}</ul>;
}
