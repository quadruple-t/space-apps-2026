/**
 * Freeplay site shape. Sites are either picked on the globe (custom), saved and named by the
 * user, or chosen from the Lunaris360 catalog (`/api/v1/catalog/sites`, see docs/API.md).
 * Catalog sites carry `catalogId`, which unlocks their precomputed LOLA horizon mask.
 */

import type { LunarSite } from "@/integrations/science/types"

export type SiteKind = "saved" | "custom" | "catalog"

export type FreeplaySite = LunarSite & {
  radiusKm: number
  kind: SiteKind
  /** Lunaris360 catalog site id, when the site came from (or was saved from) the catalog */
  catalogId?: string
  /** false when the catalog marks the point as approximate; the science API rejects those by id */
  catalogPointVerified?: boolean
}

export const COORD_REF = "Planetocentric latitude, east-positive longitude (MOON_ME)"

/** Entry from GET /api/v1/catalog/sites */
export type CatalogSite = {
  id: string
  name: string
  latDeg: number
  lonDeg: number
  family?: string
  country?: string
  agency?: string
  siteKind?: string
  pointIsApproximate?: boolean
  landingTimeUtc?: string | null
}

export function catalogToFreeplay(c: CatalogSite, radiusKm = 5): FreeplaySite {
  return {
    id: `catalog-${c.id}`,
    catalogId: c.id,
    catalogPointVerified: !c.pointIsApproximate,
    name: c.name,
    latitudeDeg: c.latDeg,
    longitudeDeg: Number((((c.lonDeg % 360) + 360) % 360).toFixed(6)),
    coordinateReference: COORD_REF,
    provenance: "scientific",
    radiusKm,
    kind: "catalog",
  }
}
