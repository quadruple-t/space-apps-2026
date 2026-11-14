/**
 * SHADOWLINE data model
 * ---------------------------------------------------------------
 * Layers (matches the data-flow diagram):
 *   1. Static content   -> Site, StoryChapter, MissionProfile, ProtectionZone, LanderPreset, FactSheet
 *   2. Precomputed data -> EphemerisChunk, SiteTerrain, TerrainGridTile, PsrLayer, HomeDemo
 *   3. User state       -> ProgressState, SessionState, UserDoc, SavedSession, SavedReport
 *   4. Compute engine   -> EngineInput, EngineResult (pure function, built in a later phase)
 *   5. Outputs          -> SiteReport (PDF / CSV export), ValidationCheck
 *
 * Conventions
 *   - Angles in degrees. Azimuth 0 = north, clockwise. Elevation 0 = horizon.
 *   - Lat/lon are selenographic (planetocentric, MOON_ME / DE421), east longitude positive.
 *   - Times are ISO 8601 UTC strings at the client boundary (Firestore Timestamps are converted).
 *   - Anything not sourced is typed as nullable instead of guessed. Model assumptions carry
 *     basis: "assumption" so the UI can show "assumed".
 */

// ---------------------------------------------------------------
// 1. STATIC CONTENT
// ---------------------------------------------------------------

export type SiteId = string;
export type MissionProfileId = "short-landing" | "robotic-14-day" | "long-term-base";
export type ToolId = "horizon-dial" | "power-simulator" | "base-scoring";
export type ChapterId = "ch1-first-landing" | "ch2-robotic-explorer" | "ch3-lunar-base";

export const CHAPTER_IDS = ["ch1-first-landing", "ch2-robotic-explorer", "ch3-lunar-base"] as const satisfies readonly ChapterId[];
export const TOOL_IDS = ["horizon-dial", "power-simulator", "base-scoring"] as const satisfies readonly ToolId[];
export const MISSION_PROFILE_IDS = ["short-landing", "robotic-14-day", "long-term-base"] as const satisfies readonly MissionProfileId[];
/** Chapter n unlocks tool n; order is enforced ch1 -> ch2 -> ch3. */
export const CHAPTER_TOOL: Record<ChapterId, ToolId> = {
  "ch1-first-landing": "horizon-dial",
  "ch2-robotic-explorer": "power-simulator",
  "ch3-lunar-base": "base-scoring",
};

export type SiteFamily =
  | "apollo"
  | "surveyor"
  | "luna"
  | "change"
  | "chandrayaan"
  | "slim"
  | "clps"
  | "commercial"
  | "artemis-candidate"
  | "custom";
export type SiteKind = "landing" | "impact" | "rover-final" | "region-reference";
export type Outcome = "success" | "partial" | "failure" | "planned" | "n/a";
export type TimePrecision = "second" | "minute" | "approx" | "date";
export type Basis = "sourced" | "derived" | "assumption";

export const SITE_FAMILIES = [
  "apollo", "surveyor", "luna", "change", "chandrayaan", "slim", "clps", "commercial", "artemis-candidate", "custom",
] as const satisfies readonly SiteFamily[];
export const SITE_KINDS = ["landing", "impact", "rover-final", "region-reference"] as const satisfies readonly SiteKind[];
export const OUTCOMES = ["success", "partial", "failure", "planned", "n/a"] as const satisfies readonly Outcome[];

export interface Coordinates {
  latDeg: number;
  lonDeg: number;
  /** metres above the 1737.4 km reference sphere, if known */
  elevationM?: number;
}

export interface SourceRef {
  label: string;
  url: string | null;
  retrievedAt: string | null;
  /** A = agency / peer-reviewed, B = company or official mission document, C = secondary press */
  tier?: "A" | "B" | "C";
  note?: string;
}

export interface TerrainSummary {
  hasMask: boolean;
  slope100mDeg: number | null;
  nearestPsrKm: number | null;
  nearestColdTrapKm: number | null;
  insidePsr: boolean | null;
}

export interface Site {
  id: SiteId;
  name: string;
  family: SiteFamily;
  siteKind: SiteKind;
  country: string;
  agency: string;
  mission: string | null;
  /** ISO UTC instant, or a bare ISO date when landingTimePrecision is "date" */
  landingTimeUtc: string | null;
  landingTimePrecision: TimePrecision | null;
  outcome: Outcome;
  outcomeDetail: { summary: string; causeClass: string; sources: SourceRef[] } | null;
  /** null for Artemis regions (NASA never published coordinates); see representativePoint */
  coordinates: Coordinates | null;
  coordsVerified: boolean;
  coordsFrame: "MOON_ME" | "unknown";
  coordsUncertaintyM: number | null;
  coordsAsPublished: { latDeg: number; lonDeg: number; source: SourceRef } | null;
  /** Artemis regions only. NOT a region centroid; label "approximate region reference". */
  representativePoint: { latDeg: number; lonDeg: number; method: string; sources: SourceRef[] } | null;
  chapterId: ChapterId | null;
  blurb: string;
  sources: SourceRef[];
  terrainSummary: TerrainSummary | null;
  /** provenance notes (coordinate overrides, time-zone caveats) */
  notes?: string[];
  updatedAt?: string;
}

/** One row of catalog/siteIndex (a single read for the Site Library). */
export interface SiteIndexEntry {
  id: SiteId;
  name: string;
  family: SiteFamily;
  siteKind: SiteKind;
  country: string;
  agency: string;
  outcome: Outcome;
  latDeg: number | null;
  lonDeg: number | null;
  /** true for Artemis representative points */
  pointIsApproximate: boolean;
  /** true only when latDeg/lonDeg is a verified point (primary-source coordinates); the science API accepts only these */
  coordsVerified: boolean;
  landingTimeUtc: string | null;
  chapterId: ChapterId | null;
}

export interface CatalogMeta {
  datasetVersion: string;
  generatedAt: string;
  pipelineGitSha: string;
  pipelineVersion: string;
  counts: Record<string, number>;
}

/** Scoring weights are tunable. Each weight is 0..1 and weights sum to 1. */
export interface MissionProfile {
  id: MissionProfileId;
  label: string;
  durationHours: number;
  durationNote?: string;
  description: string;
  weights: {
    sunlight: number; // fraction of window with sun above horizon mask
    earthComms: number; // fraction of window with Earth visible
    thermalMargin: number; // sun elevation inside a safe band
    batterySurvival: number; // min state of charge over window
    iceAccess: number; // distance to cold-trap PSRs
    longSunlight: number; // longest continuous lit stretch
    hazardMargin: number; // slope / terrain roughness
  };
  /** hard-fail rules applied before scoring */
  disqualifiers: string[];
  hazardThresholds: { landingSlopeMaxDeg: number; evaSlopeMaxDeg: number; sources: SourceRef[] };
  weightsBasis?: Basis;
  weightsNote?: string;
}

export interface StoryChapter {
  id: ChapterId;
  order: 1 | 2 | 3;
  title: string;
  era: string;
  concept: string;
  unlocksTool: ToolId;
  featuredSiteIds: SiteId[];
  steps: StoryStep[];
  debrief: Debrief;
}

export interface StoryStep {
  id: string;
  prompt: string;
  /** which engine output the step asks the learner to look at */
  focus: "sun-elevation" | "horizon-mask" | "earth-visibility" | "battery-soc" | "ice-access" | "score";
  /** user input collected on this step, if any */
  expects: "none" | "choice" | "slider" | "date-pick";
}

export interface KeyNumber {
  label: string;
  value: string;
  sourceNote: string;
  sources?: SourceRef[];
  /** when set, the UI shows the pipeline-computed value from this validation check beside it */
  validationCheckId?: string;
}

export interface Debrief {
  headline: string;
  whatHappened: string;
  realMission: string;
  keyNumbers: KeyNumber[];
  honestyNote?: string;
}

export type ProtectionRuleId =
  | "nasa2011-dl-boundary"
  | "nasa2011-artifact-boundary"
  | "nasa2011-impact-boundary"
  | "psr-buffer-by-analogy";

/** Keep-out and caution areas shown on the map (Impact page + scoring flags) */
export interface ProtectionZone {
  id: string;
  kind: "psr-ice" | "heritage-buffer";
  ruleId: ProtectionRuleId;
  name: string;
  siteId: SiteId | null;
  /** Polygon coordinates are GeoJSON order: [ring][point][lon, lat] */
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "Circle"; center: Coordinates; radiusKm: number };
  rationale: string;
  sources: SourceRef[];
  needsData: boolean;
  /** psr-ice zones: the stand-off is a user parameter applied by analogy, never a PSR standard */
  buffer?: { defaultKm: number; secondaryRingKm: number; label: string };
  /** psr-ice zones: area and Diviner cold-trap fraction (Tmax < 110 K) */
  areaKm2?: number;
  coldTrapFraction?: number | null;
}

export interface PresetField {
  value: number | null;
  unit: string;
  basis: Basis;
  /** index into LanderPreset.sources, or null */
  sourceIdx: number | null;
  note: string;
}

export type PresetFieldKey =
  | "arrayPowerW"
  | "panelAreaM2"
  | "cellEfficiency"
  | "batteryWh"
  | "batteryAh"
  | "busV"
  | "baseLoadW"
  | "commsLoadW"
  | "designLifeHours";

export interface LanderPreset {
  id: string;
  label: string;
  agency: string;
  mission: string | null;
  fields: Record<PresetFieldKey, PresetField>;
  /** sourced facts that do not fit a numeric field */
  facts?: { text: string; sourceIdx: number | null }[];
  sources: SourceRef[];
}

export interface FactRow {
  label: string;
  value: string | number;
  unit: string | null;
  currency?: string;
  approxUsd?: number | null;
  quote: string;
  source: SourceRef;
  tier?: "A" | "B" | "C";
  note?: string;
}
export interface FactSheet {
  id: string;
  title: string;
  rows: FactRow[];
  updatedAt: string;
}

export type DataSourceKind = "api" | "dem" | "map" | "paper" | "document" | "catalog";
export interface DataSourceManifest {
  id: string;
  label: string;
  kind: DataSourceKind;
  version: string | null;
  citation: string | null;
  doi: string | null;
  url: string | null;
  retrievedAt: string | null;
  license: string | null;
  usedFor: string[];
}

/** Powers the Science & Methods validation card. `computed` is written only by the pipeline. */
export interface ValidationCheck {
  id: string;
  siteId: SiteId;
  time: string;
  quantity: "sun-elevation-deg" | "sun-azimuth-deg" | "earth-elevation-deg" | "lit-fraction";
  computed: number | null;
  /** e.g. "pipeline 80_validate.py @ <git sha>" */
  computedBy: string | null;
  historical: number | null;
  historicalKind: "measured" | "computed-reconstruction" | "planning-value" | null;
  historicalSource: SourceRef | null;
  /** degrees for angles; for lit-fraction this is a fraction (or null when report-only) */
  toleranceDeg: number | null;
  deltaDeg: number | null;
  status: "pass" | "fail" | "pending";
  note: string;
  /** planning-window checks */
  range?: { min: number; max: number } | null;
}

// ---------------------------------------------------------------
// 2. PRECOMPUTED DATA (Firestore Bytes fields decoded to typed arrays)
// ---------------------------------------------------------------

export const EPHEMERIS_LAYOUT = ["sunLatDeg", "sunLonDeg", "sunDistKm", "earthLatDeg", "earthLonDeg", "earthDistKm"] as const;

export interface EphemerisChunk {
  id: string;
  startUtc: string;
  stepMinutes: number;
  count: number;
  layout: typeof EPHEMERIS_LAYOUT;
  /** float32, row-major, count x 6 */
  data: Float32Array;
  sunAngularDiameterDegMean: number | null;
  frame: string;
  timeScale: "UTC";
  source: "JPL Horizons API";
  horizonsQuery: string;
  ephemerisVersion: string | null;
  retrievedAt: string;
  /** historic windows only */
  siteId?: string;
  windowCentreUtc?: string;
}

/** Terrain skyline: max terrain elevation angle for each azimuth bin */
export interface HorizonMask {
  /** "none" = smooth-sphere horizon (outside the polar grid); flag it as terrain: "none — smooth horizon" */
  source: "LOLA DEM" | "LOLA DEM grid" | "none";
  /** bins = 360 / binDeg; index 0 = azimuth 0 (north), clockwise */
  binDeg: number;
  maskElevationDeg: Float32Array | number[];
  maskP05Deg: Float32Array | null;
  maskP95Deg: Float32Array | null;
  /** summary 2-sigma error band (deg) */
  errorMarginDeg: number;
  /** per-bin 1-sigma error (deg), when available */
  maskSigmaDeg?: Float32Array | null;
  demProducts: string[];
  rayLengthKm: number;
  observerHeightM: number;
}

export interface SiteTerrain {
  mask: HorizonMask;
  distAtMaxKm: Float32Array | null;
  slope100mDeg: number | null;
  slope100mErrDeg: number | null;
  roughness100mM: number | null;
  nearestPsrKm: number | null;
  nearestColdTrapPsrKm: number | null;
  insidePsr: boolean | null;
  litFractionCheck: { computed: number; lrocWac: number; window: TimeWindow } | null;
  sources: SourceRef[];
  computedAt?: string;
  pipelineVersion?: string;
  notes?: string[];
}

export interface TerrainGridTile {
  id: string;
  gridSpacingKm: number;
  /** stereographic metres of cell (0,0) centre */
  tileOriginXY: { xM: number; yM: number };
  cellsPerSide: number;
  binDeg: number;
  bins: number;
  /** int16 centidegrees, cells x bins; -32768 = no data */
  masks: Int16Array;
  /** uint8 1-sigma error in 0.05 deg steps, cells x bins */
  maskErr: Uint8Array;
  /** decoded per-cell stats */
  cellStats: TerrainGridCellStats[];
  demProducts: string[];
  rayLengthKm: number;
  observerHeightM: number;
  computedAt: string;
}

export interface TerrainGridCellStats {
  hasData: boolean;
  slope100mDeg: number | null;
  nearestPsrKm: number | null;
  nearestColdTrapKm: number | null;
  insidePsr: boolean;
}

export interface PsrPolygon {
  index: number;
  areaKm2: number;
  coldTrapFraction: number | null;
  name: string | null;
  /** rings of [xM, yM] in south polar stereographic metres */
  rings: [number, number][][];
}

export interface PsrLayer {
  id: string;
  count: number;
  encoding: string;
  polygons: PsrPolygon[];
  simplifyToleranceM: number;
  minAreaKm2: number;
  sources: SourceRef[];
}

export interface HomeDemo {
  siteId: SiteId;
  siteLabel?: string;
  startUtc: string;
  stepMinutes: number;
  count: number;
  /** count x 4: sunAz, sunEl, earthAz, earthEl (deg) */
  series: Float32Array;
  mask: Float32Array;
  maskBinDeg: number;
  note?: string;
}

// ---------------------------------------------------------------
// 3. USER STATE
// ---------------------------------------------------------------

/** Persisted in localStorage (signed out) or users/{uid}/progress/state (signed in). */
export interface ProgressState {
  version: 1;
  chaptersCompleted: ChapterId[];
  unlockedTools: ToolId[];
  /** expert skip from Home: unlocks every tool, flagged so we can tell later */
  expertMode: boolean;
  stepAnswers: Record<string, string | number>;
  updatedAt: string;
}

/** Lives in URL params so a view is shareable. Mission Control reads and writes it. */
export interface SessionState {
  siteSelections: SiteSelection[]; // 1 normally, 2 or 3 in compare mode
  window: TimeWindow;
  scrubTime: string;
  profileId: MissionProfileId;
}

export type SiteSelection =
  | { kind: "library"; siteId: SiteId }
  | { kind: "custom"; label: string; coordinates: Coordinates };

export interface TimeWindow {
  start: string;
  end: string;
  stepMinutes: number;
}

export interface UserDoc {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: string;
  lastSeenAt: string;
  expertMode: boolean;
}

export interface SavedSession {
  id: string;
  name: string;
  siteSelections: SiteSelection[];
  window: TimeWindow;
  scrubTime: string;
  profileId: MissionProfileId;
  createdAt: string;
  updatedAt: string;
}

export interface SavedReportSummary {
  siteLabel: string;
  latDeg: number;
  lonDeg: number;
  scoreTotal: number | null;
  disqualified: boolean;
  longestLitHours: number;
  longestDarkHours: number;
  minSocPct: number | null;
  flags: string[];
}

export interface SavedReport {
  id: string;
  createdAt: string;
  profileId: MissionProfileId;
  window: TimeWindow;
  siteSummaries: SavedReportSummary[];
  methodsSummary: string;
  disclaimer: string;
  format: "pdf" | "csv";
}

// ---------------------------------------------------------------
// 4. COMPUTE ENGINE (pure, runs once per selected site; built in a later phase)
// ---------------------------------------------------------------

export interface EngineInput {
  coordinates: Coordinates;
  window: TimeWindow;
  profile: MissionProfile;
  /** built by lib/ephemeris from ephemerisGlobal chunks */
  ephemeris: EphemerisSeries;
  horizonMask: HorizonMask;
  iceDistanceKm: number | null;
  zones: ProtectionZone[];
}

export interface BodyDirection {
  azimuthDeg: number;
  elevationDeg: number;
}

/** Sun and Earth direction from the site, one sample per timestep */
export interface EphemerisSample {
  time: string;
  sun: BodyDirection;
  earth: BodyDirection;
  sunDistKm?: number;
  earthDistKm?: number;
}
export interface EphemerisSeries {
  source: "JPL Horizons (global sub-point series, client topocentric)" | "bundled sample";
  samples: EphemerisSample[];
}

export interface EngineResult {
  siteLabel: string;
  coordinates: Coordinates;
  series: TimeSeriesPoint[];
  events: SiteEvents;
  battery: BatterySummary | null;
  score: SiteScore | null;
  flags: ZoneFlag[];
  assumptions: string[];
}

export interface TimeSeriesPoint {
  time: string;
  sunElevationDeg: number;
  sunAboveMask: boolean;
  earthElevationDeg: number;
  earthAboveMask: boolean;
  batterySocPct: number | null;
}

export interface Interval {
  start: string;
  end: string;
}

export interface SiteEvents {
  litIntervals: Interval[];
  earthVisibleIntervals: Interval[];
  hoursToSunset: number | null;
  hoursToEarthset: number | null;
  longestLitHours: number;
  longestDarkHours: number;
}

export interface BatterySummary {
  capacityWh: number;
  panelAreaM2: number;
  loadWatts: number;
  commsLoadWatts: number;
  minSocPct: number;
  survivesWindow: boolean;
}

export interface SiteScore {
  profileId: MissionProfileId;
  total: number; // 0..100
  components: Record<keyof MissionProfile["weights"], number>;
  disqualified: boolean;
  disqualifierReasons: string[];
}

export interface ZoneFlag {
  zoneId: string;
  kind: ProtectionZone["kind"];
  distanceKm: number;
  inside: boolean;
}

// ---------------------------------------------------------------
// 5. OUTPUTS
// ---------------------------------------------------------------

export interface SiteReport {
  generatedAt: string;
  profileId: MissionProfileId;
  window: TimeWindow;
  sites: EngineResult[]; // 1 to 3
  methodsSummary: string;
  dataSources: DataSourceManifest[];
  disclaimer: string;
}
