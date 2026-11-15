"use client";

/**
 * Browser-side heavy estimates for the Mission Control tools. The tools stay pure and testable
 * (lib/assistant/tools.ts takes these as injected deps); this module does the fetching and maths with
 * the same code the Launch window planner, graphs and Mission comparison screens use, so the assistant
 * cannot quote a number the app would not show.
 */
import { buildTimeline, sunUp } from "@/lib/illumination";
import { estimateMission } from "@/lib/engine/mission-estimate";
import { artemisReference } from "@/lib/engine/artemis-reference";
import { MAX_TRANSIT_DAYS, planTrajectory, sunriseAlignment, type MoonState } from "@/lib/engine/trajectory";
import { orbitGeometry } from "@/lib/orbit";
import { fetchCatalogSites, fetchTerrainHorizon, loadEphemeris, MAIN_SERIES_END, MAIN_SERIES_START, siteSamples, type SiteRef } from "@/lib/lunar-data";
import type { LaunchPlanData, PowerEstimateData } from "./tool-results";
import type { LaunchPlanInput, SolarPowerInput } from "./tools";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SERIES_START_MS = Date.parse(MAIN_SERIES_START);
const SERIES_END_MS = Date.parse(MAIN_SERIES_END);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Catalog ids need their verified point before sky samples can be computed. */
async function siteRef(location: SolarPowerInput["location"]): Promise<SiteRef | null> {
  if (location.kind === "point") return { latitudeDeg: location.latDeg, longitudeDeg: location.lonDeg };
  const sites = await fetchCatalogSites();
  const site = sites.find((s) => s.id === location.siteId);
  if (!site || typeof site.latDeg !== "number" || typeof site.lonDeg !== "number") return null;
  return { catalogId: location.siteId, latitudeDeg: site.latDeg, longitudeDeg: site.lonDeg };
}

/**
 * Plans the transfer the Launch window screen shows: the ephemeris-backed Moon position at arrival,
 * the rocket-equation estimate and the local sunrise check at the selected site.
 */
export async function planLaunch(input: LaunchPlanInput): Promise<LaunchPlanData | null> {
  try {
    const launchMs = Date.parse(input.launchIso);
    if (!Number.isFinite(launchMs)) return null;
    // Start a month early so the previous local sunrise is in the data; end a month after the longest arrival.
    const windowStartMs = clamp(launchMs - 31 * DAY_MS, SERIES_START_MS, SERIES_END_MS);
    const windowEndMs = clamp(launchMs + (MAX_TRANSIT_DAYS[input.trajectoryType] + 31) * 24 * HOUR_MS, SERIES_START_MS, SERIES_END_MS);
    if (windowEndMs <= windowStartMs) return null;

    const site: SiteRef = { catalogId: input.site.catalogPointVerified === false ? undefined : input.site.catalogId, latitudeDeg: input.site.latitudeDeg, longitudeDeg: input.site.longitudeDeg };
    const [series, horizon] = await Promise.all([
      loadEphemeris(new Date(windowStartMs).toISOString(), new Date(windowEndMs).toISOString()),
      fetchTerrainHorizon(site),
    ]);
    const samples = siteSamples(series, site, horizon, windowStartMs, windowEndMs);

    const moonAt = (tMs: number): MoonState | null => {
      if (!series.covers(tMs)) return null;
      const { sun, earth } = series.at(tMs);
      const { moon } = orbitGeometry(sun, earth, 0, 0);
      return { distanceKm: Math.hypot(moon.x, moon.y), angleRad: Math.atan2(moon.y, moon.x) };
    };
    const plan = planTrajectory(input.trajectoryType, launchMs, moonAt);

    const estimate = estimateMission(input.trajectoryType, input.payloadKg, input.ispS);
    const alignment = plan ? sunriseAlignment(samples.map((s) => ({ t: s.t, sunUp: sunUp(s) })), plan.arrivalMs) : null;
    const artemis = plan && input.includeArtemisReference
      ? (() => { const r = artemisReference(plan.arrivalAngleRad); return { hoursToFlyby: r.hoursToFlyby, flybyAltitudeKm: r.flybyAltitudeKm }; })()
      : null;

    return {
      plan: plan ? {
        launchIso: new Date(plan.launchMs).toISOString(),
        arrivalIso: new Date(plan.arrivalMs).toISOString(),
        transitHours: plan.transitSeconds / 3_600,
        arrivalDistanceKm: plan.arrivalDistanceKm,
        apogeeKm: plan.apogeeKm,
        eccentricity: plan.eccentricity,
        alignment: alignment ? {
          sunUpAtArrival: alignment.sunUpAtArrival,
          hoursSincePrevSunrise: alignment.hoursSincePrevSunrise,
          hoursUntilNextSunrise: alignment.hoursUntilNextSunrise,
          nearSunrise: alignment.nearSunrise,
          summary: alignment.summary,
        } : null,
      } : null,
      outOfCoverage: plan === null,
      estimate: {
        totalKmS: estimate.budget.totalKmS,
        totalLowKmS: estimate.budget.totalLowKmS,
        totalHighKmS: estimate.budget.totalHighKmS,
        phases: estimate.budget.phases.map((p) => ({ id: p.id, label: p.label, kmS: p.kmS, lowKmS: p.lowKmS, highKmS: p.highKmS })),
        propellantKg: estimate.propellantKg,
        leoMassKg: estimate.leoMassKg,
        leoMassRangeKg: estimate.leoMassRangeKg,
        cost: estimate.cost ? {
          lowUsd: estimate.cost.lowUsd, highUsd: estimate.cost.highUsd,
          classLabel: estimate.cost.launchClass.label, reference: estimate.cost.launchClass.reference,
        } : null,
      },
      artemis,
    };
  } catch {
    return null;
  }
}

/** The same flat-panel model the graphs and Mission comparison use, summarised over the window. */
export async function estimatePower(input: SolarPowerInput): Promise<PowerEstimateData | null> {
  try {
    const startMs = Date.parse(input.startIso);
    if (!Number.isFinite(startMs)) return null;
    const endMs = clamp(startMs + input.durationHours * HOUR_MS, SERIES_START_MS, SERIES_END_MS);
    if (endMs <= startMs) return null;
    const site = await siteRef(input.location);
    if (!site) return null;
    const [series, horizon] = await Promise.all([
      loadEphemeris(new Date(startMs).toISOString(), new Date(endMs).toISOString()),
      fetchTerrainHorizon(site),
    ]);
    const samples = siteSamples(series, site, horizon, startMs, endMs);
    if (!samples.length) return null;

    const timeline = buildTimeline(samples, 1, "horizontal");
    const last = samples.length - 1;
    const energyKWh = timeline.cumEnergyKWh[last] * input.panelAreaM2 * input.panelEfficiency;
    const hours = samples.length;
    let peakW = 0;
    for (const s of samples) {
      const w = sunUp(s) ? input.panelAreaM2 * input.panelEfficiency * 1361 * Math.sin((s.sunEl * Math.PI) / 180) : 0;
      if (w > peakW) peakW = w;
    }
    return {
      peakW,
      meanW: (energyKWh * 1000) / hours,
      energyKWh,
      litSharePercent: (timeline.cumSunHours[last] / hours) * 100,
      hours,
      horizonSource: horizon.source,
      startIso: new Date(samples[0].t).toISOString(),
      endIso: new Date(samples[samples.length - 1].t).toISOString(),
      panelAreaM2: input.panelAreaM2,
      panelEfficiency: input.panelEfficiency,
    };
  } catch {
    return null;
  }
}
