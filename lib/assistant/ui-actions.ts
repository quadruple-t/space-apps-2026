"use client";

/**
 * Applies a validated show_in_freeplay plan to the Open Exploration store, and snapshots/restores the view so the
 * user can undo what the assistant changed. The model only ever supplies whitelisted fields (see
 * tool-validation.ts); everything here goes through the same store actions the Open Exploration UI itself uses.
 */
import { catalogToFreeplay, type CatalogSite, type FreeplaySite } from "@/data/sites";
import { driveHref } from "@/lib/drive-link";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import type { UiChange } from "./tool-results";
import type { UiPlan } from "./tool-validation";

const LAYER_NAMES = { slope: "Slope", illumination: "Illumination", psr: "Permanently shadowed regions", elevation: "Elevation" } as const;
const HOUR_MS = 3_600_000;

type FreeplayState = ReturnType<typeof useFreeplay.getState>;
export type ViewSnapshot = Pick<FreeplayState, "view" | "site" | "calloutOpen" | "startIso" | "elapsedHours" | "playing" | "speed" | "layers" | "showCatalog" | "graphTab">;

export function captureView(): ViewSnapshot {
  const s = useFreeplay.getState();
  return { view: s.view, site: s.site, calloutOpen: s.calloutOpen, startIso: s.startIso, elapsedHours: s.elapsedHours, playing: s.playing, speed: s.speed, layers: s.layers, showCatalog: s.showCatalog, graphTab: s.graphTab };
}

export function restoreView(snapshot: ViewSnapshot) {
  useFreeplay.setState(snapshot);
  if (snapshot.site) useFreeplay.getState().requestFocus();
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtTime = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

export function applyUiPlan(plan: UiPlan, catalog: CatalogSite | null): UiChange {
  const f = useFreeplay.getState();
  const changes: string[] = [];

  // Which screen: an explicit choice wins; otherwise graphs live on orbit and layers/pins on the globe.
  const implied = plan.graphTab ? "orbit" : plan.layersOn || plan.layersOff || plan.showCatalog !== undefined ? "globe" : undefined;
  const screen = plan.screen ?? implied;
  if (screen && screen !== f.view) { f.setView(screen); changes.push(screen === "globe" ? "Showing the Moon globe" : "Showing Orbit + Graphs"); }

  let site: FreeplaySite | null = null;
  if (catalog) site = catalogToFreeplay(catalog, f.site?.radiusKm ?? 5);
  if (site) f.selectSite(site, true);
  else if (plan.point) { f.selectCustom(plan.point.latDeg, plan.point.lonDeg); site = useFreeplay.getState().site; }
  if (site) { f.requestFocus(); changes.push(`Selected ${site.name} (${site.latitudeDeg.toFixed(2)}°, ${site.longitudeDeg.toFixed(2)}°E)`); }

  if (plan.timeIso) {
    const t = Date.parse(plan.timeIso), start = Date.parse(f.startIso);
    if (t >= start && t <= start + f.durationHours * HOUR_MS) f.setElapsed((t - start) / HOUR_MS);
    else f.setStart(plan.timeIso);
    f.setPlaying(false);
    changes.push(`Set mission time to ${fmtTime(plan.timeIso)}`);
  }
  if (plan.speed !== undefined) { f.setSpeed(plan.speed); changes.push(`Playback speed ${plan.speed}×`); }
  if (plan.playing !== undefined) {
    if (plan.playing && prefersReducedMotion()) changes.push("Left the clock paused because reduced motion is on");
    else { f.setPlaying(plan.playing); changes.push(plan.playing ? "Playing the mission clock" : "Paused the mission clock"); }
  }
  for (const id of plan.layersOn ?? []) { f.setLayer(id, { on: true }); changes.push(`${LAYER_NAMES[id]} layer on`); }
  for (const id of plan.layersOff ?? []) { f.setLayer(id, { on: false }); changes.push(`${LAYER_NAMES[id]} layer off`); }
  if (plan.showCatalog !== undefined) { f.setShowCatalog(plan.showCatalog); changes.push(plan.showCatalog ? "Catalog site pins shown" : "Catalog site pins hidden"); }
  if (plan.graphTab) { f.setGraphTab(plan.graphTab); changes.push(`${plan.graphTab === "daily" ? "Daily" : "Yearly"} graph tab`); }

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
