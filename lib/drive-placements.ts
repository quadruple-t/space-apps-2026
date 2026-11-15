import type { SurfaceObjectType } from "@/scenes/lunar/surface-objects";

/** One object the user placed in the surface drive, in metres east/north of the site centre. */
export type Placement = { id: string; type: SurfaceObjectType; eastM: number; northM: number; headingDeg: number };

const STORAGE_KEY = "lunaris360-drive-placements-v1";
const TYPES = new Set<string>(["solar", "rover", "dome", "modules", "inflatable", "comms"]);
export const MAX_PLACEMENTS = 200;

/** Placements belong to a site centre, so they survive radius changes and reloads. */
export const placementSiteKey = (latDeg: number, lonDeg: number) => `${latDeg.toFixed(4)},${(((lonDeg % 360) + 360) % 360).toFixed(4)}`;

function isPlacement(value: unknown): value is Placement {
  const p = value as Placement;
  return !!p && typeof p.id === "string" && TYPES.has(p.type)
    && [p.eastM, p.northM, p.headingDeg].every((n) => typeof n === "number" && Number.isFinite(n));
}

function readAll(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadPlacements(siteKey: string): Placement[] {
  const list = readAll()[siteKey];
  return Array.isArray(list) ? list.filter(isPlacement).slice(0, MAX_PLACEMENTS) : [];
}

export function savePlacements(siteKey: string, placements: Placement[]) {
  try {
    const all = readAll();
    if (placements.length) all[siteKey] = placements.slice(0, MAX_PLACEMENTS);
    else delete all[siteKey];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked (private mode): placements last for this visit only.
  }
}
