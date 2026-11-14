import type { SiteId, SiteTerrain } from "@/lib/model/types";
import { COLLECTIONS, TERRAIN_DOC_ID, TERRAIN_SUBCOLLECTION } from "./collections";
import { siteTerrainConverter } from "./converters";
import { fetchStaticDoc } from "./fetch";

/** sites/{siteId}/terrain/v1, or null when the pipeline has no mask for the site. */
export function getSiteTerrain(siteId: SiteId): Promise<SiteTerrain | null> {
  return fetchStaticDoc(`${COLLECTIONS.sites}/${siteId}/${TERRAIN_SUBCOLLECTION}/${TERRAIN_DOC_ID}`, siteTerrainConverter);
}
