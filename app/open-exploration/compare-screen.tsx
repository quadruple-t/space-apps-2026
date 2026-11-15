"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, BatteryCharging, Globe2, Sun, TriangleAlert } from "lucide-react";
import { MetricsTable } from "@/components/freeplay/comparison/metrics-table";
import { LoadingIndicator } from "@/components/freeplay/loading-indicator";
import { MeteorStreamsPanel } from "@/components/freeplay/meteor-streams-panel";
import { SitePicker } from "@/components/freeplay/comparison/site-picker";
import { TrackerPanel } from "@/components/freeplay/comparison/tracker-panel";
import { TimeSeriesChart, type Band, type Series } from "@/components/freeplay/charts";
import { PanelSettings, solarPowerW } from "@/components/freeplay/graphs-panel";
import { TimeControls } from "@/components/freeplay/time-controls";
import { computeMetrics, OXIDE_BY_METRIC, type SiteValues } from "@/lib/comparison";
import { useComparison } from "@/lib/comparison-store";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { earthUp, sampleAt, sunUp, type Sample } from "@/lib/illumination";
import { useTerrainStats } from "@/lib/terrain-stats";
import { useComposition } from "@/lib/use-composition";
import { useLunarWindow } from "@/lib/use-lunar-data";
import { getFactSheet } from "@/lib/firestore/factsService";
import { meteorStreamsFromFacts, streamIncidence, type MeteorStream } from "@/lib/science/meteor-streams";

type GraphFocus = "sunlight" | "earth" | "power";

/** Slot identity colours. Kept apart from the Sun (coral) and Earth (blue) colours used elsewhere. */
const COLOR_A = "#a986ff";
const COLOR_B = "#f5b942";

/** Elevations can't pass ±90°. Fixing the scale keeps the ticks at 50° steps whatever the two sites do. */
const ELEVATION_DOMAIN: [number, number] = [-100, 100];

const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtTick = (ms: number) => new Date(ms).toISOString().slice(5, 10);
const niceCeil = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v * 1.05)!; };

/** A smooth horizon ignores terrain, so shares for that site are upper bounds. Say so. */
function TerrainNote({ source, smooth, loading, error }: { source: string | null; smooth: boolean; loading: boolean; error: string | null }) {
  if (error) return <p role="alert" className="mt-1.5 text-xs text-destructive">Couldn&apos;t load data: {error}</p>;
  if (loading) return <LoadingIndicator label="site data" className="mt-1.5" />;
  if (!source) return null;
  return smooth
    ? <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300/90"><TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />No terrain data here ({source}). Sunlight and Earth shares are upper bounds.</p>
    : <p className="type-data mt-1.5 text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">Terrain · {source}</p>;
}

export function CompareScreen() {
  const presets = useFreeplay((s) => s.savedSites);
  const setView = useFreeplay((s) => s.setView);
  const startIso = useFreeplay((s) => s.startIso);
  const durationHours = useFreeplay((s) => s.durationHours);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const panelAreaM2 = useFreeplay((s) => s.panelAreaM2);
  const panelEfficiency = useFreeplay((s) => s.panelEfficiency);
  const setElapsed = useFreeplay((s) => s.setElapsed);
  const hydrate = useComparison((s) => s.hydrate);
  const slotA = useComparison((s) => s.slotA);
  const slotB = useComparison((s) => s.slotB);
  const selectedMetrics = useComparison((s) => s.metrics);
  const selectedStream = useFreeplay((s) => s.meteorStream);
  const { setSlot, swap, addMetric, removeMetric, resetMetrics } = useComparison.getState();
  const [focus, setFocus] = useState<GraphFocus>("sunlight");
  useEffect(() => { hydrate(); }, [hydrate]);

  // Sites come only from the user's presets. Look the slots up by id so a renamed preset shows its new name
  // and a deleted one simply empties its slot.
  const a = presets.find((p) => p.id === slotA?.id) ?? null;
  const b = presets.find((p) => p.id === slotB?.id) ?? null;

  const startMs = Date.parse(startIso);
  const endMs = startMs + durationHours * 3_600_000;
  const tMs = currentTimeMs({ startIso, elapsedHours });
  const winA = useLunarWindow(a, startIso, durationHours + 30);
  const winB = useLunarWindow(b, startIso, durationHours + 30);
  const samplesA = useMemo(() => winA.data?.samples.filter((s) => s.t <= endMs) ?? null, [winA.data, endMs]);
  const samplesB = useMemo(() => winB.data?.samples.filter((s) => s.t <= endMs) ?? null, [winB.data, endMs]);
  const metricsA = useMemo(() => samplesA && computeMetrics(samplesA, panelAreaM2, panelEfficiency), [samplesA, panelAreaM2, panelEfficiency]);
  const metricsB = useMemo(() => samplesB && computeMetrics(samplesB, panelAreaM2, panelEfficiency), [samplesB, panelAreaM2, panelEfficiency]);
  const terrainA = useTerrainStats(a);
  const terrainB = useTerrainStats(b);
  const needsComposition = selectedMetrics.some((key) => !!OXIDE_BY_METRIC[key]);
  const compositionA = useComposition(a, needsComposition);
  const compositionB = useComposition(b, needsComposition);
  const needsMeteor = selectedMetrics.includes("meteorExposure");
  const [meteorData, setMeteorData] = useState<{ streams: MeteorStream[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!needsMeteor || meteorData) return;
    let alive = true;
    getFactSheet("meteor-streams-2026").then((sheet) => {
      if (!sheet) throw new Error("Meteor reference data unavailable");
      const streams = meteorStreamsFromFacts(sheet);
      if (!streams.length) throw new Error("Meteor reference data unavailable");
      if (alive) setMeteorData({ streams, error: false });
    }).catch(() => { if (alive) setMeteorData({ streams: [], error: true }); });
    return () => { alive = false; };
  }, [needsMeteor, meteorData]);
  const stream = meteorData?.streams.find((item) => item.name === selectedStream);
  const exposure = (site: typeof a) => !site ? null : !meteorData ? undefined : !stream ? null : streamIncidence(site.latitudeDeg, site.longitudeDeg, stream) * 100;
  const valuesA: SiteValues = { window: metricsA, terrain: terrainA.data, composition: !a ? null : compositionA.loading ? undefined : compositionA.data, meteorExposure: exposure(a) };
  const valuesB: SiteValues = { window: metricsB, terrain: terrainB.data, composition: !b ? null : compositionB.loading ? undefined : compositionB.data, meteorExposure: exposure(b) };

  const chart = useMemo(() => {
    if (!samplesA?.length || !samplesB?.length) return null;
    const n = Math.min(samplesA.length, samplesB.length);
    const value = (s: Sample) => focus === "earth" ? s.earthEl : focus === "power" ? solarPowerW(s, panelAreaM2, panelEfficiency) : s.sunEl;
    const xs = Float64Array.from({ length: n }, (_, i) => samplesA[i].t);
    const va = Float64Array.from({ length: n }, (_, i) => value(samplesA[i]));
    const vb = Float64Array.from({ length: n }, (_, i) => value(samplesB[i]));
    const unit = focus === "power" ? " W" : "°";
    const series: Series[] = [
      { id: "a", label: `A · ${a?.name ?? ""}`, color: COLOR_A, values: va, unit, digits: focus === "power" ? 1 : 2 },
      { id: "b", label: `B · ${b?.name ?? ""}`, color: COLOR_B, values: vb, unit, digits: focus === "power" ? 1 : 2 },
    ];
    const up = focus === "earth" ? earthUp : sunUp;
    const bands: Band[] = focus === "power" ? [] : [
      { label: "A", color: COLOR_A, on: Array.from({ length: n }, (_, i) => up(samplesA[i])) },
      { label: "B", color: COLOR_B, on: Array.from({ length: n }, (_, i) => up(samplesB[i])) },
    ];
    const peak = Math.max(1, ...va, ...vb);
    return { xs, series, bands, powerDomain: [0, niceCeil(peak)] as [number, number] };
  }, [samplesA, samplesB, focus, a?.name, b?.name, panelAreaM2, panelEfficiency]);

  const title = focus === "earth" ? "Earth elevation, A vs B" : focus === "power" ? "Estimated solar power, A vs B" : "Sun elevation, A vs B";
  const topics: { id: GraphFocus; label: string; Icon: typeof Sun }[] = [
    { id: "sunlight", label: "Sunlight", Icon: Sun },
    { id: "earth", label: "Earth visibility", Icon: Globe2 },
    { id: "power", label: "Solar power", Icon: BatteryCharging },
  ];
  const nowIndex = (samples: Sample[] | null) => samples?.length ? Math.min(samples.length - 1, elapsedHours) : 0;
  const nowA = samplesA?.length ? sampleAt(samplesA, nowIndex(samplesA)) : null;
  const nowB = samplesB?.length ? sampleAt(samplesB, nowIndex(samplesB)) : null;
  const status = (n: Sample | null) => n ? `Sun ${sunUp(n) ? "up" : "down"} (${n.sunEl.toFixed(1)}°) · Earth ${earthUp(n) ? "in view" : "hidden"} (${n.earthEl.toFixed(1)}°)` : "—";

  return <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-4">
    <div className="mx-auto grid w-full max-w-7xl gap-3 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        <section className="hud-panel p-4 sm:p-5" aria-label="Choose two sites to compare">
          <h2 className="type-heading text-lg text-bone">Mission comparison</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick two saved sites and see them over the same mission window. Change the window with the time controls below.</p>
          <div className="mt-4 grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="min-w-0">
              <SitePicker label="Site A" color={COLOR_A} value={a} presets={presets} otherId={b?.id ?? null} onChange={(site) => setSlot("a", site)} />
              <TerrainNote source={winA.data?.horizon.source ?? null} smooth={winA.data?.horizon.elevationsDeg === null} loading={winA.loading} error={winA.error} />
            </div>
            <button type="button" onClick={swap} disabled={!a && !b} aria-label="Swap A and B" title="Swap A and B"
              className="mt-5 grid size-9 place-items-center justify-self-start rounded border border-line text-muted-foreground hover:text-bone disabled:opacity-40 sm:justify-self-center"><ArrowLeftRight size={15} /></button>
            <div className="min-w-0">
              <SitePicker label="Site B" color={COLOR_B} value={b} presets={presets} otherId={a?.id ?? null} onChange={(site) => setSlot("b", site)} />
              <TerrainNote source={winB.data?.horizon.source ?? null} smooth={winB.data?.horizon.elevationsDeg === null} loading={winB.loading} error={winB.error} />
            </div>
          </div>
          {presets.length < 2 && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-dashed border-line p-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">{presets.length === 0
              ? <>You have no saved sites yet. On the Moon map, click a place (a catalog pin or any point), choose <span className="text-bone">Save to expedition</span>, and repeat for a second place.</>
              : <>You have one saved site. Save at least one more on the Moon map to compare.</>}</p>
            <button type="button" onClick={() => setView("globe")} className="shrink-0 rounded bg-retro-purple px-3 py-2 text-sm font-semibold text-void hover:bg-[#c2aaff]">Open Moon map</button>
          </div>}
          <p className="type-data mt-3 text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">Window · {fmtTime(startMs)} → {fmtTime(endMs)}</p>
        </section>

        <section className="hud-panel p-4 sm:p-5" aria-label="Metrics">
          <MetricsTable a={{ name: a?.name ?? "—", color: COLOR_A, values: valuesA }} b={{ name: b?.name ?? "—", color: COLOR_B, values: valuesB }}
            selected={selectedMetrics} onAdd={addMetric} onRemove={removeMetric} onReset={resetMetrics} />
          {(terrainA.loading || terrainB.loading || compositionA.loading || compositionB.loading || (needsMeteor && !meteorData)) && <LoadingIndicator label="comparison metrics" className="mt-3" />}
          {(terrainA.error || terrainB.error) && <p role="alert" className="mt-2 text-xs text-destructive">Couldn&apos;t load terrain metrics. <button type="button" onClick={() => { if (terrainA.error) terrainA.retry(); if (terrainB.error) terrainB.retry(); }} className="underline">Try again</button></p>}
          {(compositionA.error || compositionB.error) && <p role="alert" className="mt-2 text-xs text-destructive">Couldn&apos;t load regional composition. <button type="button" onClick={() => { if (compositionA.error) compositionA.retry(); if (compositionB.error) compositionB.retry(); }} className="underline">Try again</button></p>}
          {meteorData?.error && needsMeteor && <p role="alert" className="mt-2 text-xs text-destructive">Couldn&apos;t load meteor reference data. <button type="button" onClick={() => setMeteorData(null)} className="underline">Try again</button></p>}
          {needsMeteor && <MeteorStreamsPanel />}
          <p className="mt-3 text-xs text-muted-foreground">Sun and Earth numbers use stored JPL Horizons positions and available LOLA terrain, sampled hourly. Solar energy assumes a flat {panelAreaM2} m² panel at {Math.round(panelEfficiency * 100)}% efficiency. &quot;No data&quot; is not zero.</p>
          {needsComposition && <p className="mt-2 text-xs text-muted-foreground">Oxides are Lunar Prospector regional averages over roughly 60 km, not measurements at the site or recoverable resources. The iron and titanium maps use different instruments and may differ. Values below twice their uncertainty are marked low confidence; hover over a value for its uncertainty.</p>}
          {needsMeteor && <p className="mt-2 text-xs text-muted-foreground">Meteor exposure is relative stream-facing geometry for the chosen 2026 reference, not an impact probability, storm frequency, or forecast.</p>}
        </section>

        <section className="hud-panel p-4 sm:p-5" aria-label="Comparison over time">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Choose what to compare" className="flex flex-wrap gap-2">
              {topics.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={focus === id} onClick={() => setFocus(id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${focus === id ? "border-retro-purple/60 bg-retro-purple/15 text-bone" : "border-line text-muted-foreground hover:text-bone"}`}><Icon size={16} />{label}</button>)}
            </div>
            {focus === "power" && <PanelSettings />}
          </div>
          <div className="mt-4">
            {chart
              ? <TimeSeriesChart title={title} xs={chart.xs} series={chart.series} bands={chart.bands} yUnit={focus === "power" ? "W" : "°"} zeroLine={focus !== "power"}
                  yDomain={focus === "power" ? chart.powerDomain : ELEVATION_DOMAIN} cursorX={tMs} onSeek={(x) => setElapsed((x - startMs) / 3_600_000)}
                  formatX={fmtTime} formatTick={durationHours > 72 ? fmtTick : (ms) => new Date(ms).toISOString().slice(11, 16)} height={230} />
              : <div className="rounded border border-dashed border-line p-6 text-center text-sm text-muted-foreground">{!a || !b ? "Choose two saved sites to draw the comparison." : winA.error || winB.error ? "Couldn’t load the comparison graph. Check the site errors above." : <LoadingIndicator label="both sites" />}</div>}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {([["A", COLOR_A, a, nowA], ["B", COLOR_B, b, nowB]] as const).map(([name, color, site, now]) => <div key={name} className="hud-readout">
              <dt className="type-data flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground"><span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: color }} />{name} at {fmtTime(tMs).slice(5)}</dt>
              <dd className="mt-1 text-bone"><span className="block truncate">{site?.name ?? "No site"}</span><span className="type-data text-xs tabular-nums text-muted-foreground">{status(now)}</span></dd>
            </div>)}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Click the graph to move both sites to the same moment. Shaded lanes show when the Sun or Earth clears the horizon.</p>
        </section>

        <TimeControls />
      </div>

      <TrackerPanel
        a={{ site: a, metrics: metricsA, terrain: winA.data?.horizon.source ?? null, layers: terrainA.data, composition: compositionA.data, meteor: needsMeteor && stream && typeof valuesA.meteorExposure === "number" ? { name: stream.name, referenceUtc: stream.referenceUtc, exposurePct: valuesA.meteorExposure } : null, loading: terrainA.loading || compositionA.loading || (needsMeteor && !meteorData), color: COLOR_A }}
        b={{ site: b, metrics: metricsB, terrain: winB.data?.horizon.source ?? null, layers: terrainB.data, composition: compositionB.data, meteor: needsMeteor && stream && typeof valuesB.meteorExposure === "number" ? { name: stream.name, referenceUtc: stream.referenceUtc, exposurePct: valuesB.meteorExposure } : null, loading: terrainB.loading || compositionB.loading || (needsMeteor && !meteorData), color: COLOR_B }} />
    </div>
  </div>;
}
