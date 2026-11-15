"use client";

/**
 * Applies a validated show_in_freeplay plan to the Freeplay store, and snapshots/restores the view so the
 * user can undo what the assistant changed. The model only ever supplies whitelisted fields (see
 * tool-validation.ts); everything here goes through the same store actions the Freeplay UI itself uses.
 */
import { catalogToFreeplay, type CatalogSite, type FreeplaySite } from "@/data/sites";
import { useComparison, type GraphFocus, type SlotId } from "@/lib/comparison-store";
import { driveHref } from "@/lib/drive-link";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { UI_LAYER_LABELS, UI_TRAJECTORY_TYPES } from "./constants";
import type { UiChange } from "./tool-results";
import type { UiPlan } from "./tool-validation";

const HOUR_MS = 3_600_000;
const SCREEN_NAMES = {
  globe: "Showing the Moon globe",
  orbit: "Showing Orbit + Graphs",
  launch: "Showing the Launch window planner",
  compare: "Showing Mission comparison",
} as const;
const TRAJECTORY_NAMES: Record<(typeof UI_TRAJECTORY_TYPES)[number], string> = {
  direct: "Direct transfer",
  "low-energy": "Low-energy transfer",
};

type FreeplayState = ReturnType<typeof useFreeplay.getState>;
type ComparisonState = ReturnType<typeof useComparison.getState>;
export type ViewSnapshot = Pick<FreeplayState,
  "view" | "site" | "calloutOpen" | "startIso" | "durationHours" | "elapsedHours" | "playing" | "speed" | "layers" | "showCatalog" | "graphTab" |
  "launchIso" | "trajectoryType" | "payloadKg" | "ispS" | "showArtemisReference" | "meteorStream" | "panelAreaM2" | "panelEfficiency">
  & { comparison: Pick<ComparisonState, "slotA" | "slotB" | "metrics" | "graphFocus"> };

export function captureView(): ViewSnapshot {
  const s = useFreeplay.getState();
  const c = useComparison.getState();
  return {
    view: s.view, site: s.site, calloutOpen: s.calloutOpen, startIso: s.startIso, durationHours: s.durationHours,
    elapsedHours: s.elapsedHours, playing: s.playing, speed: s.speed, layers: s.layers, showCatalog: s.showCatalog, graphTab: s.graphTab,
    launchIso: s.launchIso, trajectoryType: s.trajectoryType, payloadKg: s.payloadKg, ispS: s.ispS, showArtemisReference: s.showArtemisReference,
    meteorStream: s.meteorStream, panelAreaM2: s.panelAreaM2, panelEfficiency: s.panelEfficiency,
    comparison: { slotA: c.slotA, slotB: c.slotB, metrics: c.metrics, graphFocus: c.graphFocus },
  };
}

export function restoreView(snapshot: ViewSnapshot) {
  const { comparison, ...freeplay } = snapshot;
  useFreeplay.setState(freeplay);
  const c = useComparison.getState();
  if (comparison.slotA !== c.slotA || comparison.slotB !== c.slotB) {
    c.setSlot("a", comparison.slotA);
    c.setSlot("b", comparison.slotB);
  }
  if (comparison.metrics !== c.metrics) c.setMetrics(comparison.metrics);
  if (comparison.graphFocus !== c.graphFocus) c.setFocus(comparison.graphFocus);
  if (snapshot.site) useFreeplay.getState().requestFocus();
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtTime = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

/** Saved presets are matched by id so a renamed preset shows its new name. */
function savedById(id: string | undefined): FreeplaySite | null {
  return id ? useFreeplay.getState().savedSites.find((s) => s.id === id) ?? null : null;
}

export function applyUiPlan(plan: UiPlan, catalog: CatalogSite | null): UiChange {
  const f = useFreeplay.getState();
  const c = useComparison.getState();
  const changes: string[] = [];

  // Comparison slots and graph choices only exist on that screen, so asking for them shows it.
  const comparisonRequested = plan.compareSiteA !== undefined || plan.compareSiteB !== undefined
    || plan.compareGraph !== undefined || plan.compareMetrics !== undefined;

  // Which screen: an explicit choice wins; otherwise graphs live on orbit and layers/pins on the globe.
  const implied = plan.graphTab ? "orbit"
    : comparisonRequested ? "compare"
      : plan.launchTimeIso || plan.trajectoryType || plan.payloadKg !== undefined || plan.ispS !== undefined || plan.showArtemisReference !== undefined ? "launch"
        : plan.layersOn || plan.layersOff || plan.showCatalog !== undefined || plan.meteorStream !== undefined ? "globe"
          : undefined;
  const screen = plan.screen ?? implied;
  if (screen && screen !== f.view) { f.setView(screen); changes.push(SCREEN_NAMES[screen]); }

  let site: FreeplaySite | null = null;
  if (catalog) site = catalogToFreeplay(catalog, f.site?.radiusKm ?? 5);
  else if (plan.savedSiteId) site = savedById(plan.savedSiteId);
  if (site) f.selectSite(site, true);
  else if (plan.point) { f.selectCustom(plan.point.latDeg, plan.point.lonDeg); site = useFreeplay.getState().site; }
  if (site) { f.requestFocus(); changes.push(`Selected ${site.name} (${site.latitudeDeg.toFixed(2)}°, ${site.longitudeDeg.toFixed(2)}°E)`); }
  if (plan.radiusKm !== undefined) { f.setRadius(plan.radiusKm); changes.push(`Analysis radius ${plan.radiusKm} km`); }

  if (plan.durationHours !== undefined) { f.setDuration(plan.durationHours); changes.push(`Mission window ${plan.durationHours} h`); }
  if (plan.timeIso) {
    const t = Date.parse(plan.timeIso), start = Date.parse(useFreeplay.getState().startIso);
    if (t >= start && t <= start + useFreeplay.getState().durationHours * HOUR_MS) f.setElapsed((t - start) / HOUR_MS);
    else f.setStart(plan.timeIso);
    f.setPlaying(false);
    changes.push(`Set mission time to ${fmtTime(plan.timeIso)}`);
  }
  if (plan.speed !== undefined) { f.setSpeed(plan.speed); changes.push(`Playback speed ${plan.speed}×`); }
  if (plan.playing !== undefined) {
    if (plan.playing && prefersReducedMotion()) changes.push("Left the clock paused because reduced motion is on");
    else { f.setPlaying(plan.playing); changes.push(plan.playing ? "Playing the mission clock" : "Paused the mission clock"); }
  }
  for (const id of plan.layersOn ?? []) { f.setLayer(id, { on: true }); changes.push(`${UI_LAYER_LABELS[id]} layer on`); }
  for (const id of plan.layersOff ?? []) { f.setLayer(id, { on: false }); changes.push(`${UI_LAYER_LABELS[id]} layer off`); }
  if (plan.showCatalog !== undefined) { f.setShowCatalog(plan.showCatalog); changes.push(plan.showCatalog ? "Catalog site pins shown" : "Catalog site pins hidden"); }
  if (plan.graphTab) { f.setGraphTab(plan.graphTab); changes.push(`${plan.graphTab === "daily" ? "Daily" : "Yearly"} graph tab`); }
  if (plan.meteorStream) { f.setMeteorStream(plan.meteorStream); changes.push(`Meteor stream ${plan.meteorStream} selected`); }

  if (plan.panelAreaM2 !== undefined || plan.panelEfficiency !== undefined) {
    f.setPanel(plan.panelAreaM2 ?? f.panelAreaM2, plan.panelEfficiency ?? f.panelEfficiency);
    const now = useFreeplay.getState();
    changes.push(`Solar panel ${now.panelAreaM2} m² at ${Math.round(now.panelEfficiency * 100)}% efficiency`);
  }

  if (plan.launchTimeIso) { f.setLaunch(plan.launchTimeIso); changes.push(`Launch time ${fmtTime(plan.launchTimeIso)}`); }
  if (plan.trajectoryType) { f.setTrajectoryType(plan.trajectoryType); changes.push(`${TRAJECTORY_NAMES[plan.trajectoryType]} trajectory`); }
  if (plan.payloadKg !== undefined) { f.setPayloadKg(plan.payloadKg); changes.push(`Landed payload ${useFreeplay.getState().payloadKg} kg`); }
  if (plan.ispS !== undefined) { f.setIsp(plan.ispS); changes.push(`Specific impulse ${useFreeplay.getState().ispS} s`); }
  if (plan.showArtemisReference !== undefined) {
    f.setShowArtemisReference(plan.showArtemisReference);
    changes.push(plan.showArtemisReference ? "Artemis I reference shown" : "Artemis I reference hidden");
  }

  if (comparisonRequested) {
    c.hydrate();
    const slots: Array<[SlotId, string | undefined]> = [["a", plan.compareSiteA], ["b", plan.compareSiteB]];
    for (const [slot, id] of slots) {
      if (id === undefined) continue;
      const preset = savedById(id);
      if (!preset) continue; // deleted since the model saw the list
      useComparison.getState().setSlot(slot, preset);
      changes.push(`Comparison site ${slot.toUpperCase()} · ${preset.name}`);
    }
    if (plan.compareGraph) {
      const labels: Record<GraphFocus, string> = { sunlight: "Sun elevation", earth: "Earth visibility", power: "solar power" };
      useComparison.getState().setFocus(plan.compareGraph);
      changes.push(`Comparison graph · ${labels[plan.compareGraph]}`);
    }
    if (plan.compareMetrics) {
      useComparison.getState().setMetrics(plan.compareMetrics);
      changes.push(`Comparison table · ${plan.compareMetrics.length} metric${plan.compareMetrics.length === 1 ? "" : "s"} tracked`);
    }
  }

  let link: UiChange["link"];
  if (plan.page) {
    const now = useFreeplay.getState();
    if (!now.site) changes.push("No site is selected, so no drive page link was made");
    else {
      const t = currentTimeMs(now);
      link = { label: `Open surface drive at ${now.site.name}`, href: driveHref(now.site, t) };
    }
  }
  return { changes, ...(link ? { link } : {}) };
}
