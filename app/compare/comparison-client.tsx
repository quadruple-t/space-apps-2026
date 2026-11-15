"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SaveToExpedition } from "@/components/expeditions/save-to-expedition";
import { savedOn } from "@/components/expeditions/study-list";
import { useExpeditions } from "@/lib/expeditions/expedition-store";

type Site = { id: string; name: string; family: string; latDeg: number | null; lonDeg: number | null; pointIsApproximate: boolean; coordsVerified: boolean };
type MetricResult = {
  sunlightPercent?: number; sunlightHours?: number; longestDarknessHours?: number;
  earthVisibilityPercent?: number; longestBlackoutHours?: number; slopeDeg?: number;
  horizonSource?: string; assumptions?: string[]; error?: { message?: string };
};
type Comparison = { sites: { siteId: string; status: number; result: MetricResult }[]; interval: { start: string | null; durationHours: string } };

const METRICS: { label: string; value: (result: MetricResult) => string }[] = [
  { label: "Sunlight availability", value: (m) => m.sunlightPercent == null ? "—" : `${m.sunlightPercent}%` },
  { label: "Sunlit duration", value: (m) => m.sunlightHours == null ? "—" : `${m.sunlightHours} h` },
  { label: "Longest darkness", value: (m) => m.longestDarknessHours == null ? "—" : `${m.longestDarknessHours} h` },
  { label: "Earth visibility", value: (m) => m.earthVisibilityPercent == null ? "—" : `${m.earthVisibilityPercent}%` },
  { label: "Longest blackout", value: (m) => m.longestBlackoutHours == null ? "—" : `${m.longestBlackoutHours} h` },
  { label: "Local slope", value: (m) => m.slopeDeg == null ? "—" : `${m.slopeDeg.toFixed(2)}°` },
];

type CompareInput = { ids: string[]; date: string; duration: string };

async function fetchComparison(input: CompareInput): Promise<Comparison> {
  const query = new URLSearchParams({ siteIds: input.ids.join(","), start: `${input.date}T00:00:00.000Z`, durationHours: input.duration });
  const response = await fetch(`/api/v1/science/compare?${query}`);
  const result = await response.json() as Comparison & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Comparison request failed");
  return result;
}

export function ComparisonClient() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState("2026-11-14");
  const [duration, setDuration] = useState("24");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** Set while showing a stored result, so it is never mistaken for a live one. */
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const params = useSearchParams();
  const studyId = params.get("study");
  const rerun = params.get("rerun") === "1";
  const study = useExpeditions((s) => (studyId ? s.studies.find((x) => x.id === studyId && x.kind === "comparison") : undefined));
  const [appliedStudy, setAppliedStudy] = useState<string | null>(null);
  /** Saved inputs to fetch fresh results for (opened with ?rerun=1). */
  const [rerunInput, setRerunInput] = useState<CompareInput | null>(null);
  if (study && appliedStudy !== study.id) {
    // Restore the saved inputs (and, unless re-running, the saved result) once per opened study.
    const ids = Array.isArray(study.inputs.siteIds) ? study.inputs.siteIds.filter((x): x is string => typeof x === "string").slice(0, 2) : [];
    const savedDate = typeof study.inputs.date === "string" ? study.inputs.date : date;
    const savedDuration = typeof study.inputs.durationHours === "string" ? study.inputs.durationHours : duration;
    setAppliedStudy(study.id);
    if (ids.length === 2) setSelected(ids);
    setDate(savedDate);
    setDuration(savedDuration);
    if (rerun) { setSavedAt(null); setRerunInput({ ids, date: savedDate, duration: savedDuration }); }
    else { setComparison(study.result as Comparison); setSavedAt(study.createdAt); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/catalog/sites")
      .then(async (response) => {
        if (!response.ok) throw new Error("Site catalog is unavailable");
        return response.json() as Promise<{ sites?: Site[] }>;
      })
      .then((data) => {
        if (!active) return;
        const available = (data.sites ?? []).filter((site) => site.latDeg !== null && site.lonDeg !== null && site.coordsVerified && !site.pointIsApproximate);
        setSites(available);
        setSelected((current) => (current.length === 2 ? current : available.slice(0, 2).map((site) => site.id)));
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Site catalog is unavailable"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!rerunInput) return;
    let active = true;
    fetchComparison(rerunInput).then(
      (result) => { if (active) { setComparison(result); setError(""); setRerunInput(null); } },
      (cause: unknown) => { if (active) { setComparison(null); setError(cause instanceof Error ? cause.message : "Comparison request failed"); setRerunInput(null); } },
    );
    return () => { active = false; };
  }, [rerunInput]);

  const siteName = (id: string) => sites.find((site) => site.id === id)?.name ?? id;
  const studyInput = () => ({
    kind: "comparison" as const, source: "compare-page" as const,
    label: `${comparison?.sites.map((e) => siteName(e.siteId)).join(" vs ")} · ${date}`.slice(0, 120),
    inputs: { siteIds: comparison?.sites.map((e) => e.siteId) ?? selected, date, durationHours: duration },
    result: comparison as unknown as Record<string, unknown>,
  });

  const select = (index: number, id: string) => setSelected((current) => current.map((value, position) => position === index ? id : value));
  const analyze = async (input: CompareInput = { ids: selected, date, duration }) => {
    if (input.ids.length !== 2 || !input.date) return;
    setLoading(true);
    setError("");
    setSavedAt(null);
    try {
      setComparison(await fetchComparison(input));
    } catch (cause) {
      setComparison(null);
      setError(cause instanceof Error ? cause.message : "Comparison request failed");
    } finally {
      setLoading(false);
    }
  };

  return <div>
    <div className="grid gap-3 rounded-lg border border-line bg-charcoal/30 p-4 md:grid-cols-[1fr_1fr_180px_150px_auto] md:items-end">
      {[0, 1].map((index) => <label key={index} className="block text-xs text-muted-foreground">Site {index + 1}
        <select value={selected[index] ?? ""} onChange={(event) => select(index, event.target.value)} className="hud-input mt-1">
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.family}</option>)}
        </select>
      </label>)}
      <label className="block text-xs text-muted-foreground">UTC start date<input type="date" value={date} min="2026-01-01" max="2030-12-30" onChange={(event) => setDate(event.target.value)} className="hud-input mt-1"/></label>
      <label className="block text-xs text-muted-foreground">Window<select value={duration} onChange={(event) => setDuration(event.target.value)} className="hud-input mt-1"><option value="24">24 hours</option><option value="72">3 days</option><option value="336">14 days</option><option value="720">30 days</option></select></label>
      <button type="button" onClick={() => void analyze()} disabled={loading || rerunInput !== null || selected.length !== 2 || sites.length < 2} className="h-10 rounded bg-retro-red px-4 text-xs font-semibold uppercase tracking-[0.1em] text-void hover:bg-[#ff91a2] disabled:opacity-50">{loading || rerunInput ? "Analyzing…" : "Compare"}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {comparison && <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {savedAt
          ? <p role="status" className="text-sm text-muted-foreground">Saved result from {savedOn(savedAt)}. Stored data may have changed since. <button type="button" onClick={() => void analyze()} className="text-retro-purple underline-offset-2 hover:underline">Re-run with current data</button></p>
          : <span />}
        {!savedAt && <SaveToExpedition key={JSON.stringify(comparison.interval) + comparison.sites.map((e) => e.siteId).join()} makeInput={studyInput} />}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{comparison.sites.map((entry) => {
        const site = sites.find((candidate) => candidate.id === entry.siteId);
        return <section key={entry.siteId} className="rounded-lg border border-line bg-charcoal/30 p-4"><h3 className="type-heading text-base text-bone">{site?.name ?? entry.siteId}</h3><p className="type-data mt-1 text-[0.6rem] text-muted-foreground">{site?.latDeg?.toFixed(3)}° / {site?.lonDeg?.toFixed(3)}° E · {entry.result.horizonSource ?? entry.result.error?.message ?? `HTTP ${entry.status}`}</p></section>;
      })}</div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[36rem] text-left text-sm"><caption className="sr-only">Calculated lunar site comparison metrics</caption>
          <thead><tr className="border-b border-line bg-charcoal/50"><th className="px-5 py-3.5 font-medium text-bone">Metric</th>{comparison.sites.map((entry) => <th key={entry.siteId} className="type-data px-5 py-3.5 text-xs font-normal text-bone/60">{sites.find((site) => site.id === entry.siteId)?.name ?? entry.siteId}</th>)}</tr></thead>
          <tbody>{METRICS.map((metric) => <tr key={metric.label} className="border-b border-line last:border-0"><th scope="row" className="px-5 py-4 font-normal text-bone">{metric.label}</th>{comparison.sites.map((entry) => <td key={entry.siteId} className="type-data px-5 py-4 text-bone">{entry.status === 200 ? metric.value(entry.result) : "Unavailable"}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{comparison.sites[0]?.result.assumptions?.join(" · ")}</p>
    </>}
  </div>;
}
