/** Shared boundary between Freeplay rendering and the authoritative science engine.
 * Angles are degrees; azimuth is clockwise from lunar north; elevation is above
 * the local horizontal. Terrain samples are metres in the provider's declared frame.
 */
export type LunarSite = {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  coordinateReference: string;
  provenance: "user" | "illustrative" | "scientific";
};

export type CelestialState = {
  timestamp: string;
  sun: { azimuthDeg: number; elevationDeg: number; visible?: boolean };
  earth: { azimuthDeg: number; elevationDeg: number; visible?: boolean };
  provenance: "illustrative" | "scientific";
};

export type HorizonProfile = {
  azimuthStepDeg: number;
  elevationsDeg: number[];
  provenance: "illustrative" | "scientific";
};

export type MissionMetrics = {
  sunlightPercent?: number;
  sunlightHours?: number;
  longestDarknessHours?: number;
  earthVisibilityPercent?: number;
  longestBlackoutHours?: number;
  elevationMeters?: number;
  slopeDeg?: number;
  /** Actual interval the values cover (ISO 8601 UTC). Present for scientific metrics. */
  intervalStart?: string;
  intervalEnd?: string;
  /** Horizon source and calculation assumptions, shown beside the numbers. */
  horizonSource?: string;
  assumptions?: string[];
  provenance: "illustrative" | "scientific";
};

export interface ScienceProvider {
  readonly provenance: "illustrative" | "scientific";
  getCelestialState(site: LunarSite, timestamp: string): Promise<CelestialState>;
  getHorizon(site: LunarSite): Promise<HorizonProfile | null>;
  getMissionMetrics(site: LunarSite, start: string, durationHours: number): Promise<MissionMetrics | null>;
}
