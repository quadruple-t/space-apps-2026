import type { CatalogMeta, Site, SiteId, SiteIndexEntry } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { catalogMetaConverter, siteConverter, siteIndexConverter } from "./converters";
import { fetchStaticDoc } from "./fetch";

/** catalog/siteIndex: every site in one read (Site Library). Empty if not seeded yet. */
export async function getSiteIndex(): Promise<SiteIndexEntry[]> {
  const index = await fetchStaticDoc(`${COLLECTIONS.catalog}/siteIndex`, siteIndexConverter);
  return index?.sites ?? [];
}

/** catalog/meta: dataset version and per-collection counts, or null if not seeded yet. */
export function getCatalogMeta(): Promise<CatalogMeta | null> {
  return fetchStaticDoc(`${COLLECTIONS.catalog}/meta`, catalogMetaConverter);
}

/** Full site detail, or null for an unknown id. */
export function getSite(id: SiteId): Promise<Site | null> {
  return fetchStaticDoc(`${COLLECTIONS.sites}/${id}`, siteConverter);
}

export async function getSites(ids: SiteId[]): Promise<(Site | null)[]> {
  return Promise.all(ids.map(getSite));
}
