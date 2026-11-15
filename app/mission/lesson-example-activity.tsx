"use client";

import { useMemo, useState } from "react";
import type { FreeplaySite } from "@/data/sites";
import { earthUp, sunUp } from "@/lib/illumination";
import { useFreeplay } from "@/lib/freeplay-store";
import { useLunarWindow } from "@/lib/use-lunar-data";
import { STORY_STOPS, type GuidedLesson } from "./tutorial-content";
import { CandidateComparison } from "./candidate-comparison";
import { SitePreview } from "./site-preview";

const fieldClass = "hud-input mt-1 w-full text-sm normal-case tracking-normal";
const stopTitle = (stop: FreeplaySite) => stop.name;

/** Small, hands-on demos for the example step. Mission readouts use the same data as the main views. */
export function LessonExampleActivity({ lesson, stops, candidates }: {
  lesson: GuidedLesson;
  stops: FreeplaySite[];
  candidates: FreeplaySite[];
}) {
  const selectedSite = useFreeplay((state) => state.site);
  const startIso = useFreeplay((state) => state.startIso);
  const durationHours = useFreeplay((state) => state.durationHours);
  const elapsedHours = useFreeplay((state) => state.elapsedHours);
  const setElapsed = useFreeplay((state) => state.setElapsed);
  const selectSite = useFreeplay((state) => state.selectSite);
  const [siteId, setSiteId] = useState(selectedSite?.id ?? stops[0]?.id ?? "");
  const [slopeLimit, setSlopeLimit] = useState(10);
  const [ridgeHeight, setRidgeHeight] = useState(250);
  const [distance, setDistance] = useState(3);
  const site = stops.find((candidate) => candidate.id === selectedSite?.id)
    ?? stops.find((candidate) => candidate.id === siteId)
    ?? stops[0]
    ?? null;
  const siteNote = STORY_STOPS.find((stop) => stop.name === site?.name || stop.catalogId === site?.catalogId)?.note;
  const window = useLunarWindow(site, startIso, durationHours, lesson.id === "sun" || lesson.id === "earth");
  const maxHour = Math.max(0, Math.min(durationHours, (window.data?.samples.length ?? 1) - 1));
  const sampleIndex = Math.max(0, Math.min(maxHour, Math.round(elapsedHours)));
  const sample = window.data?.samples[sampleIndex];
  const ridgeAngle = Math.atan2(ridgeHeight, distance * 1000) * 180 / Math.PI;

  const lead = useMemo(() => ({
    "pick-site": "Pick a stop. See how mission history and location change together.",
    overlays: "Set a pretend lander slope limit and see the trade-off.",
    sun: "Scrub the mission clock. Compare the Sun with the local terrain horizon.",
    earth: "Scrub the mission clock. Check whether terrain blocks Earth.",
    candidates: "Choose any two stops from the earlier site tour and compare the same mission window.",
    surface: "Change the ridge and your distance. See how a nearby horizon can hide a low Sun.",
  }[lesson.id]), [lesson.id]);

  return <div className="mt-3 space-y-3 rounded border border-retro-blue/25 bg-void/45 p-3">
    <p className="type-data text-[.58rem] uppercase tracking-[.12em] text-retro-blue">Interactive example · adjust and observe</p>
    <p className="text-sm leading-relaxed text-bone">{lead}</p>

    {lesson.id === "pick-site" && <>
      <label className="block text-xs text-muted-foreground">Moon stop
        <select className={fieldClass} value={site?.id ?? siteId} onChange={(event) => {
          const next = stops.find((item) => item.id === event.target.value);
          if (next) { setSiteId(next.id); selectSite(next, false); }
        }}>
          {stops.map((item) => <option key={item.id} value={item.id}>{stopTitle(item)}</option>)}
        </select>
      </label>
      {site && <><div className="overflow-hidden border border-retro-purple/35"><SitePreview site={site} compact /></div>
        <p className="text-xs leading-relaxed text-muted-foreground">{siteNote ?? "A reference point for exploring the Moon."}</p></>}
    </>}

    {lesson.id === "overlays" && <>
      <label className="block text-xs text-muted-foreground">Lander slope tolerance <span className="text-bone">{slopeLimit}°</span>
        <input className="mt-2 w-full accent-[#a78bfa]" type="range" min="2" max="20" step="1" value={slopeLimit} onChange={(event) => setSlopeLimit(Number(event.target.value))} aria-label="Lander slope tolerance in degrees" />
      </label>
      <div className="relative flex h-3 overflow-hidden rounded" role="img" aria-label="Illustrative terrain risk bands from gentler to steeper">
        <span className="w-1/3 bg-retro-blue/80" /><span className="w-1/3 bg-retro-purple/70" /><span className="w-1/3 bg-retro-red/75" />
        <span className="absolute -top-1 h-5 w-0.5 bg-white shadow-[0_0_6px_white]" style={{ left: `${((slopeLimit - 2) / 18) * 100}%` }} />
      </div>
      <p className="text-xs leading-relaxed text-bone">{slopeLimit < 8 ? "A strict limit favors flatter ground and fewer landing options." : slopeLimit > 14 ? "A higher limit opens more ground, but steep slopes raise landing risk." : "A middle limit balances safer ground with more places to consider."}</p>
      <p className="text-[.65rem] leading-relaxed text-muted-foreground">Concept demo only. The slider is not a measured slope at your selected site; use the map’s terrain layer to inspect actual mapped data.</p>
    </>}

    {(lesson.id === "sun" || lesson.id === "earth") && <>
      <label className="block text-xs text-muted-foreground">Mission hour <span className="text-bone">{sampleIndex} h</span>
        <input className="mt-2 w-full accent-[#a78bfa]" type="range" min="0" max={maxHour} step="1" value={sampleIndex} onChange={(event) => setElapsed(Number(event.target.value))} aria-label="Mission hour" />
      </label>
      {window.loading && <p className="text-xs text-muted-foreground">Loading lunar sky and terrain data…</p>}
      {sample && <div className="grid grid-cols-2 gap-2">
        {lesson.id === "sun" ? <>
          <Readout label="Sun above horizon" value={sunUp(sample) ? "Visible" : "Blocked"} />
          <Readout label="Sun / terrain" value={`${sample.sunEl.toFixed(1)}° / ${sample.sunHorizon.toFixed(1)}°`} />
        </> : <>
          <Readout label="Earth above horizon" value={earthUp(sample) ? "Visible" : "Blocked"} />
          <Readout label="Earth / terrain" value={`${sample.earthEl.toFixed(1)}° / ${sample.earthHorizon.toFixed(1)}°`} />
        </>}
      </div>}
      {window.error && <p className="text-xs text-retro-red">Site data unavailable for this time.</p>}
      <p className="text-[.65rem] leading-relaxed text-muted-foreground">The horizon comparison shows whether the body clears the modeled local terrain; radio hardware and weather are not included.</p>
    </>}

    {lesson.id === "candidates" && <CandidateComparison sites={candidates} />}

    {lesson.id === "surface" && <>
      <label className="block text-xs text-muted-foreground">Ridge height <span className="text-bone">{ridgeHeight} m</span>
        <input className="mt-2 w-full accent-[#a78bfa]" type="range" min="0" max="800" step="25" value={ridgeHeight} onChange={(event) => setRidgeHeight(Number(event.target.value))} aria-label="Illustrative ridge height in meters" />
      </label>
      <label className="block text-xs text-muted-foreground">Distance from ridge <span className="text-bone">{distance} km</span>
        <input className="mt-2 w-full accent-[#a78bfa]" type="range" min="0.5" max="10" step="0.5" value={distance} onChange={(event) => setDistance(Number(event.target.value))} aria-label="Illustrative distance from ridge in kilometers" />
      </label>
      <Readout label="Ridge angle at horizon" value={`${ridgeAngle.toFixed(1)}°`} />
      <p className="text-xs leading-relaxed text-bone">{ridgeAngle > 5 ? "This ridge could hide a low Sun from a nearby rover." : "The ridge is low in this view; a low Sun is more likely to remain visible."}</p>
      <p className="text-[.65rem] leading-relaxed text-muted-foreground">Simple geometry demo, not a measurement of the illustrated 3D terrain.</p>
    </>}
  </div>;
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-line bg-void/70 p-2"><p className="type-data text-[.55rem] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 type-data text-sm text-bone">{value}</p></div>;
}
