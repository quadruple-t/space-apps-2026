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
  resolutionMeters: number;
  provenance: "scaffold" | "LOLA";
  latitudesDeg: number[];
  longitudesDeg: number[];
  samples: TerrainSample[][];
};

const latitudesDeg = [-90, -45, 0, 45, 90];
const longitudesDeg = [0, 45, 90, 135, 180, 225, 270, 315];

// Structured placeholder values make the interpolation path usable before a
// measured LOLA tile is wired in. Keep the synthetic provenance explicit.
export const SCAFFOLD_MOON_GRID: TerrainGrid = {
  id: "scaffold-global-45deg",
  name: "Global terrain scaffold",
  coordinateReference: "Planetocentric latitude, east-positive longitude",
  elevationUnits: "m",
  resolutionMeters: 50_000,
  provenance: "scaffold",
  latitudesDeg,
  longitudesDeg,
  samples: latitudesDeg.map((latitudeDeg, row) => longitudesDeg.map((longitudeDeg, column) => ({
    latitudeDeg,
    longitudeDeg,
    elevationMeters: Math.round(
      -1900 + Math.sin((latitudeDeg * Math.PI) / 180) * 420 +
      Math.cos((longitudeDeg * Math.PI) / 90) * 310 + ((row * 17 + column * 29) % 7) * 34,
    ),
    slopeDeg: Math.round(2 + Math.abs(Math.sin((latitudeDeg + longitudeDeg) * Math.PI / 180)) * 17 + ((row + column) % 4)),
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

/** Selectable pins are illustrative exploration targets, not verified sites. */
export const MOON_REGIONS: MoonRegion[] = [
  { id: "south-pole", label: "South pole", note: "Polar lighting study", site: site("south-pole-scaffold", "South pole · scaffold point", -89.5, 222.7) },
  { id: "near-side", label: "Near side", note: "Central near-side terrain", site: site("near-side-scaffold", "Near side · scaffold point", 8.0, 20.0) },
  { id: "western-limb", label: "Western limb", note: "Limb terrain sample", site: site("west-limb-scaffold", "Western limb · scaffold point", 14.0, 315.0) },
  { id: "far-side", label: "Far side", note: "Far-side terrain sample", site: site("far-side-scaffold", "Far side · scaffold point", -12.0, 175.0) },
  { id: "north-pole", label: "North pole", note: "Polar terrain sample", site: site("north-pole-scaffold", "North pole · scaffold point", 89.5, 42.0) },
];
