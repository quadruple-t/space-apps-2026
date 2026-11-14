/**
 * Typed FirestoreDataConverters for every Shadowline document.
 *
 * - Timestamps <-> ISO strings (seeded static docs store updatedAt/computedAt/generatedAt as
 *   Timestamps; ISO strings are tolerated everywhere).
 * - Bytes -> aligned typed arrays via lib/bytes.ts.
 * - Protection-zone polygons: Firestore `rings[{points[{latDeg,lonDeg}]}]` <-> GeoJSON
 *   `coordinates[ring][point][lon, lat]`.
 *
 * The `*FromData` functions are pure and exported for tests. Static collections are
 * read-only on the client (their toFirestore throws). User-data converters live in
 * ./userConverters.ts.
 */
import type { DocumentData, FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore";
import { decodeFloat32, decodeInt16, decodeUint8 } from "@/lib/bytes";
import {
  CHAPTER_IDS,
  EPHEMERIS_LAYOUT,
  MISSION_PROFILE_IDS,
  OUTCOMES,
  SITE_FAMILIES,
  SITE_KINDS,
  TOOL_IDS,
  type CatalogMeta,
  type Coordinates,
  type DataSourceManifest,
  type EphemerisChunk,
  type FactSheet,
  type HomeDemo,
  type LanderPreset,
  type MissionProfile,
  type ProtectionZone,
  type PsrLayer,
  type Site,
  type SiteIndexEntry,
  type SiteTerrain,
  type SourceRef,
  type StoryChapter,
  type TerrainGridTile,
  type TimePrecision,
  type ValidationCheck,
} from "@/lib/model/types";
import { decodeCellStats, decodePsrPolygons } from "./binary";
import { DocumentShapeError } from "./errors";
import { Reader, type Data } from "./read";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const TIME_PRECISIONS = ["second", "minute", "approx", "date"] as const satisfies readonly TimePrecision[];
const PROTECTION_KINDS = ["psr-ice", "heritage-buffer"] as const;
const PROTECTION_RULES = [
  "nasa2011-dl-boundary",
  "nasa2011-artifact-boundary",
  "nasa2011-impact-boundary",
  "psr-buffer-by-analogy",
] as const;

function readOnly<T>(collection: string, from: (id: string, d: Data, path: string) => T): FirestoreDataConverter<T> {
  return {
    toFirestore(): DocumentData {
      throw new Error(`${collection} is read-only on the client (seeded with the Admin SDK).`);
    },
    fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      return from(snap.id, snap.data(options), snap.ref.path);
    },
  };
}

function coordinatesFrom(v: unknown, path: string): Coordinates {
  const r = new Reader(path, v as Data);
  const c: Coordinates = { latDeg: r.num("latDeg"), lonDeg: r.num("lonDeg") };
  const elevationM = r.numOrNull("elevationM");
  if (elevationM !== null) c.elevationM = elevationM;
  return c;
}

function floatsOrNull(r: Reader, key: string): Float32Array | null {
  const b = r.bytesOrNull(key);
  return b === null ? null : decodeFloat32(b);
}

function expectLength(path: string, field: string, actual: number, expected: number): void {
  if (actual !== expected) throw new DocumentShapeError(path, `${field} has ${actual} values, expected ${expected}`);
}

// ---------------------------------------------------------------
// GeoJSON polygon rings
// ---------------------------------------------------------------

export interface FirestorePolygonGeometry {
  type: "Polygon";
  rings: { points: { latDeg: number; lonDeg: number }[] }[];
}

export function ringsToCoordinates(rings: FirestorePolygonGeometry["rings"]): number[][][] {
  return rings.map((ring) => ring.points.map((p) => [p.lonDeg, p.latDeg]));
}

export function coordinatesToRings(coordinates: number[][][]): FirestorePolygonGeometry["rings"] {
  return coordinates.map((ring) => ({ points: ring.map(([lonDeg, latDeg]) => ({ latDeg, lonDeg })) }));
}

// ---------------------------------------------------------------
// Static content
// ---------------------------------------------------------------

export function siteFromData(id: string, d: Data, path = `sites/${id}`): Site {
  const r = new Reader(path, d);
  const coordinates = r.has("coordinates") ? coordinatesFrom(d.coordinates, `${path}.coordinates`) : null;
  const site: Site = {
    id,
    name: r.str("name"),
    family: r.oneOf("family", SITE_FAMILIES),
    siteKind: r.oneOf("siteKind", SITE_KINDS),
    country: r.str("country"),
    agency: r.str("agency"),
    mission: r.strOrNull("mission"),
    landingTimeUtc: r.strOrNull("landingTimeUtc"),
    landingTimePrecision: r.oneOfOrNull("landingTimePrecision", TIME_PRECISIONS),
    outcome: r.oneOf("outcome", OUTCOMES),
    outcomeDetail: r.objOrNull<Site["outcomeDetail"]>("outcomeDetail"),
    coordinates,
    coordsVerified: r.bool("coordsVerified"),
    coordsFrame: r.oneOf("coordsFrame", ["MOON_ME", "unknown"] as const),
    coordsUncertaintyM: r.numOrNull("coordsUncertaintyM"),
    coordsAsPublished: r.objOrNull<Site["coordsAsPublished"]>("coordsAsPublished"),
    representativePoint: r.objOrNull<Site["representativePoint"]>("representativePoint"),
    chapterId: r.oneOfOrNull("chapterId", CHAPTER_IDS),
    blurb: r.str("blurb"),
    sources: r.arr<SourceRef>("sources"),
    terrainSummary: r.objOrNull<Site["terrainSummary"]>("terrainSummary"),
  };
  const notes = r.arrOpt<string>("notes");
  if (notes) site.notes = notes;
  const updatedAt = r.isoOpt("updatedAt");
  if (updatedAt) site.updatedAt = updatedAt;
  return site;
}

export interface SiteIndexDoc {
  sites: SiteIndexEntry[];
  count: number;
  updatedAt: string | null;
}

export function siteIndexFromData(_id: string, d: Data, path = "catalog/siteIndex"): SiteIndexDoc {
  const r = new Reader(path, d);
  const sites = r.arr<Data>("sites").map((e, i) => {
    const er = new Reader(`${path}.sites[${i}]`, e);
    const entry: SiteIndexEntry = {
      id: er.str("id"),
      name: er.str("name"),
      family: er.oneOf("family", SITE_FAMILIES),
      siteKind: er.oneOf("siteKind", SITE_KINDS),
      country: er.str("country"),
      agency: er.str("agency"),
      outcome: er.oneOf("outcome", OUTCOMES),
      latDeg: er.numOrNull("latDeg"),
      lonDeg: er.numOrNull("lonDeg"),
      pointIsApproximate: er.bool("pointIsApproximate"),
      coordsVerified: er.bool("coordsVerified"),
      landingTimeUtc: er.strOrNull("landingTimeUtc"),
      chapterId: er.oneOfOrNull("chapterId", CHAPTER_IDS),
    };
    return entry;
  });
  return { sites, count: r.has("count") ? r.num("count") : sites.length, updatedAt: r.isoOrNull("updatedAt") };
}

export function catalogMetaFromData(_id: string, d: Data, path = "catalog/meta"): CatalogMeta {
  const r = new Reader(path, d);
  return {
    datasetVersion: r.str("datasetVersion"),
    generatedAt: r.iso("generatedAt"),
    pipelineGitSha: r.str("pipelineGitSha"),
    pipelineVersion: r.str("pipelineVersion"),
    counts: r.obj<Record<string, number>>("counts"),
  };
}

export function storyChapterFromData(id: string, d: Data, path = `storyChapters/${id}`): StoryChapter {
  const r = new Reader(path, d);
  const order = r.num("order");
  if (order !== 1 && order !== 2 && order !== 3) throw new DocumentShapeError(path, `order ${order} is not 1, 2 or 3`);
  const chapterId = new Reader(path, { id }).oneOf("id", CHAPTER_IDS);
  return {
    id: chapterId,
    order,
    title: r.str("title"),
    era: r.str("era"),
    concept: r.str("concept"),
    unlocksTool: r.oneOf("unlocksTool", TOOL_IDS),
    featuredSiteIds: r.strArr("featuredSiteIds"),
    steps: r.arr<StoryChapter["steps"][number]>("steps"),
    debrief: r.obj<StoryChapter["debrief"]>("debrief"),
  };
}

export function missionProfileFromData(id: string, d: Data, path = `missionProfiles/${id}`): MissionProfile {
  const r = new Reader(path, d);
  const profile: MissionProfile = {
    id: new Reader(path, { id }).oneOf("id", MISSION_PROFILE_IDS),
    label: r.str("label"),
    durationHours: r.num("durationHours"),
    description: r.str("description"),
    weights: r.obj<MissionProfile["weights"]>("weights"),
    disqualifiers: r.strArr("disqualifiers"),
    hazardThresholds: r.obj<MissionProfile["hazardThresholds"]>("hazardThresholds"),
  };
  const durationNote = r.strOrNull("durationNote");
  if (durationNote !== null) profile.durationNote = durationNote;
  const weightsBasis = r.oneOfOrNull("weightsBasis", ["sourced", "derived", "assumption"] as const);
  if (weightsBasis !== null) profile.weightsBasis = weightsBasis;
  const weightsNote = r.strOrNull("weightsNote");
  if (weightsNote !== null) profile.weightsNote = weightsNote;
  return profile;
}

export function protectionZoneFromData(id: string, d: Data, path = `protectionZones/${id}`): ProtectionZone {
  const r = new Reader(path, d);
  const g = r.sub("geometry");
  let geometry: ProtectionZone["geometry"];
  const type = g.oneOf("type", ["Polygon", "Circle"] as const);
  if (type === "Circle") {
    geometry = {
      type: "Circle",
      center: coordinatesFrom(g.obj<Data>("center"), `${path}.geometry.center`),
      radiusKm: g.num("radiusKm"),
    };
  } else {
    geometry = { type: "Polygon", coordinates: ringsToCoordinates(g.arr<FirestorePolygonGeometry["rings"][number]>("rings")) };
  }
  const zone: ProtectionZone = {
    id,
    kind: r.oneOf("kind", PROTECTION_KINDS),
    ruleId: r.oneOf("ruleId", PROTECTION_RULES),
    name: r.str("name"),
    siteId: r.strOrNull("siteId"),
    geometry,
    rationale: r.str("rationale"),
    sources: r.arr<SourceRef>("sources"),
    needsData: r.bool("needsData"),
  };
  const buffer = r.objOrNull<NonNullable<ProtectionZone["buffer"]>>("buffer");
  if (buffer) zone.buffer = buffer;
  const areaKm2 = r.numOrNull("areaKm2");
  if (areaKm2 !== null) zone.areaKm2 = areaKm2;
  if ("coldTrapFraction" in d) zone.coldTrapFraction = r.numOrNull("coldTrapFraction");
  return zone;
}

/** GeoJSON -> Firestore shape (used by tests and any admin tooling). */
export function protectionZoneToData(zone: ProtectionZone): Data {
  const { id: _id, geometry, ...rest } = zone;
  void _id;
  const g =
    geometry.type === "Polygon"
      ? ({ type: "Polygon", rings: coordinatesToRings(geometry.coordinates) } satisfies FirestorePolygonGeometry)
      : geometry;
  return { ...rest, geometry: g };
}

export function landerPresetFromData(id: string, d: Data, path = `landerPresets/${id}`): LanderPreset {
  const r = new Reader(path, d);
  const preset: LanderPreset = {
    id,
    label: r.str("label"),
    agency: r.str("agency"),
    mission: r.strOrNull("mission"),
    fields: r.obj<LanderPreset["fields"]>("fields"),
    sources: r.arr<SourceRef>("sources"),
  };
  const facts = r.arrOpt<NonNullable<LanderPreset["facts"]>[number]>("facts");
  if (facts) preset.facts = facts;
  return preset;
}

export function factSheetFromData(id: string, d: Data, path = `facts/${id}`): FactSheet {
  const r = new Reader(path, d);
  return { id, title: r.str("title"), rows: r.arr<FactSheet["rows"][number]>("rows"), updatedAt: r.iso("updatedAt") };
}

export function validationCheckFromData(id: string, d: Data, path = `validationChecks/${id}`): ValidationCheck {
  const r = new Reader(path, d);
  const check: ValidationCheck = {
    id,
    siteId: r.str("siteId"),
    time: r.iso("time"),
    quantity: r.oneOf("quantity", ["sun-elevation-deg", "sun-azimuth-deg", "earth-elevation-deg", "lit-fraction"] as const),
    computed: r.numOrNull("computed"),
    computedBy: r.strOrNull("computedBy"),
    historical: r.numOrNull("historical"),
    historicalKind: r.oneOfOrNull("historicalKind", ["measured", "computed-reconstruction", "planning-value"] as const),
    historicalSource: r.objOrNull<SourceRef>("historicalSource"),
    toleranceDeg: r.numOrNull("toleranceDeg"),
    deltaDeg: r.numOrNull("deltaDeg"),
    status: r.oneOf("status", ["pass", "fail", "pending"] as const),
    note: r.str("note"),
  };
  if ("range" in d) check.range = r.objOrNull<{ min: number; max: number }>("range");
  return check;
}

export function dataSourceFromData(id: string, d: Data, path = `dataSources/${id}`): DataSourceManifest {
  const r = new Reader(path, d);
  return {
    id,
    label: r.str("label"),
    kind: r.oneOf("kind", ["api", "dem", "map", "paper", "document", "catalog"] as const),
    version: r.strOrNull("version"),
    citation: r.strOrNull("citation"),
    doi: r.strOrNull("doi"),
    url: r.strOrNull("url"),
    retrievedAt: r.isoOrNull("retrievedAt"),
    license: r.strOrNull("license"),
    usedFor: r.strArr("usedFor"),
  };
}

// ---------------------------------------------------------------
// Precomputed (binary) data
// ---------------------------------------------------------------

export function ephemerisChunkFromData(id: string, d: Data, path = `ephemerisGlobal/${id}`): EphemerisChunk {
  const r = new Reader(path, d);
  const layout = r.strArr("layout");
  if (layout.length !== EPHEMERIS_LAYOUT.length || layout.some((k, i) => k !== EPHEMERIS_LAYOUT[i])) {
    throw new DocumentShapeError(path, `layout ${JSON.stringify(layout)} != ${JSON.stringify(EPHEMERIS_LAYOUT)}`);
  }
  const count = r.num("count");
  const data = decodeFloat32(r.bytes("data"));
  expectLength(path, "data", data.length, count * EPHEMERIS_LAYOUT.length);
  r.oneOf("timeScale", ["UTC"] as const);
  r.oneOf("source", ["JPL Horizons API"] as const);
  const chunk: EphemerisChunk = {
    id,
    startUtc: r.iso("startUtc"),
    stepMinutes: r.num("stepMinutes"),
    count,
    layout: EPHEMERIS_LAYOUT,
    data,
    sunAngularDiameterDegMean: r.numOrNull("sunAngularDiameterDegMean"),
    frame: r.str("frame"),
    timeScale: "UTC",
    source: "JPL Horizons API",
    horizonsQuery: r.str("horizonsQuery"),
    ephemerisVersion: r.strOrNull("ephemerisVersion"),
    retrievedAt: r.iso("retrievedAt"),
  };
  const siteId = r.strOrNull("siteId");
  if (siteId !== null) chunk.siteId = siteId;
  const windowCentreUtc = r.isoOrNull("windowCentreUtc");
  if (windowCentreUtc !== null) chunk.windowCentreUtc = windowCentreUtc;
  return chunk;
}

export function siteTerrainFromData(_id: string, d: Data, path = "sites/?/terrain/v1"): SiteTerrain {
  const r = new Reader(path, d);
  const bins = r.num("bins");
  const binDeg = r.num("binDeg");
  const mask = decodeFloat32(r.bytes("mask"));
  expectLength(path, "mask", mask.length, bins);
  const maskP05 = floatsOrNull(r, "maskP05");
  const maskP95 = floatsOrNull(r, "maskP95");
  const maskSigma = floatsOrNull(r, "maskSigma");
  const distAtMax = floatsOrNull(r, "distAtMaxKm");
  for (const [field, arr] of [["maskP05", maskP05], ["maskP95", maskP95], ["maskSigma", maskSigma], ["distAtMaxKm", distAtMax]] as const) {
    if (arr) expectLength(path, field, arr.length, bins);
  }
  const terrain: SiteTerrain = {
    mask: {
      source: "LOLA DEM",
      binDeg,
      maskElevationDeg: mask,
      maskP05Deg: maskP05,
      maskP95Deg: maskP95,
      errorMarginDeg: r.num("errorMarginDeg"),
      maskSigmaDeg: maskSigma,
      demProducts: r.strArr("demProducts"),
      rayLengthKm: r.num("rayLengthKm"),
      observerHeightM: r.num("observerHeightM"),
    },
    distAtMaxKm: distAtMax,
    slope100mDeg: r.numOrNull("slope100mDeg"),
    slope100mErrDeg: r.numOrNull("slope100mErrDeg"),
    roughness100mM: r.numOrNull("roughness100mM"),
    nearestPsrKm: r.numOrNull("nearestPsrKm"),
    nearestColdTrapPsrKm: r.numOrNull("nearestColdTrapPsrKm"),
    insidePsr: r.boolOrNull("insidePsr"),
    litFractionCheck: r.objOrNull<NonNullable<SiteTerrain["litFractionCheck"]>>("litFractionCheck"),
    sources: r.arrOpt<SourceRef>("sources") ?? [],
  };
  const computedAt = r.isoOpt("computedAt");
  if (computedAt) terrain.computedAt = computedAt;
  const pipelineVersion = r.strOrNull("pipelineVersion");
  if (pipelineVersion !== null) terrain.pipelineVersion = pipelineVersion;
  const notes = r.arrOpt<string>("notes");
  if (notes) terrain.notes = notes;
  return terrain;
}

export function terrainGridTileFromData(id: string, d: Data, path = `terrainGrid/${id}`): TerrainGridTile {
  const r = new Reader(path, d);
  const cellsPerSide = r.num("cellsPerSide");
  const bins = r.num("bins");
  const cells = cellsPerSide * cellsPerSide;
  const masks = decodeInt16(r.bytes("masks"));
  expectLength(path, "masks", masks.length, cells * bins);
  const maskErr = decodeUint8(r.bytes("maskErr"));
  expectLength(path, "maskErr", maskErr.length, cells * bins);
  let cellStats: TerrainGridTile["cellStats"];
  try {
    cellStats = decodeCellStats(r.bytes("cellStats"), masks, bins, cells);
  } catch (e) {
    throw new DocumentShapeError(path, (e as Error).message);
  }
  const origin = r.sub("tileOriginXY");
  return {
    id,
    gridSpacingKm: r.num("gridSpacingKm"),
    tileOriginXY: { xM: origin.num("xM"), yM: origin.num("yM") },
    cellsPerSide,
    binDeg: r.num("binDeg"),
    bins,
    masks,
    maskErr,
    cellStats,
    demProducts: r.strArr("demProducts"),
    rayLengthKm: r.num("rayLengthKm"),
    observerHeightM: r.num("observerHeightM"),
    computedAt: r.iso("computedAt"),
  };
}

export function psrLayerFromData(id: string, d: Data, path = `psrLayer/${id}`): PsrLayer {
  const r = new Reader(path, d);
  let polygons: PsrLayer["polygons"];
  try {
    polygons = decodePsrPolygons(r.bytes("polygons"), r.bytes("index"), r.arrOpt<{ i: number; name: string }>("names") ?? []);
  } catch (e) {
    throw new DocumentShapeError(path, (e as Error).message);
  }
  const count = r.num("count");
  expectLength(path, "index", polygons.length, count);
  return {
    id,
    count,
    encoding: r.str("encoding"),
    polygons,
    simplifyToleranceM: r.num("simplifyToleranceM"),
    minAreaKm2: r.num("minAreaKm2"),
    sources: r.arrOpt<SourceRef>("sources") ?? [],
  };
}

export function homeDemoFromData(id: string, d: Data, path = `demo/${id}`): HomeDemo {
  const r = new Reader(path, d);
  const count = r.num("count");
  const series = decodeFloat32(r.bytes("series"));
  expectLength(path, "series", series.length, count * 4);
  const maskBinDeg = r.num("maskBinDeg");
  const mask = decodeFloat32(r.bytes("mask"));
  expectLength(path, "mask", mask.length, Math.round(360 / maskBinDeg));
  const demo: HomeDemo = {
    siteId: r.str("siteId"),
    startUtc: r.iso("startUtc"),
    stepMinutes: r.num("stepMinutes"),
    count,
    series,
    mask,
    maskBinDeg,
  };
  const siteLabel = r.strOrNull("siteLabel");
  if (siteLabel !== null) demo.siteLabel = siteLabel;
  const note = r.strOrNull("note");
  if (note !== null) demo.note = note;
  return demo;
}

// ---------------------------------------------------------------
// Converter instances
// ---------------------------------------------------------------

export const siteConverter = readOnly("sites", siteFromData);
export const siteIndexConverter = readOnly("catalog", siteIndexFromData);
export const catalogMetaConverter = readOnly("catalog", catalogMetaFromData);
export const storyChapterConverter = readOnly("storyChapters", storyChapterFromData);
export const missionProfileConverter = readOnly("missionProfiles", missionProfileFromData);
export const protectionZoneConverter = readOnly("protectionZones", protectionZoneFromData);
export const landerPresetConverter = readOnly("landerPresets", landerPresetFromData);
export const factSheetConverter = readOnly("facts", factSheetFromData);
export const validationCheckConverter = readOnly("validationChecks", validationCheckFromData);
export const dataSourceConverter = readOnly("dataSources", dataSourceFromData);
export const ephemerisChunkConverter = readOnly("ephemerisGlobal", ephemerisChunkFromData);
export const siteTerrainConverter = readOnly("terrain", siteTerrainFromData);
export const terrainGridTileConverter = readOnly("terrainGrid", terrainGridTileFromData);
export const psrLayerConverter = readOnly("psrLayer", psrLayerFromData);
export const homeDemoConverter = readOnly("demo", homeDemoFromData);

export * from "./userConverters";
