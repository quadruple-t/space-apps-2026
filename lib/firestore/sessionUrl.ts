/**
 * SessionState <-> URL query string. URL params are the primary session store (shareable
 * links); Firestore sessions are optional named bookmarks. Pure: safe on the server.
 *
 *   sel=site:<siteId>               library selection (repeat 1-3 times, in order)
 *   sel=pt:<lat>,<lon>[,<label>]    custom point (label may contain commas)
 *   start, end                      ISO UTC window bounds
 *   step                            window step in minutes
 *   t                               scrub time (clamped into the window)
 *   profile                         mission profile id
 */
import { MISSION_PROFILE_IDS, type MissionProfileId, type SessionState, type SiteSelection } from "@/lib/model/types";

const SITE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_LABEL = 80;
const MAX_STEP_MINUTES = 1440;
const DEFAULT_CUSTOM_LABEL = "Custom point";

function fmt(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function encodeSelection(s: SiteSelection): string {
  if (s.kind === "library") return `site:${s.siteId}`;
  const { latDeg, lonDeg } = s.coordinates;
  return `pt:${fmt(latDeg)},${fmt(lonDeg)}${s.label ? `,${s.label}` : ""}`;
}

function parseNumber(s: string): number | null {
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(s.trim())) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function decodeSelection(raw: string): SiteSelection | null {
  if (raw.startsWith("site:")) {
    const siteId = raw.slice(5);
    return SITE_ID.test(siteId) ? { kind: "library", siteId } : null;
  }
  if (raw.startsWith("pt:")) {
    const body = raw.slice(3);
    const [latS, lonS, ...labelParts] = body.split(",");
    if (latS === undefined || lonS === undefined) return null;
    const latDeg = parseNumber(latS);
    const lonDeg = parseNumber(lonS);
    if (latDeg === null || lonDeg === null) return null;
    if (latDeg < -90 || latDeg > 90 || lonDeg < -180 || lonDeg > 180) return null;
    const label = labelParts.join(",").trim().slice(0, MAX_LABEL) || DEFAULT_CUSTOM_LABEL;
    return { kind: "custom", label, coordinates: { latDeg, lonDeg } };
  }
  return null;
}

function parseIso(s: string | null): number | null {
  if (!s) return null;
  // Require an explicit date-time with zone so "2026" or locale strings are rejected.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function isoOut(t: number): string {
  return new Date(t).toISOString().replace(".000Z", "Z");
}

export function encodeSessionToUrl(state: SessionState): string {
  const p = new URLSearchParams();
  for (const s of state.siteSelections) p.append("sel", encodeSelection(s));
  p.set("start", state.window.start);
  p.set("end", state.window.end);
  p.set("step", String(state.window.stepMinutes));
  p.set("t", state.scrubTime);
  p.set("profile", state.profileId);
  return p.toString();
}

/** Returns null for anything invalid (unknown profile, 0 or >3 selections, bad coords/times). */
export function decodeSessionFromUrl(query: string): SessionState | null {
  const p = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const rawSel = p.getAll("sel");
  if (rawSel.length < 1 || rawSel.length > 3) return null;
  const siteSelections: SiteSelection[] = [];
  for (const raw of rawSel) {
    const s = decodeSelection(raw);
    if (!s) return null;
    siteSelections.push(s);
  }

  const profile = p.get("profile");
  if (!profile || !(MISSION_PROFILE_IDS as readonly string[]).includes(profile)) return null;

  const start = parseIso(p.get("start"));
  const end = parseIso(p.get("end"));
  if (start === null || end === null || end <= start) return null;

  const stepRaw = p.get("step");
  const step = stepRaw === null ? null : parseNumber(stepRaw);
  if (step === null || !Number.isInteger(step) || step < 1 || step > MAX_STEP_MINUTES) return null;

  const t = parseIso(p.get("t"));
  if (t === null) return null;
  const scrub = Math.min(Math.max(t, start), end);

  return {
    siteSelections,
    window: { start: isoOut(start), end: isoOut(end), stepMinutes: step },
    scrubTime: isoOut(scrub),
    profileId: profile as MissionProfileId,
  };
}
