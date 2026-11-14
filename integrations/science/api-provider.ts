import type { CelestialState, HorizonProfile, LunarSite, MissionMetrics, ScienceProvider } from "./types";

type ApiError = { error?: { message?: string } };
type Timeline = { stepMinutes: number; samples: Pick<CelestialState, "timestamp" | "sun" | "earth">[] };
const timelineCache = new Map<string, Promise<Timeline>>();

async function get<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`/api/v1/${path}?${params.toString()}`);
  const body = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Science API returned ${response.status}`);
  return body;
}

async function timelineFor(site: LunarSite, timestamp: string): Promise<Timeline> {
  const day = timestamp.slice(0, 10);
  const siteKey = site.provenance === "scientific" ? `id:${site.id}` : `${site.latitudeDeg}:${site.longitudeDeg}`;
  const key = `${siteKey}:${day}`;
  let hit = timelineCache.get(key);
  if (!hit) {
    const params = siteParams(site);
    params.set("start", `${day}T00:00:00.000Z`);
    params.set("stepMinutes", "1");
    hit = get<Timeline>("science/timeline", params);
    timelineCache.set(key, hit);
    hit.catch(() => { if (timelineCache.get(key) === hit) timelineCache.delete(key); });
    if (timelineCache.size > 48) timelineCache.delete(timelineCache.keys().next().value!);
  }
  return hit;
}

function interpolateAngle(from: number, to: number, fraction: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return ((from + delta * fraction) % 360 + 360) % 360;
}

function siteParams(site: LunarSite) {
  const params = new URLSearchParams();
  if (site.provenance === "scientific") params.set("siteId", site.id);
  else {
    params.set("lat", String(site.latitudeDeg));
    params.set("lon", String(site.longitudeDeg));
  }
  return params;
}

/** Browser adapter for the versioned REST API; scientific work and Firestore access stay server-side. */
export const apiScienceProvider: ScienceProvider = {
  provenance: "scientific",

  async getCelestialState(site, timestamp): Promise<CelestialState> {
    const timeline = await timelineFor(site, timestamp);
    const time = Date.parse(timestamp);
    const offset = (time - Date.parse(`${timestamp.slice(0, 10)}T00:00:00.000Z`)) / (timeline.stepMinutes * 60_000);
    const left = Math.max(0, Math.min(timeline.samples.length - 1, Math.floor(offset)));
    const right = Math.max(0, Math.min(timeline.samples.length - 1, left + 1));
    const fraction = Math.max(0, Math.min(1, offset - left));
    const a = timeline.samples[left], b = timeline.samples[right];
    const body = (key: "sun" | "earth") => ({
      azimuthDeg: interpolateAngle(a[key].azimuthDeg, b[key].azimuthDeg, fraction),
      elevationDeg: a[key].elevationDeg + (b[key].elevationDeg - a[key].elevationDeg) * fraction,
      visible: fraction < 0.5 ? a[key].visible : b[key].visible,
    });
    return { timestamp, sun: body("sun"), earth: body("earth"), provenance: "scientific" };
  },

  async getHorizon(site): Promise<HorizonProfile | null> {
    const result = await get<{ horizon: HorizonProfile | null }>("science/horizon", siteParams(site));
    return result.horizon;
  },

  getMissionMetrics(site, start, durationHours): Promise<MissionMetrics | null> {
    const params = siteParams(site);
    params.set("start", start);
    params.set("durationHours", String(durationHours));
    return get("science/metrics", params);
  },
};
