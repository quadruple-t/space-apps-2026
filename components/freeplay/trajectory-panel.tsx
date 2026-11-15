"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { DEFAULT_ISP_S, DEFAULT_PAYLOAD_KG, TRAJECTORY_LABELS, type TrajectoryType } from "@/lib/engine/deltav";
import { artemisReference } from "@/lib/engine/artemis-reference";
import { estimateMission } from "@/lib/engine/mission-estimate";
import { formatUsdRange } from "@/lib/engine/launch-costs";
import { MAX_TRANSIT_DAYS, planTrajectory, sunriseAlignment, type MoonState, type TrajectoryPlan } from "@/lib/engine/trajectory";
import { COVERAGE_END_ISO, COVERAGE_START_ISO, useFreeplay } from "@/lib/freeplay-store";
import { orbitGeometry } from "@/lib/orbit";
import { sunUp } from "@/lib/illumination";
import { useLunarWindow } from "@/lib/use-lunar-data";

const DAY_MS = 86_400_000;
const TYPES: { id: TrajectoryType; blurb: string }[] = [
  { id: "direct", blurb: "Apollo-style, about 3 to 5 days" },
  { id: "low-energy", blurb: "Long loop, about 1 to 4 months, cheaper insertion" },
];

/** Plan, mass/cost estimate and sunrise check for the launch window chosen in the store. */
export function useTrajectory(site: FreeplaySite) {
  const launchIso = useFreeplay((s) => s.launchIso);
  const type = useFreeplay((s) => s.trajectoryType);
  const payloadKg = useFreeplay((s) => s.payloadKg);
  const ispS = useFreeplay((s) => s.ispS);
  const showArtemis = useFreeplay((s) => s.showArtemisReference);

  const launchMs = Date.parse(launchIso);
  // Start a month early so the previous local sunrise is in the data; end a month after the longest arrival.
  const windowStartMs = Math.max(Date.parse(COVERAGE_START_ISO), launchMs - 31 * DAY_MS);
  const windowHours = (launchMs - windowStartMs) / 3_600_000 + (MAX_TRANSIT_DAYS[type] + 31) * 24;
  const win = useLunarWindow(site, new Date(windowStartMs).toISOString(), windowHours);

  const estimate = useMemo(() => estimateMission(type, payloadKg, ispS), [type, payloadKg, ispS]);
  const planned = useMemo(() => {
    if (!win.data) return null;
    const { series, samples } = win.data;
    const moonAt = (t: number): MoonState | null => {
      if (!series.covers(t)) return null;
      const { sun, earth } = series.at(t);
      const { moon } = orbitGeometry(sun, earth, 0, 0);
      return { distanceKm: Math.hypot(moon.x, moon.y), angleRad: Math.atan2(moon.y, moon.x) };
    };
    const plan = planTrajectory(type, launchMs, moonAt);
    if (!plan) return { plan: null, alignment: null };
    return { plan, alignment: sunriseAlignment(samples.map((s) => ({ t: s.t, sunUp: sunUp(s) })), plan.arrivalMs) };
  }, [win.data, type, launchMs]);

  const plan: TrajectoryPlan | null = planned?.plan ?? null;
  const artemis = useMemo(() => (plan && showArtemis ? artemisReference(plan.arrivalAngleRad) : null), [plan, showArtemis]);
  return {
    plan, artemis, estimate, alignment: planned?.alignment ?? null, loading: win.loading, error: win.error,
    outOfCoverage: !!win.data && planned !== null && plan === null,
  };
}

export type TrajectoryState = ReturnType<typeof useTrajectory>;

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtTransit = (s: number) => {
  const d = s / 86_400;
  return d < 10 ? `${Math.floor(d)} d ${Math.round((d % 1) * 24)} h` : `${d.toFixed(0)} days (about ${(d / 30.44).toFixed(1)} months)`;
};
const fmtKg = (kg: number) => (kg >= 10_000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg).toLocaleString("en-US")} kg`);

export function TrajectoryPanel({ state, site, onSyncTimeline }: { state: TrajectoryState; site: FreeplaySite; onSyncTimeline: (plan: TrajectoryPlan) => void }) {
  const launchIso = useFreeplay((s) => s.launchIso);
  const type = useFreeplay((s) => s.trajectoryType);
  const payloadKg = useFreeplay((s) => s.payloadKg);
  const ispS = useFreeplay((s) => s.ispS);
  const showArtemis = useFreeplay((s) => s.showArtemisReference);
  const { setLaunch, setTrajectoryType, setPayloadKg, setIsp, setShowArtemisReference } = useFreeplay.getState();
  const { plan, estimate, alignment, artemis } = state;
  const { budget, cost } = estimate;

  return <section className="hud-panel p-4 sm:p-5" aria-label="Launch window and trajectory estimate">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="type-heading flex items-center gap-2 text-lg text-bone"><Rocket size={18} className="text-retro-purple" aria-hidden />Launch window</h2>
        <p className="mt-1 text-sm text-muted-foreground">Earth to {site.name}: path, fuel and a rough launch cost.</p>
      </div>
      <span className="rounded border border-retro-red/50 px-1.5 py-0.5 type-data text-[0.56rem] uppercase tracking-[0.14em] text-bone">Approximate · estimate</span>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm text-muted-foreground">Launch date (UTC)
        <input type="date" value={launchIso.slice(0, 10)} min={COVERAGE_START_ISO.slice(0, 10)} max={COVERAGE_END_ISO.slice(0, 10)}
          onChange={(e) => { if (e.target.value) setLaunch(`${e.target.value}T00:00:00.000Z`); }}
          className="min-h-10 rounded-md border border-line bg-void px-2 text-bone" />
      </label>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm text-muted-foreground">Trajectory type</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => <label key={t.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-retro-purple ${type === t.id ? "border-retro-purple/60 bg-retro-purple/15 text-bone" : "border-line text-muted-foreground hover:text-bone"}`} title={t.blurb}>
            <input type="radio" name="trajectory-type" className="sr-only" checked={type === t.id} onChange={() => setTrajectoryType(t.id)} />
            {TRAJECTORY_LABELS[t.id]}
          </label>)}
        </div>
      </fieldset>
      <label className="grid gap-1 text-sm text-muted-foreground">Landed dry mass (kg)
        <input type="number" inputMode="decimal" min={1} max={100000} step={50} value={payloadKg} onChange={(e) => setPayloadKg(Number(e.target.value))} className="min-h-10 rounded-md border border-line bg-void px-2 text-bone" />
        <span className="text-xs">Default {DEFAULT_PAYLOAD_KG} kg, a small lander.</span>
      </label>
      <label className="grid gap-1 text-sm text-muted-foreground">Engine specific impulse, Isp (s)
        <input type="number" inputMode="decimal" min={100} max={500} step={1} value={ispS} onChange={(e) => setIsp(Number(e.target.value))} className="min-h-10 rounded-md border border-line bg-void px-2 text-bone" />
        <span className="text-xs">Default {DEFAULT_ISP_S} s, Apollo descent engine.</span>
      </label>
    </div>

    <div className="mt-4 border-t border-line/80 pt-4" aria-live="polite">
      {state.error && <p role="alert" className="text-sm text-destructive">Couldn&apos;t load the Moon&apos;s position: {state.error}</p>}
      {state.loading && <p className="type-data animate-pulse text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">Aiming at the Moon…</p>}
      {state.outOfCoverage && <p className="text-sm text-muted-foreground">The Moon&apos;s stored positions end on 31 December 2030, so this launch would arrive too late to plot. Pick an earlier date.</p>}
      {plan && <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Launch to arrival</dt><dd className="type-data text-bone">{fmtDate(plan.launchMs)} → {fmtDate(plan.arrivalMs)}</dd></div>
        <div><dt className="text-muted-foreground">Transit time</dt><dd className="type-data text-bone">{fmtTransit(plan.transitSeconds)}</dd></div>
      </dl>}
      {plan && <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onSyncTimeline(plan)} className="min-h-10 rounded-md border border-line px-3 text-sm text-muted-foreground hover:text-bone">Set timeline to this transit</button>
        <label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showArtemis} onChange={(e) => setShowArtemisReference(e.target.checked)} className="size-4 accent-[#a986ff]" />
          Overlay Artemis I (JPL Horizons)
        </label>
      </div>}
      {artemis && plan && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Artemis I (shape only, rotated to meet the Moon at its flyby) reached the Moon {fmtTransit(artemis.hoursToFlyby * 3600)} after its trans-lunar burn, passing {Math.round(artemis.flybyAltitudeKm)} km above the surface. Our {TRAJECTORY_LABELS[plan.type].toLowerCase()} arc is a simple two-body approximation: {fmtTransit(plan.transitSeconds)}. The two are different mission profiles, so expect different transit times.
      </p>}

      <h3 className="type-heading mt-5 text-base text-bone">Fuel budget</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-sm">
          <caption className="sr-only">Delta-v per phase for the {TRAJECTORY_LABELS[type]}</caption>
          <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-1 pr-2 font-normal">Phase</th><th scope="col" className="py-1 pr-2 text-right font-normal">Delta-v</th><th scope="col" className="py-1 text-right font-normal">Propellant</th></tr></thead>
          <tbody>
            {budget.phases.map((p, i) => <tr key={p.id} className="border-t border-line/60">
              <th scope="row" className="py-1.5 pr-2 font-normal text-bone">{p.label}</th>
              <td className="type-data py-1.5 pr-2 text-right tabular-nums text-bone">{p.kmS.toFixed(2)} km/s<span className="block text-[0.6rem] text-muted-foreground">range {p.lowKmS.toFixed(2)} to {p.highKmS.toFixed(2)}</span></td>
              <td className="type-data py-1.5 text-right tabular-nums text-bone">{fmtKg(estimate.phasePropellantKg[i])}</td>
            </tr>)}
          </tbody>
          <tfoot><tr className="border-t border-line">
            <th scope="row" className="py-1.5 pr-2 text-bone">Total</th>
            <td className="type-data py-1.5 pr-2 text-right font-medium tabular-nums text-bone">{budget.totalKmS.toFixed(2)} km/s</td>
            <td className="type-data py-1.5 text-right font-medium tabular-nums text-bone">{fmtKg(estimate.propellantKg)}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">To land {fmtKg(payloadKg)} you need about <span className="text-bone">{fmtKg(estimate.propellantKg)}</span> of propellant and <span className="text-bone">{fmtKg(estimate.leoMassKg)}</span> in low Earth orbit (about {fmtKg(estimate.leoMassRangeKg.low)} to {fmtKg(estimate.leoMassRangeKg.high)} across the delta-v range).</p>

      <h3 className="type-heading mt-5 text-base text-bone">Launch cost (estimate)</h3>
      {cost
        ? <p className="mt-2 text-sm text-muted-foreground"><span className="type-data text-base text-bone">{formatUsdRange(cost.lowUsd, cost.highUsd)}</span> on a {cost.launchClass.label.toLowerCase()} ({cost.launchClass.reference}). Low end: a pro-rata share of one launch. High end: a whole dedicated launch at list price. Excludes the spacecraft, operations and insurance.</p>
        : <p className="mt-2 text-sm text-muted-foreground">More than {fmtKg(63_800)} in low Earth orbit is beyond the largest single launcher in our table, so no cost range is given.</p>}

      <h3 className="type-heading mt-5 text-base text-bone">Lighting at arrival</h3>
      {alignment
        ? <p className={`mt-2 rounded-md border px-3 py-2 text-sm ${alignment.nearSunrise ? "border-retro-red/50 bg-retro-red/10 text-bone" : "border-line text-muted-foreground"}`}>
            <span className="type-data mr-2 text-[0.62rem] uppercase tracking-[0.12em]">{alignment.nearSunrise ? "Near local sunrise" : "Not near sunrise"}</span>
            {alignment.summary} Near means within 3 days of a local sunrise at {site.name}.
          </p>
        : <p className="mt-2 text-sm text-muted-foreground">{plan ? "Sunrise timing isn't available for this date." : "Waiting for the arrival date."}</p>}

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Approximations, not mission design: each path is one Earth two-body arc aimed at the Moon&apos;s position at arrival (no lunar gravity, no Sun perturbation, no n-body). The low-energy loop is illustrative. Delta-v and prices come from published figures explained on the <Link className="text-retro-blue underline" href="/how-it-works#trajectory-method">Methods page</Link> and are rough, not quotes. Arrival uses the stored JPL Horizons Moon positions.
      </p>
    </div>
  </section>;
}
