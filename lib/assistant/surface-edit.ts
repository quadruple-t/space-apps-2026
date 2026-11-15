/**
 * Pure rules for the assistant's edit_surface_setup tool: resolves labels to placed objects and applies a
 * validated SurfacePlan to a placement list. The surface drive supplies the terrain-dependent placement
 * check (walls, slope, overlap), so the same rules apply as when the user places hardware by hand.
 */
import { MAX_PLACEMENTS, type Placement } from "@/lib/drive-placements";
import type { SurfaceOp, SurfacePlan } from "./tool-validation";

export type SurfaceLabels = Record<Placement["type"], string>;
export type SurfaceCheck = (others: Placement[], type: Placement["type"], eastM: number, northM: number) => { ok: boolean; reason: string | null };
export type SurfaceEditEnv = { labels: SurfaceLabels; check: SurfaceCheck; newId: (type: Placement["type"]) => string };
export type SurfaceEditResult = {
  list: Placement[];
  /** Human-readable lines; refusals start with "Could not". */
  changes: string[];
  /** Placed object to bring the camera to, if any. */
  goToId: string | null;
  viewMode: SurfacePlan["viewMode"] | null;
  listChanged: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The label the setup context shows for an object: "<type label> <n among its type>". */
export function placementLabel(labels: SurfaceLabels, list: Placement[], p: Placement): string {
  return `${labels[p.type]} ${list.filter((q) => q.type === p.type).indexOf(p) + 1}`;
}

/** Matches a label from the setup (or an id). A bare type name works when exactly one object has that type. */
export function resolveTarget(labels: SurfaceLabels, list: Placement[], target: string): Placement | null {
  const want = norm(target);
  const byId = list.find((p) => p.id === target);
  if (byId) return byId;
  const exact = list.find((p) => norm(placementLabel(labels, list, p)) === want);
  if (exact) return exact;
  const sameType = list.filter((p) => norm(labels[p.type]) === want);
  return sameType.length === 1 ? sameType[0] : null;
}

const at = (e: number, n: number) => `${Math.abs(e)} m ${e >= 0 ? "E" : "W"}, ${Math.abs(n)} m ${n >= 0 ? "N" : "S"}`;

export function applySurfaceEdit(list: Placement[], plan: SurfacePlan, env: SurfaceEditEnv): SurfaceEditResult {
  const { labels, check, newId } = env;
  const changes: string[] = [];
  // Targets name objects as the user (and the model) saw them before this call, so edits earlier in the batch never shift later labels.
  const original = list;
  let working = plan.clearAll ? [] : [...list];
  let listChanged = false;
  if (plan.clearAll) {
    listChanged = list.length > 0;
    changes.push(list.length ? `Removed all ${list.length} placed object${list.length === 1 ? "" : "s"}` : "No placed objects to clear");
  }

  const run = (op: SurfaceOp) => {
    if (op.action === "place") {
      const name = labels[op.type];
      if (working.length >= MAX_PLACEMENTS) { changes.push(`Could not place ${name}: the planner holds at most ${MAX_PLACEMENTS} objects`); return; }
      const result = check(working, op.type, op.eastM, op.northM);
      if (!result.ok) { changes.push(`Could not place ${name} at ${at(op.eastM, op.northM)}: ${result.reason ?? "not allowed there"}`); return; }
      working = [...working, { id: newId(op.type), type: op.type, eastM: op.eastM, northM: op.northM, headingDeg: op.headingDeg }];
      listChanged = true;
      changes.push(`Placed ${name} at ${at(op.eastM, op.northM)}`);
      return;
    }
    const found = resolveTarget(labels, original, op.target);
    const current = found ? working.find((p) => p.id === found.id) ?? null : null;
    if (!found) { changes.push(`Could not ${op.action} "${op.target}": no placed object has that label`); return; }
    const name = placementLabel(labels, original, found);
    if (!current) { changes.push(`Could not ${op.action} ${name}: it was already removed`); return; }
    if (op.action === "remove") {
      working = working.filter((p) => p.id !== current.id);
      listChanged = true;
      changes.push(`Removed ${name}`);
      return;
    }
    let next = current;
    if (op.eastM !== undefined && op.northM !== undefined) {
      const result = check(working.filter((p) => p.id !== current.id), current.type, op.eastM, op.northM);
      if (!result.ok) { changes.push(`Could not move ${name} to ${at(op.eastM, op.northM)}: ${result.reason ?? "not allowed there"}`); return; }
      next = { ...next, eastM: op.eastM, northM: op.northM };
    }
    if (op.headingDeg !== undefined) next = { ...next, headingDeg: op.headingDeg };
    working = working.map((p) => (p.id === current.id ? next : p));
    listChanged = true;
    changes.push(op.eastM !== undefined ? `Moved ${name} to ${at(op.eastM, op.northM!)}${op.headingDeg !== undefined ? `, facing ${op.headingDeg}°` : ""}` : `Rotated ${name} to face ${op.headingDeg}°`);
  };
  for (const op of plan.operations ?? []) run(op);

  let goToId: string | null = null;
  if (plan.goTo) {
    const found = resolveTarget(labels, original, plan.goTo);
    const present = found ? working.find((p) => p.id === found.id) : null;
    if (present && found) { goToId = present.id; changes.push(`Moved the camera to ${placementLabel(labels, original, found)}`); }
    else changes.push(`Could not go to "${plan.goTo}": no placed object has that label`);
  }
  if (plan.viewMode) changes.push(plan.viewMode === "first-person" ? "First-person view (walking the surface)" : "Bird's-eye view");
  return { list: working, changes, goToId, viewMode: plan.viewMode ?? null, listChanged };
}
