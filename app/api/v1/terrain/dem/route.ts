import { errorJson } from "@/lib/api/http";
import { DEM_SOURCE, decodeFloat32Tiff, demRequestUrl, encodeHeights, heightsFromRaster, makeGrid, parseDemQuery, type DemQuery } from "@/lib/terrain/dem";

/**
 * GET /api/v1/terrain/dem — a site-centred elevation grid for the surface drive.
 *
 * The one documented exception to "interactive requests read only stored data" (docs/API.md):
 * arbitrary points and radii cannot be pre-archived, so the grid is fetched from LROC Lunaserv
 * on first request and then served from this process's cache and the HTTP cache.
 */

type Payload = Record<string, unknown>;
const CACHE_LIMIT = 48;
const cache = new Map<string, Payload>();
const inflight = new Map<string, Promise<Payload>>();
const UPSTREAM_TIMEOUT_MS = 25_000;
/** Upstream fetches in flight per process; more get a 503 so a sweep cannot pile up on Lunaserv. */
const MAX_CONCURRENT_UPSTREAM = 4;

class UpstreamError extends Error {}

async function fetchGrid(q: DemQuery): Promise<Payload> {
  let response: Response;
  try {
    response = await fetch(demRequestUrl(q), { cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (error) {
    throw new UpstreamError(error instanceof Error && error.name === "TimeoutError" ? "Elevation service timed out" : "Elevation service unreachable");
  }
  if (!response.ok) throw new UpstreamError(`Elevation service returned ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").startsWith("image/tiff")) throw new UpstreamError("Elevation service returned an error instead of a height grid");
  const raster = decodeFloat32Tiff(new Uint8Array(await response.arrayBuffer()));
  if (raster.width !== q.size || raster.height !== q.size) throw new UpstreamError("Elevation grid has unexpected dimensions");
  const grid = makeGrid(heightsFromRaster(raster.data, q.size), q.size, q.radiusKm);
  const centre = Math.floor(q.size / 2);
  return {
    center: { latDeg: q.latDeg, lonDeg: q.lonDeg },
    radiusKm: q.radiusKm,
    size: grid.size,
    halfExtentM: grid.halfExtentM,
    spacingM: grid.spacingM,
    minM: Math.round(grid.minM),
    maxM: Math.round(grid.maxM),
    centerM: Math.round(grid.heightsM[centre * q.size + centre]),
    heights: {
      encoding: "int16le-base64",
      unit: "m",
      rowOrder: "north-to-south, west-to-east",
      data: Buffer.from(encodeHeights(grid.heightsM)).toString("base64"),
    },
    source: { ...DEM_SOURCE, retrievedAt: new Date().toISOString() },
    notes: [
      `Source posting is about ${DEM_SOURCE.nominalResolutionM} m; grid spacing is ${grid.spacingM.toFixed(1)} m, so finer spacing is interpolation, not extra detail.`,
      "GLD100 is WAC stereo topography between 79°S and 79°N; poleward values are the layer's LOLA-based fill.",
      "Display, local line-of-sight, and browser-computed horizons where no stored LOLA horizon covers a point. Server science routes keep using the stored LOLA horizon masks.",
    ],
  };
}

export async function GET(request: Request) {
  const query = parseDemQuery(new URL(request.url).searchParams);
  if ("error" in query) return errorJson(query.error, 400);
  const key = `${query.latDeg}|${query.lonDeg}|${query.radiusKm}|${query.size}`;
  try {
    let payload = cache.get(key);
    if (payload) {
      cache.delete(key);
      cache.set(key, payload);
    } else {
      let pending = inflight.get(key);
      if (!pending) {
        if (inflight.size >= MAX_CONCURRENT_UPSTREAM) {
          return Response.json({ error: { message: "Elevation service is busy; try again shortly" } }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });
        }
        pending = fetchGrid(query).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      payload = await pending;
      cache.set(key, payload);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    }
    return Response.json(payload, { headers: {
      // Terrain does not change; let browsers and the CDN keep it.
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Elevation data unavailable";
    if (!(error instanceof UpstreamError)) console.error("DEM grid could not be built", message);
    return errorJson(error instanceof UpstreamError ? message : "Elevation data unavailable", 503);
  }
}
