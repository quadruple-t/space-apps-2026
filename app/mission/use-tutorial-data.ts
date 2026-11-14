"use client";

import { useEffect, useState } from "react";
import type { LunarSite } from "@/integrations/science/types";
import { CHAPTER_IDS, type ChapterId, type StoryChapter } from "@/lib/model/types";

type CatalogSite = { id: string; name: string; latDeg: number | null; lonDeg: number | null; pointIsApproximate: boolean };
type CatalogDetail = { site?: { coordinates?: { elevationM?: number | null } | null; terrainSummary?: { slope100mDeg?: number | null } | null }; terrain?: { slope100mDeg?: number | null } | null };

export type TutorialData = {
  status: "loading" | "ready" | "unavailable";
  chapters: Partial<Record<ChapterId, StoryChapter>>;
  /** Each chapter's featured catalog sites, verified coordinates first. */
  sites: Partial<Record<ChapterId, LunarSite[]>>;
};

const COORDINATE_REFERENCE = "Planetocentric latitude, east-positive longitude";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

/** Sites with verified coordinates use their catalog record; region references are sent as plain coordinates. */
function toLunarSite(site: CatalogSite): LunarSite | null {
  if (site.latDeg === null || site.lonDeg === null) return null;
  return site.pointIsApproximate
    ? { id: `approx-${site.id}`, name: `${site.name} (approximate region point)`, latitudeDeg: site.latDeg, longitudeDeg: site.lonDeg, coordinateReference: COORDINATE_REFERENCE, provenance: "illustrative" }
    : { id: site.id, name: site.name, latitudeDeg: site.latDeg, longitudeDeg: site.lonDeg, coordinateReference: COORDINATE_REFERENCE, provenance: "scientific" };
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
  const [data, setData] = useState<TutorialData>({ status: "loading", chapters: {}, sites: {} });

  useEffect(() => {
    let active = true;
    Promise.all([
      getJson<{ items?: StoryChapter[] }>("/api/v1/chapters"),
      getJson<{ sites?: CatalogSite[] }>("/api/v1/catalog/sites"),
    ]).then(async ([chapterPage, catalog]) => {
      const catalogById = new Map((catalog.sites ?? []).map((site) => [site.id, site]));
      const chapters: TutorialData["chapters"] = {};
      const sites: TutorialData["sites"] = {};
      for (const id of CHAPTER_IDS) {
        const chapter = chapterPage.items?.find((item) => item.id === id);
        if (!chapter) continue;
        chapters[id] = chapter;
        const featured = chapter.featuredSiteIds.flatMap((siteId) => {
          const site = catalogById.get(siteId);
          return site ? [toLunarSite(site)].filter((value): value is LunarSite => value !== null) : [];
        });
        sites[id] = [...featured.filter((site) => site.provenance === "scientific"), ...featured.filter((site) => site.provenance !== "scientific")];
      }
      const first = sites[CHAPTER_IDS[0]]?.[0];
      if (first) sites[CHAPTER_IDS[0]] = [await withTerrainRecord(first), ...sites[CHAPTER_IDS[0]]!.slice(1)];
      if (active) setData({ status: "ready", chapters, sites });
    }).catch(() => { if (active) setData({ status: "unavailable", chapters: {}, sites: {} }); });
    return () => { active = false; };
  }, []);

  return data;
}
