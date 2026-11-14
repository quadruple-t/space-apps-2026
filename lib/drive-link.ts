import { COORD_REF, type FreeplaySite } from "@/data/sites"
import type { LunarSite } from "@/integrations/science/types"

/**
 * The surface drive (/freeplay/drive) opens at the site and time chosen in Freeplay.
 * Both travel in the URL so the drive survives a reload or a shared link.
 */
export function driveHref(site: FreeplaySite | null, timeMs: number): string {
  if (!site) return "/freeplay/drive"
  const q = new URLSearchParams({
    lat: String(site.latitudeDeg),
    lon: String(site.longitudeDeg),
    name: site.name,
    t: new Date(timeMs).toISOString(),
  })
  // The science API only accepts catalog ids whose point is verified.
  if (site.catalogId && site.catalogPointVerified !== false) q.set("siteId", site.catalogId)
  return `/freeplay/drive?${q}`
}

type Params = { get(name: string): string | null }

/** Site for the drive's science provider: catalog id when available, else coordinates. */
export function siteFromDriveParams(p: Params): LunarSite | null {
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"))
  if (p.get("lat") === null || p.get("lon") === null || !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 360)) return null
  const siteId = p.get("siteId")
  const name = p.get("name")?.slice(0, 120) || "Selected site"
  return siteId
    ? { id: siteId, name, latitudeDeg: lat, longitudeDeg: lon, coordinateReference: COORD_REF, provenance: "scientific" }
    : { id: `freeplay-${lat}-${lon}`, name, latitudeDeg: lat, longitudeDeg: lon, coordinateReference: COORD_REF, provenance: "user" }
}

export function timeFromDriveParams(p: Params): Date | null {
  const t = p.get("t")
  const ms = t ? Date.parse(t) : NaN
  return Number.isNaN(ms) ? null : new Date(ms)
}

/** The drive's science-provider site for a Freeplay site (same rules as driveHref). */
export function lunarSiteFor(site: FreeplaySite): LunarSite {
  return siteFromDriveParams(new URLSearchParams(driveHref(site, 0).split("?")[1]))!
}

/** The approach planner (/freeplay/approach) prefilled with the Freeplay site and time. */
export function approachHref(site: FreeplaySite | null, timeMs: number): string {
  if (!site) return "/freeplay/approach"
  const q = new URLSearchParams({ lat: String(site.latitudeDeg), lon: String(site.longitudeDeg), name: site.name, t: new Date(timeMs).toISOString() })
  if (site.catalogId) q.set("siteId", site.catalogId)
  return `/freeplay/approach?${q}`
}
