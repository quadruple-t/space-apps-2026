import type { CelestialState, LunarSite, ScienceProvider } from "./types";

/**
 * UI-only demo source. These values exercise the time controls and must never
 * be interpreted as an ephemeris, horizon solution, or mission assessment.
 */
export const mockScienceProvider: ScienceProvider = {
  provenance: "illustrative",
  async getCelestialState(site: LunarSite, timestamp: string): Promise<CelestialState> {
    const hour = new Date(timestamp).getUTCHours() + new Date(timestamp).getUTCMinutes() / 60;
    const localPhase = ((hour + site.longitudeDeg / 15) / 24) * Math.PI * 2;
    const earthLongitudeOffset = Math.abs(((site.longitudeDeg + 180) % 360) - 180);
    const earthElevation = 12 * Math.cos((earthLongitudeOffset * Math.PI) / 180) * Math.cos((site.latitudeDeg * Math.PI) / 180);
    return {
      timestamp,
      sun: { azimuthDeg: (hour * 15 + site.longitudeDeg + 210) % 360, elevationDeg: 8 + 12 * Math.sin(localPhase - 1.2) * Math.cos(site.latitudeDeg * Math.PI / 180) },
      earth: { azimuthDeg: (28 + site.longitudeDeg * 0.35 + 3 * Math.sin(localPhase * 0.25) + 360) % 360, elevationDeg: earthElevation },
      provenance: "illustrative",
    };
  },
  async getHorizon() {
    return null;
  },
  async getMissionMetrics(site: LunarSite) {
    const earthOffset = Math.abs(((site.longitudeDeg + 180) % 360) - 180);
    const earthVisibilityPercent = Math.round(Math.max(0, Math.cos(earthOffset * Math.PI / 180) * Math.cos(site.latitudeDeg * Math.PI / 180)) * 100);
    const sunlightPercent = Math.round(54 + 28 * Math.abs(Math.sin(site.latitudeDeg * Math.PI / 180)) + 8 * Math.cos(site.longitudeDeg * Math.PI / 90));
    return {
      sunlightPercent,
      sunlightHours: Number((24 * sunlightPercent / 100).toFixed(1)),
      longestDarknessHours: Number((24 * (1 - sunlightPercent / 100) * 0.65).toFixed(1)),
      earthVisibilityPercent,
      longestBlackoutHours: Number((24 * (1 - earthVisibilityPercent / 100) * 0.4).toFixed(1)),
      provenance: "illustrative",
    };
  },
};
