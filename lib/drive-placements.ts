import type { SurfaceObjectType } from "@/scenes/lunar/surface-objects";

/** One object the user placed in the surface drive, in metres east/north of the site centre. */
export type Placement = { id: string; type: SurfaceObjectType; eastM: number; northM: number; headingDeg: number };

const STORAGE_KEY = "lunaris360-drive-placements-v1";
const TYPES = new Set<string>(["solar", "rover", "dome", "modules", "inflatable", "comms"]);
export const MAX_PLACEMENTS = 200;

/** Solar array assumptions shared by the drive and the graphs: 3 × 6 m tracking panel, 30% efficient. */
export const SOLAR_ARRAY_AREA_M2 = 18;
export const SOLAR_ARRAY_EFFICIENCY = 0.3;
/** Height above the ground (m) of the point whose sky view matters for each kind of hardware. */
export const OBSERVER_HEIGHT_M: Record<SurfaceObjectType, number> = { solar: 6, comms: 8, rover: 3, dome: 3, modules: 3, inflatable: 3 };

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
