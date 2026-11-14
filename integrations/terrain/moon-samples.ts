import type { LunarSite } from "@/integrations/science/types";

/**
 * Replaceable boundary for regional elevation grids. Values here are synthetic
 * scaffolding, not LOLA measurements. Longitudes are east-positive and wrap at
 * 360 degrees; latitude rows run south to north.
 */
export type TerrainSample = {
  latitudeDeg: number;
  longitudeDeg: number;
  elevationMeters: number;
  slopeDeg: number;
};

export type TerrainGrid = {
  id: string;
  name: string;
  coordinateReference: "Planetocentric latitude, east-positive longitude";
  elevationUnits: "m";
  latitudeLongitudeSpacingDeg: { latitude: number; longitude: number };
  provenance: "scaffold" | "LOLA";
  landform?: string;
  extentKm?: number;
  latitudesDeg: number[];
  longitudesDeg: number[];
  samples: TerrainSample[][];
};

const latitudesDeg = [-90, -45, 0, 45, 90];
const longitudesDeg = [0, 45, 90, 135, 180, 225, 270, 315];

// Smooth, plausible-scale regional relief values make interpolation useful
// before a measured LOLA tile is wired in. These are illustrative scaffold
// elevations (including broad mare, basin, and highland trends), not samples
// extracted from LOLA. Keep the synthetic provenance explicit.
const scaffoldElevationsMeters = [
  [-5100, -5300, -4700, -5100, -5500, -5000, -4500, -5000],
  [-2800, -1200, 600, -3500, -6200, -3000, 500, -800],
  [-2000, -1800, -2700, -1000, 1500, 2200, 700, -1300],
  [1000, 1800, 3200, 2500, 4000, 3100, 2700, 1600],
  [1600, 1400, 1200, 1700, 1300, 1100, 1500, 1800],
];
const scaffoldSlopesDeg = [
  [8, 10, 7, 9, 12, 8, 6, 9],
  [6, 8, 12, 9, 14, 7, 11, 6],
  [4, 5, 8, 6, 9, 7, 5, 4],
  [5, 7, 9, 6, 11, 8, 7, 5],
  [7, 6, 5, 8, 6, 5, 7, 6],
];
export const SCAFFOLD_MOON_GRID: TerrainGrid = {
  id: "scaffold-global-45deg",
  name: "Global terrain scaffold",
  coordinateReference: "Planetocentric latitude, east-positive longitude",
  elevationUnits: "m",
  latitudeLongitudeSpacingDeg: { latitude: 45, longitude: 45 },
  provenance: "scaffold",
  latitudesDeg,
  longitudesDeg,
  samples: latitudesDeg.map((latitudeDeg, row) => longitudesDeg.map((longitudeDeg, column) => ({
    latitudeDeg,
    longitudeDeg,
    elevationMeters: scaffoldElevationsMeters[row][column],
    slopeDeg: scaffoldSlopesDeg[row][column],
  }))),
};

export type InterpolatedTerrain = {
  elevationMeters: number;
  slopeDeg: number;
  method: "bilinear";
  corners: TerrainSample[];
  fractionLatitude: number;
  fractionLongitude: number;
};

function bracket(values: number[], value: number) {
  const upper = values.findIndex((sample) => sample >= value);
  if (upper <= 0) return { lower: 0, upper: Math.max(1, upper), fraction: 0 };
  const lower = upper - 1;
  return { lower, upper, fraction: (value - values[lower]) / (values[upper] - values[lower]) };
}

/** Bilinearly sample a regular grid, wrapping east longitude across 360°/0°. */
export function interpolateTerrain(grid: TerrainGrid, latitudeDeg: number, longitudeDeg: number): InterpolatedTerrain {
  const lat = Math.max(grid.latitudesDeg[0], Math.min(grid.latitudesDeg.at(-1)!, latitudeDeg));
  const lon = ((longitudeDeg % 360) + 360) % 360;
  const latBracket = bracket(grid.latitudesDeg, lat);
  const lonLower = grid.longitudesDeg.findLastIndex((sample) => sample <= lon);
  const x0 = Math.max(0, lonLower);
  const x1 = (x0 + 1) % grid.longitudesDeg.length;
  const lon0 = grid.longitudesDeg[x0];
  const lon1 = x1 === 0 ? 360 : grid.longitudesDeg[x1];
  const longitude = lon < lon0 ? lon + 360 : lon;
  const fx = Math.max(0, Math.min(1, (longitude - lon0) / (lon1 - lon0)));
  const { lower: y0, upper: y1, fraction: fy } = latBracket;
  const corners = [grid.samples[y0][x0], grid.samples[y0][x1], grid.samples[y1][x0], grid.samples[y1][x1]];
  const blend = (key: "elevationMeters" | "slopeDeg") => {
    const south = corners[0][key] * (1 - fx) + corners[1][key] * fx;
    const north = corners[2][key] * (1 - fx) + corners[3][key] * fx;
    return south * (1 - fy) + north * fy;
  };
  return { elevationMeters: blend("elevationMeters"), slopeDeg: blend("slopeDeg"), method: "bilinear", corners, fractionLatitude: fy, fractionLongitude: fx };
}

export type MoonRegion = {
  id: string;
  label: string;
  note: string;
  site: LunarSite;
};

const site = (id: string, name: string, latitudeDeg: number, longitudeDeg: number): LunarSite => ({
  id,
  name,
  latitudeDeg,
  longitudeDeg,
  coordinateReference: "Planetocentric latitude, east-positive longitude",
  provenance: "illustrative",
});

/** Named south-pole target coordinates; elevation values remain scaffolded. */
export const MOON_REGIONS: MoonRegion[] = [
  { id: "connecting-ridge", label: "Connecting Ridge", note: "LOLA south-pole candidate · Site 01", site: site("connecting-ridge", "Connecting Ridge · Site 01", -89.4632, 222.51) },
  { id: "shackleton-rim", label: "Shackleton Rim", note: "LOLA south-pole candidate · Site 04", site: site("shackleton-rim", "Shackleton Rim · Site 04", -89.7668, 188.13) },
  { id: "peak-near-shackleton", label: "Peak near Shackleton", note: "LOLA south-pole candidate · Site 07", site: site("peak-near-shackleton", "Peak near Shackleton · Site 07", -88.811, 123.6901) },
  { id: "de-gerlache-rim", label: "de Gerlache Rim", note: "LOLA south-pole candidate · Site 11", site: site("de-gerlache-rim", "de Gerlache Rim · Site 11", -88.6834, 292.0679) },
  { id: "malapert-massif", label: "Malapert Massif", note: "LOLA south-pole candidate · Site 23", site: site("malapert-massif", "Malapert Massif · Site 23", -85.9948, 359.76422) },
];

const LOCAL_LANDFORMS: Record<string, { name: string; relief: (eastKm: number, northKm: number) => number }> = {
  "connecting-ridge": {
    name: "Ridge crest",
    relief: (east, north) => 560 * Math.exp(-(((east - north * 0.24) / 2.3) ** 2)) * Math.exp(-((north / 16) ** 4)) - 150 * Math.exp(-(((east + 7) / 2.8) ** 2 + ((north - 1) / 2.4) ** 2)),
  },
  "shackleton-rim": {
    name: "Crater rim and bowl",
    relief: (east, north) => {
      const radius = Math.hypot(east + 1.2, north - 0.8);
      return -520 * Math.exp(-((radius / 4.6) ** 2)) + 420 * Math.exp(-(((radius - 6.4) / 1.1) ** 2));
    },
  },
  "peak-near-shackleton": {
    name: "Impact peak",
    relief: (east, north) => 980 * Math.exp(-(((east / 3.5) ** 2 + (north / 4.2) ** 2))) - 210 * Math.exp(-(((east - 7) / 2.4) ** 2 + ((north + 3) / 2.2) ** 2)),
  },
  "de-gerlache-rim": {
    name: "Crater rim with ridge",
    relief: (east, north) => {
      const radius = Math.hypot(east - 1.5, north + 1.2);
      const rim = -430 * Math.exp(-((radius / 4.3) ** 2)) + 380 * Math.exp(-(((radius - 6.1) / 1.15) ** 2));
      const ridge = 330 * Math.exp(-(((east + 0.35 * north + 7) / 2.1) ** 2)) * Math.exp(-((north / 14) ** 4));
      return rim + ridge;
    },
  },
  "malapert-massif": {
    name: "Broad massif",
    relief: (east, north) => 1150 * Math.exp(-(((east / 8.2) ** 2 + (north / 13.5) ** 2))) + 310 * Math.exp(-((((east - 7) / 3.2) ** 2 + ((north + 5) / 4.8) ** 2))),
  },
};

const regionalGridCache = new Map<string, TerrainGrid>();

const GENERIC_LANDFORMS = [
  LOCAL_LANDFORMS["connecting-ridge"],
  LOCAL_LANDFORMS["shackleton-rim"],
  LOCAL_LANDFORMS["peak-near-shackleton"],
  LOCAL_LANDFORMS["malapert-massif"],
  LOCAL_LANDFORMS["de-gerlache-rim"],
];

function coordinateSeed(latitudeDeg: number, longitudeDeg: number) {
  const source = `${latitudeDeg.toFixed(2)}:${longitudeDeg.toFixed(2)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** A local, smoothly sampled relief map for each named landform. Values are scaffolded. */
export function terrainGridForSite(selectedSite: LunarSite): TerrainGrid {
  const region = MOON_REGIONS.find(({ site: regionSite }) => regionSite.id === selectedSite.id);
  const cacheKey = region?.id ?? `${selectedSite.latitudeDeg.toFixed(2)}:${selectedSite.longitudeDeg.toFixed(2)}`;
  const cached = regionalGridCache.get(cacheKey);
  if (cached) return cached;

  const selectedModel = region ? LOCAL_LANDFORMS[region.id] : GENERIC_LANDFORMS[coordinateSeed(selectedSite.latitudeDeg, selectedSite.longitudeDeg) % GENERIC_LANDFORMS.length];
  const model = selectedModel;
  const latitudeHalfSpan = 0.08;
  const latitudeStep = latitudeHalfSpan / 4;
  const latitudes = Array.from({ length: 9 }, (_, index) => Number(Math.max(-90, Math.min(90, selectedSite.latitudeDeg - latitudeHalfSpan + index * latitudeStep)).toFixed(5)));
  const uniqueLatitudes = [...new Set(latitudes)].sort((a, b) => a - b);
  const cosineLatitude = Math.max(0.035, Math.cos((selectedSite.latitudeDeg * Math.PI) / 180));
  const longitudeHalfSpan = Math.min(45, 8 / (111.32 * cosineLatitude));
  const longitudeStep = longitudeHalfSpan / 4;
  const longitudes = Array.from({ length: 9 }, (_, index) => {
    const longitude = selectedSite.longitudeDeg - longitudeHalfSpan + index * longitudeStep;
    return Number((((longitude % 360) + 360) % 360).toFixed(5));
  }).sort((a, b) => a - b);
  const baseElevation = interpolateTerrain(SCAFFOLD_MOON_GRID, selectedSite.latitudeDeg, selectedSite.longitudeDeg).elevationMeters;
  const elevations = uniqueLatitudes.map((latitude) => longitudes.map((longitude) => {
    const longitudeDelta = ((longitude - selectedSite.longitudeDeg + 540) % 360) - 180;
    const eastKm = longitudeDelta * 111.32 * cosineLatitude;
    const northKm = (latitude - selectedSite.latitudeDeg) * 111.32;
    const smallRelief = 18 * Math.sin(eastKm * 1.7 + northKm * 0.6) * Math.cos(northKm * 1.2 - eastKm * 0.4);
    return baseElevation + model.relief(eastKm, northKm) + smallRelief;
  }));
  const latSpacing = uniqueLatitudes.length > 1 ? uniqueLatitudes[1] - uniqueLatitudes[0] : latitudeStep;
  const samples = elevations.map((row, rowIndex) => row.map((elevationMeters, columnIndex) => {
    const southIndex = Math.max(0, rowIndex - 1);
    const northIndex = Math.min(elevations.length - 1, rowIndex + 1);
    const westIndex = (columnIndex + longitudes.length - 1) % longitudes.length;
    const eastIndex = (columnIndex + 1) % longitudes.length;
    const northDistance = Math.max(1, (uniqueLatitudes[northIndex] - uniqueLatitudes[southIndex]) * 111_320);
    const eastDistance = Math.max(1, longitudeStep * 2 * 111_320 * cosineLatitude);
    const northGradient = (elevations[northIndex][columnIndex] - elevations[southIndex][columnIndex]) / northDistance;
    const eastGradient = (row[eastIndex] - row[westIndex]) / eastDistance;
    const slopeDeg = Math.atan(Math.hypot(northGradient, eastGradient)) * 180 / Math.PI;
    return { latitudeDeg: uniqueLatitudes[rowIndex], longitudeDeg: longitudes[columnIndex], elevationMeters, slopeDeg };
  }));
  const grid: TerrainGrid = {
    id: `scaffold-${cacheKey.replaceAll(":", "-")}-local`,
    name: `${region?.label ?? selectedSite.name} local relief map`,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    elevationUnits: "m",
    latitudeLongitudeSpacingDeg: { latitude: latSpacing, longitude: longitudeStep },
    provenance: "scaffold",
    landform: model.name,
    extentKm: Math.round(latitudeHalfSpan * 2 * 111.32),
    latitudesDeg: uniqueLatitudes,
    longitudesDeg: longitudes,
    samples,
  };
  if (regionalGridCache.size >= 48) {
    const oldestKey = regionalGridCache.keys().next().value;
    if (oldestKey !== undefined) regionalGridCache.delete(oldestKey);
  }
  regionalGridCache.set(cacheKey, grid);
  return grid;
}
