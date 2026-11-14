"use client";

import { useEffect, useState } from "react";
import { catalogToFreeplay, type CatalogSite, type FreeplaySite } from "@/data/sites";
import type { LunarSite } from "@/integrations/science/types";
import { fetchCatalogSites } from "@/lib/lunar-data";
import { CHAPTER_IDS, type ChapterId, type StoryChapter } from "@/lib/model/types";

type CatalogDetail = { site?: { coordinates?: { elevationM?: number | null } | null; terrainSummary?: { slope100mDeg?: number | null } | null }; terrain?: { slope100mDeg?: number | null } | null };

export type TutorialData = {
  status: "loading" | "ready" | "unavailable";
  chapters: Partial<Record<ChapterId, StoryChapter>>;
  catalog: CatalogSite[];
  /** Each chapter's featured catalog sites as Freeplay sites, verified coordinates first. */
  featured: Partial<Record<ChapterId, FreeplaySite[]>>;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * The surface drive's science provider addresses catalog sites by id, which the API only
 * accepts for verified points. Region references and free points are sent as coordinates.
 */
export function toDriveSite(site: FreeplaySite, catalog: CatalogSite[]): LunarSite {
  const { latitudeDeg, longitudeDeg, coordinateReference } = site;
  const entry = site.catalogId ? catalog.find((candidate) => candidate.id === site.catalogId) : undefined;
  if (entry && !entry.pointIsApproximate) return { id: entry.id, name: site.name, latitudeDeg, longitudeDeg, coordinateReference, provenance: "scientific" };
  if (entry) return { id: `approx-${entry.id}`, name: `${site.name} (approximate region point)`, latitudeDeg, longitudeDeg, coordinateReference, provenance: "illustrative" };
  return { id: site.id, name: site.name, latitudeDeg, longitudeDeg, coordinateReference, provenance: "user" };
}

/** Adds the catalog's measured elevation and slope to a verified site; other sites are returned unchanged. */
export async function withTerrainRecord(site: LunarSite): Promise<LunarSite> {
  if (site.provenance !== "scientific") return site;
  try {
    const details = await getJson<CatalogDetail>(`/api/v1/catalog/sites/${encodeURIComponent(site.id)}`);
    return {
      ...site,
      elevationMeters: details.site?.coordinates?.elevationM ?? null,
      slopeDeg: details.terrain?.slope100mDeg ?? details.site?.terrainSummary?.slope100mDeg ?? null,
    };
  } catch {
    return site;
  }
}

export function useTutorialData(): TutorialData {
  const [data, setData] = useState<TutorialData>({ status: "loading", chapters: {}, catalog: [], featured: {} });

  useEffect(() => {
    let active = true;
    Promise.all([getJson<{ items?: StoryChapter[] }>("/api/v1/chapters"), fetchCatalogSites()]).then(([chapterPage, sites]) => {
      const catalog = sites.filter((site) => Number.isFinite(site.latDeg) && Number.isFinite(site.lonDeg));
      const chapters: TutorialData["chapters"] = {};
      const featured: TutorialData["featured"] = {};
      for (const id of CHAPTER_IDS) {
        const chapter = chapterPage.items?.find((item) => item.id === id);
        if (!chapter) continue;
        chapters[id] = chapter;
        const entries = chapter.featuredSiteIds.flatMap((siteId) => catalog.filter((site) => site.id === siteId));
        featured[id] = [...entries.filter((site) => !site.pointIsApproximate), ...entries.filter((site) => site.pointIsApproximate)].map((site) => catalogToFreeplay(site));
      }
      if (active) setData({ status: "ready", chapters, catalog, featured });
    }).catch(() => { if (active) setData({ status: "unavailable", chapters: {}, catalog: [], featured: {} }); });
    return () => { active = false; };
  }, []);

  return data;
}
