import type { CelestialState, LunarSite, ScienceProvider } from "./types";

/**
 * UI-only demo source. These values exercise the time controls and must never
 * be interpreted as an ephemeris, horizon solution, or mission assessment.
 */
export const mockScienceProvider: ScienceProvider = {
  provenance: "illustrative",
  async getCelestialState(_site: LunarSite, timestamp: string): Promise<CelestialState> {
    const hour = new Date(timestamp).getUTCHours() + new Date(timestamp).getUTCMinutes() / 60;
    const phase = (hour / 24) * Math.PI * 2;
    return {
      timestamp,
      sun: { azimuthDeg: ((hour * 15 + 210) % 360), elevationDeg: 7 + 8 * Math.sin(phase - 1.2) },
      earth: { azimuthDeg: 28 + 3 * Math.sin(phase * 0.25), elevationDeg: 9 + 2 * Math.cos(phase * 0.25) },
      provenance: "illustrative",
    };
  },
  async getHorizon() {
    return null;
  },
  async getMissionMetrics() {
    return {
      sunlightPercent: 68,
      sunlightHours: 16.3,
      longestDarknessHours: 5.8,
      earthVisibilityPercent: 92,
      longestBlackoutHours: 1.4,
      provenance: "illustrative",
    };
  },
};
