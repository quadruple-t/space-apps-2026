import type { CelestialState, HorizonProfile, LunarSite, MissionMetrics, ScienceProvider } from "./types";

type ApiError = { error?: { message?: string } };
async function get<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`/api/v1/${path}?${params.toString()}`);
  const body = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(body.error?.message ?? `Science API returned ${response.status}`);
  return body;
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

  getCelestialState(site, timestamp): Promise<CelestialState> {
    const params = siteParams(site);
    params.set("time", timestamp);
    return get("science/celestial", params);
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
