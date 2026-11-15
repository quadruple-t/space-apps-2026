/**
 * Site-centred elevation grids for the surface drive.
 *
 * Source: LROC Lunaserv's numeric GLD100 layer (`luna_wac_dtm_numeric`), requested in a
 * site-centred orthographic projection (IAU2000:30166) so the grid is a square of metres on
 * the plane tangent to the 1737.4 km reference sphere at the site. Values are heights above
 * that sphere (the datum the LOLA / PGDA products and the data pipeline use).
 *
 * Grid convention (shared by the API route, the client decoder and the 3D scene):
 *   - `size` × `size` samples, row 0 = north edge, column 0 = west edge
 *   - sample (i, j) sits at east = -halfExtentM + i·spacingM, north = halfExtentM - j·spacingM
 *   - scene axes: +X east, -Z north, +Y up (see data/hero-scene.ts `horizonDirection`)
 */

export const MOON_RADIUS_M = 1_737_400;
export const DEM_LAYER = "luna_wac_dtm_numeric";
export const DEM_SERVICE_URL = "https://wms.im-ldi.com/";
export const DEM_NOMINAL_RESOLUTION_M = 100;
export const DEM_MIN_RADIUS_KM = 0.1;
export const DEM_MAX_RADIUS_KM = 500;
export const DEM_MIN_SIZE = 33;
export const DEM_MAX_SIZE = 257;
export const DEM_DEFAULT_SIZE = 257;
/** Lunar topography spans about -9.1 km to +10.8 km; anything outside is treated as no-data. */
const PLAUSIBLE_HEIGHT_M = 12_000;

export const DEM_SOURCE = {
  product: "LROC WAC GLD100 global DTM (Lunaserv numeric layer)",
  layer: DEM_LAYER,
  service: "LROC Lunaserv WMS 1.1.1",
  url: DEM_SERVICE_URL,
  nominalResolutionM: DEM_NOMINAL_RESOLUTION_M,
  datum: "Heights above the 1737.4 km reference sphere",
  projection: "Orthographic, centred on the site (IAU2000:30166)",
} as const;

export type DemQuery = { latDeg: number; lonDeg: number; radiusKm: number; size: number };

export type DemGrid = {
  size: number;
  halfExtentM: number;
  spacingM: number;
  /** Heights above the 1737.4 km sphere, row-major, north row first. */
  heightsM: Float32Array;
  minM: number;
  maxM: number;
};

type Params = { get(name: string): string | null };

/** Validate and normalise query parameters. Rounding keeps cache keys stable. */
export function parseDemQuery(p: Params): DemQuery | { error: string } {
  const lat = Number(p.get("lat"));
  const lonRaw = Number(p.get("lon"));
  const radiusKm = Number(p.get("radiusKm") ?? 5);
  const sizeRaw = p.get("size") === null ? DEM_DEFAULT_SIZE : Number(p.get("size"));
  if (p.get("lat") === null || p.get("lon") === null || !Number.isFinite(lat) || !Number.isFinite(lonRaw)) return { error: "lat and lon are required" };
  if (lat < -90 || lat > 90) return { error: "lat must be between -90 and 90" };
  if (lonRaw < -180 || lonRaw > 360) return { error: "lon must be between -180 and 360" };
  if (!Number.isFinite(radiusKm) || radiusKm < DEM_MIN_RADIUS_KM || radiusKm > DEM_MAX_RADIUS_KM) {
    return { error: `radiusKm must be between ${DEM_MIN_RADIUS_KM} and ${DEM_MAX_RADIUS_KM}` };
  }
  if (!Number.isInteger(sizeRaw) || sizeRaw < DEM_MIN_SIZE || sizeRaw > DEM_MAX_SIZE || sizeRaw % 2 === 0) {
    return { error: `size must be an odd integer from ${DEM_MIN_SIZE} to ${DEM_MAX_SIZE}` };
  }
  const lon = ((lonRaw + 540) % 360) - 180;
  return {
    latDeg: Number(lat.toFixed(4)),
    lonDeg: Number(lon.toFixed(4)),
    radiusKm: Number(radiusKm.toPrecision(3)),
    size: sizeRaw,
  };
}

/** WMS GetMap request for the site-centred float32 GeoTIFF. */
export function demRequestUrl(q: DemQuery): string {
  const half = q.radiusKm * 1000;
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetMap", LAYERS: DEM_LAYER, STYLES: "",
    SRS: `IAU2000:30166,9001,${q.lonDeg},${q.latDeg}`,
    BBOX: `${-half},${-half},${half},${half}`,
    WIDTH: String(q.size), HEIGHT: String(q.size), FORMAT: "image/tiff",
  });
  return `${DEM_SERVICE_URL}?${params}`;
}

/**
 * Minimal baseline-TIFF reader for single-band, uncompressed 32-bit float images, which is what
 * Lunaserv returns for numeric layers. Anything else is rejected rather than guessed at.
 */
export function decodeFloat32Tiff(buffer: ArrayBuffer | Uint8Array): { width: number; height: number; data: Float32Array } {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 8) throw new Error("Not a TIFF image");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = String.fromCharCode(bytes[0], bytes[1]);
  if (order !== "II" && order !== "MM") throw new Error("Not a TIFF image");
  const le = order === "II";
  if (view.getUint16(2, le) !== 42) throw new Error("Unsupported TIFF variant");
  const ifd = view.getUint32(4, le);
  const count = view.getUint16(ifd, le);
  const tags = new Map<number, number[]>();
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    const tag = view.getUint16(entry, le);
    const type = view.getUint16(entry + 2, le);
    const n = view.getUint32(entry + 4, le);
    const width = type === 3 ? 2 : type === 4 ? 4 : 0;
    if (!width) continue; // only SHORT / LONG tags are needed
    const inline = n * width <= 4;
    const at = inline ? entry + 8 : view.getUint32(entry + 8, le);
    const values: number[] = [];
    for (let v = 0; v < n; v++) values.push(width === 2 ? view.getUint16(at + v * 2, le) : view.getUint32(at + v * 4, le));
    tags.set(tag, values);
  }
  const width = tags.get(256)?.[0];
  const height = tags.get(257)?.[0];
  const bits = tags.get(258)?.[0];
  const compression = tags.get(259)?.[0] ?? 1;
  const samples = tags.get(277)?.[0] ?? 1;
  const format = tags.get(339)?.[0] ?? 1;
  const offsets = tags.get(273);
  const counts = tags.get(279);
  if (!width || !height || !offsets?.length) throw new Error("TIFF is missing image structure tags");
  if (bits !== 32 || format !== 3 || samples !== 1 || compression !== 1) throw new Error("Expected an uncompressed single-band float32 TIFF");
  const expected = width * height * 4;
  const out = new Float32Array(width * height);
  let written = 0;
  for (let s = 0; s < offsets.length && written < expected; s++) {
    const length = Math.min(counts?.[s] ?? expected - written, expected - written);
    if (offsets[s] + length > bytes.length) throw new Error("TIFF strip runs past the end of the file");
    for (let b = 0; b < length; b += 4) out[(written + b) / 4] = view.getFloat32(offsets[s] + b, le);
    written += length;
  }
  if (written < expected) throw new Error("TIFF image data is truncated");
  return { width, height, data: out };
}

/**
 * Convert the decoded raster (kilometres) to metres and fill isolated no-data samples from
 * their neighbours. Throws when too little of the window holds data.
 */
export function heightsFromRaster(raster: Float32Array, size: number): Float32Array {
  const out = new Float32Array(raster.length);
  const valid = new Uint8Array(raster.length);
  let good = 0;
  for (let i = 0; i < raster.length; i++) {
    const m = raster[i] * 1000;
    if (Number.isFinite(m) && Math.abs(m) <= PLAUSIBLE_HEIGHT_M) { out[i] = m; valid[i] = 1; good++; }
  }
  if (good < raster.length * 0.5) throw new Error("Elevation window is mostly no-data");
  // Grow valid data into gaps, one ring per pass.
  for (let pass = 0; good < raster.length && pass < size; pass++) {
    const next = valid.slice();
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const k = j * size + i;
      if (valid[k]) continue;
      let sum = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
        const kk = jj * size + ii;
        if (valid[kk]) { sum += out[kk]; n++; }
      }
      if (n) { out[k] = sum / n; next[k] = 1; good++; }
    }
    valid.set(next);
  }
  return out;
}

/**
 * The source posting is about 100 m and its heights come in whole-metre steps, so gentle slopes
 * become flat terraces with straight edges. On a finer grid those show up as fake creases in the
 * lighting, slope and colour. Smooth with [1 2 1] passes to roughly one source posting; coarser grids
 * are left alone. Returns the number of passes applied.
 */
export function smoothToSourceResolution(heightsM: Float32Array, size: number, spacingM: number): number {
  const passes = Math.min(60, Math.round(2 * (DEM_NOMINAL_RESOLUTION_M / spacingM) ** 2));
  if (spacingM >= DEM_NOMINAL_RESOLUTION_M * 0.8 || passes <= 0) return 0;
  const tmp = new Float32Array(heightsM.length);
  const clamp = (v: number) => Math.max(0, Math.min(size - 1, v));
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) tmp[j * size + i] = (heightsM[j * size + clamp(i - 1)] + 2 * heightsM[j * size + i] + heightsM[j * size + clamp(i + 1)]) / 4;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) heightsM[j * size + i] = (tmp[clamp(j - 1) * size + i] + 2 * tmp[j * size + i] + tmp[clamp(j + 1) * size + i]) / 4;
  }
  return passes;
}

export function makeGrid(heightsM: Float32Array, size: number, radiusKm: number): DemGrid {
  let minM = Infinity, maxM = -Infinity;
  for (const h of heightsM) { if (h < minM) minM = h; if (h > maxM) maxM = h; }
  const halfExtentM = radiusKm * 1000;
  return { size, halfExtentM, spacingM: (2 * halfExtentM) / (size - 1), heightsM, minM, maxM };
}

export function encodeHeights(heightsM: Float32Array): Uint8Array {
  const out = new Int16Array(heightsM.length);
  for (let i = 0; i < heightsM.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(heightsM[i])));
  return new Uint8Array(out.buffer);
}

export function decodeHeights(bytes: Uint8Array, count: number): Float32Array {
  if (bytes.byteLength !== count * 2) throw new Error("Height payload has the wrong length");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Fractional grid coordinates for a local east/north offset. */
export function gridCoords(grid: DemGrid, eastM: number, northM: number) {
  return { gi: (eastM + grid.halfExtentM) / grid.spacingM, gj: (grid.halfExtentM - northM) / grid.spacingM };
}

/** Bilinear sample of any per-sample field laid out like the grid, clamped at the edges. */
export function sampleField(field: ArrayLike<number>, size: number, gi: number, gj: number): number {
  const max = size - 1;
  const x = Math.max(0, Math.min(max, gi));
  const y = Math.max(0, Math.min(max, gj));
  const i0 = Math.min(max - 1, Math.floor(x));
  const j0 = Math.min(max - 1, Math.floor(y));
  const fx = x - i0, fy = y - j0;
  const k = j0 * size + i0;
  const top = field[k] + (field[k + 1] - field[k]) * fx;
  const bottom = field[k + size] + (field[k + size + 1] - field[k + size]) * fx;
  return top + (bottom - top) * fy;
}

/** Terrain height (m above the reference sphere) at a local east/north offset from the site. */
export function heightAtLocal(grid: DemGrid, eastM: number, northM: number): number {
  const { gi, gj } = gridCoords(grid, eastM, northM);
  return sampleField(grid.heightsM, grid.size, gi, gj);
}

/** Surface slope in degrees from central differences over one grid spacing either side. */
export function slopeAtLocal(grid: DemGrid, eastM: number, northM: number): number {
  const d = grid.spacingM;
  const dzdx = (heightAtLocal(grid, eastM + d, northM) - heightAtLocal(grid, eastM - d, northM)) / (2 * d);
  const dzdy = (heightAtLocal(grid, eastM, northM + d) - heightAtLocal(grid, eastM, northM - d)) / (2 * d);
  return (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
}

/** Drop of the reference sphere below the site's tangent plane at a horizontal distance. */
export function curvatureDropM(distanceM: number): number {
  const r = MOON_RADIUS_M;
  return r - Math.sqrt(Math.max(0, r * r - distanceM * distanceM));
}

/** Height of a point relative to the site's tangent plane, including curvature. */
export function tangentPlaneHeight(eastM: number, northM: number, heightM: number, exaggeration = 1): number {
  const rho = Math.hypot(eastM, northM);
  const cosC = Math.sqrt(Math.max(0, 1 - (rho / MOON_RADIUS_M) ** 2));
  return (MOON_RADIUS_M + heightM * exaggeration) * cosC - MOON_RADIUS_M;
}

/**
 * Elevation angle (deg) of the terrain horizon seen from a point, looking toward `azimuthDeg`
 * (clockwise from north), using only terrain inside the grid. Includes lunar curvature.
 * Returns -90 when nothing within the grid rises above the observer's horizontal plane.
 */
export function horizonElevationDeg(grid: DemGrid, eastM: number, northM: number, azimuthDeg: number, observerHeightM = 2): number {
  const az = (azimuthDeg * Math.PI) / 180;
  const ux = Math.sin(az), uy = Math.cos(az);
  const h0 = heightAtLocal(grid, eastM, northM) + observerHeightM;
  const step = grid.spacingM * 0.75;
  const limit = grid.halfExtentM * Math.SQRT2 * 2;
  let best = -Math.PI / 2;
  for (let d = step; d < limit; d += step) {
    const e = eastM + ux * d, n = northM + uy * d;
    if (Math.abs(e) > grid.halfExtentM || Math.abs(n) > grid.halfExtentM) break;
    const rise = heightAtLocal(grid, e, n) - h0 - (d * d) / (2 * (MOON_RADIUS_M + h0));
    const angle = Math.atan2(rise, d);
    if (angle > best) best = angle;
  }
  return (best * 180) / Math.PI;
}

/** Horizon profile around a point, one value per azimuth bin (bin 0 = north, clockwise). */
export function horizonProfile(grid: DemGrid, eastM: number, northM: number, stepDeg = 4, observerHeightM = 2): number[] {
  const out: number[] = [];
  for (let az = 0; az < 360; az += stepDeg) out.push(horizonElevationDeg(grid, eastM, northM, az, observerHeightM));
  return out;
}

/** Earth's angular radius seen from the Moon, degrees. */
export const EARTH_RADIUS_DEG = 0.95;

/** Sun's angular radius; partial visibility is interpolated across the disc. */
export const SUN_RADIUS_DEG = 0.267;

/** Fraction (0–1) of the solar disc above a horizon elevation. */
export function discVisibleFraction(bodyElevationDeg: number, horizonDeg: number, radiusDeg = SUN_RADIUS_DEG): number {
  const t = (bodyElevationDeg - horizonDeg + radiusDeg) / (2 * radiusDeg);
  return Math.max(0, Math.min(1, t));
}

/**
 * Re-express a direction given as azimuth/elevation at the site centre in the local horizon
 * frame of another point on the tile (whose vertical is tilted by the Moon's curvature).
 * Sun and Earth are effectively at infinity, so the direction itself is unchanged.
 */
export function skyAtLocal(siteLatDeg: number, eastM: number, northM: number, azimuthDeg: number, elevationDeg: number): { azimuthDeg: number; elevationDeg: number } {
  const rad = Math.PI / 180;
  const az = azimuthDeg * rad, el = elevationDeg * rad;
  // Site frame: x east, y up, z north.
  const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const ul = Math.hypot(eastM, MOON_RADIUS_M, northM);
  const u = [eastM / ul, MOON_RADIUS_M / ul, northM / ul];
  // Spin axis in the site frame; falls back to the site's north at the poles.
  const lat = siteLatDeg * rad;
  let p = [0, Math.sin(lat), Math.cos(lat)];
  const pu = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
  let n = [p[0] - pu * u[0], p[1] - pu * u[1], p[2] - pu * u[2]];
  if (Math.hypot(n[0], n[1], n[2]) < 1e-6) {
    p = [0, 0, 1];
    const q = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    n = [p[0] - q * u[0], p[1] - q * u[1], p[2] - q * u[2]];
  }
  const nl = Math.hypot(n[0], n[1], n[2]);
  n = n.map((v) => v / nl);
  // east = north × up in this (x east, y up, z north) left-handed layout.
  const e = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]].map((v) => -v);
  const de = d[0] * e[0] + d[1] * e[1] + d[2] * e[2];
  const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  const du = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  let a = Math.atan2(de, dn) / rad;
  if (a < 0) a += 360;
  return { azimuthDeg: a, elevationDeg: Math.asin(Math.max(-1, Math.min(1, du))) / rad };
}
