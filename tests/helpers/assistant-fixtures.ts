import type { ToolContext } from "@/lib/assistant/tool-validation";

export const ctxWithCatalogSite: ToolContext = {
  site: { name: "Apollo 17", latitudeDeg: 20.19, longitudeDeg: 30.77, kind: "catalog", catalogId: "apollo-17", catalogPointVerified: true },
  missionStartIso: "2027-03-01T00:00:00.000Z",
  missionDurationHours: 709,
  currentTimeMs: Date.parse("2027-03-02T06:00:00.000Z"),
};
export const ctxWithCustomSite: ToolContext = { ...ctxWithCatalogSite, site: { name: "Custom site", latitudeDeg: -85.1, longitudeDeg: 20.5, kind: "custom" } };
export const ctxNoSite: ToolContext = { ...ctxWithCatalogSite, site: null };

export const metricsApi = (horizonSource: string) => ({
  sunlightPercent: 72, sunlightHours: 17.3, longestDarknessHours: 4.5, earthVisibilityPercent: 61, longestBlackoutHours: 6.2,
  intervalStart: "2027-03-01T00:00:00.000Z", intervalEnd: "2027-03-02T00:00:00.000Z", horizonSource,
  assumptions: ["10-minute sampling; run lengths limited to the interval"], provenance: "scientific",
});

export const timelineApi = (horizonSource = "LOLA DEM") => {
  const samples = Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2027, 2, 2, i)).toISOString(),
    sun: { azimuthDeg: 100 + i, elevationDeg: i >= 6 && i <= 17 ? 10 + i : -20, visible: i >= 6 && i <= 17 },
    earth: { azimuthDeg: 200, elevationDeg: 5, visible: true },
  }));
  return { intervalStart: samples[0].timestamp, intervalEnd: "2027-03-03T00:00:00.000Z", stepMinutes: 60, horizonSource, samples, provenance: "scientific" };
};
