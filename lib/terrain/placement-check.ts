import type { Placement } from "@/lib/drive-placements";
import { slopeAtLocal, type DemGrid } from "@/lib/terrain/dem";
import { SURFACE_OBJECTS, type SurfaceObjectType } from "@/scenes/lunar/surface-objects";

export type PlacementCheck = { ok: boolean; reason: string | null; slopeDeg: number };

/** Placement rules shared by the ghost and the click handler. */
export function checkPlacement(grid: DemGrid, radiusM: number, placements: Placement[], type: SurfaceObjectType, eastM: number, northM: number): PlacementCheck {
  const spec = SURFACE_OBJECTS[type];
  const slopeDeg = slopeAtLocal(grid, eastM, northM);
  // The loaded tile is square and walled; keep the whole footprint inside it.
  if (Math.max(Math.abs(eastM), Math.abs(northM)) > radiusM - spec.footprintM) return { ok: false, reason: "Outside the walls", slopeDeg };
  if (slopeDeg > spec.maxSlopeDeg) return { ok: false, reason: `Slope ${slopeDeg.toFixed(1)}° exceeds ${spec.maxSlopeDeg}°`, slopeDeg };
  const clash = placements.find((p) => Math.hypot(p.eastM - eastM, p.northM - northM) < SURFACE_OBJECTS[p.type].footprintM + spec.footprintM);
  if (clash) return { ok: false, reason: `Overlaps ${SURFACE_OBJECTS[clash.type].short.toLowerCase()}`, slopeDeg };
  return { ok: true, reason: null, slopeDeg };
}
