/**
 * Curated landing sites. Planetocentric latitude (°N), east-positive longitude
 * (0–360°), mean Earth/polar axis frame. Every value and its source is listed
 * in data/SOURCES.md; `verified: false` rows are approximate region centres.
 */

import type { LunarSite } from "@/integrations/science/types"

export type SiteKind = "preset" | "saved" | "custom"

export type FreeplaySite = LunarSite & {
  radiusKm: number
  program: string
  country: string
  verified: boolean
  source: string
  kind: SiteKind
}

const COORD_REF = "Planetocentric latitude, east-positive longitude (ME frame)"

const preset = (
  id: string, name: string, latitudeDeg: number, longitudeDeg: number, radiusKm: number,
  program: string, country: string, verified: boolean, source: string,
): FreeplaySite => ({
  id, name, latitudeDeg, longitudeDeg, radiusKm, program, country, verified, source,
  coordinateReference: COORD_REF, provenance: "scientific", kind: "preset",
})

const LROC_2016 = "LROC Coordinates of Lunar Anthropogenic Features (Wagner et al. 2016), LM position"
const LOLA_SITE = "Center of NASA/GSFC LOLA 5 m/px site DEM footprint (Moon Trek catalog)"

export const PRESET_SITES: FreeplaySite[] = [
  preset("apollo11", "Apollo 11", 0.67416, 23.47314, 5, "Apollo", "USA", true, LROC_2016),
  preset("apollo15", "Apollo 15", 26.13239, 3.6333, 5, "Apollo", "USA", true, LROC_2016),
  preset("apollo17", "Apollo 17", 20.1911, 30.7723, 5, "Apollo", "USA", true, LROC_2016),
  preset("change4", "Chang'e 4", -45.4561, 177.5885, 5, "Chang'e (CLEP)", "China", true, "LROC NAC stereo DTM, Feb 2019"),
  preset("change6", "Chang'e 6", -41.6385, 206.0148, 5, "Chang'e (CLEP)", "China", true, "LROC 'First Look: Chang'e 6', Jun 2024"),
  preset("chandrayaan3", "Chandrayaan-3", -69.3741, 32.32, 5, "Chandrayaan", "India", true, "LROC 'Chandrayaan-3 Landing Site', Aug 2023"),
  preset("slim", "SLIM", -13.316, 25.251, 5, "SLIM", "Japan", true, "LROC 'JAXA SLIM Landing', Jan 2024"),
  preset("im1", "IM-1 Odysseus", -80.13, 1.44, 5, "CLPS / Intuitive Machines", "USA", true, "NASA/LROC NAC M1463440322L, Feb 2024"),
  preset("a3-cabeus-b", "Peak near Cabeus B", -82.4, 307.0, 10, "Artemis III candidate", "USA", false, "Approximate: IAU Gazetteer centre of Cabeus B crater"),
  preset("a3-haworth", "Haworth", -86.764, 337.223, 15, "Artemis III candidate", "USA", true, LOLA_SITE),
  preset("a3-malapert", "Malapert Massif", -85.995, 359.764, 10, "Artemis III candidate", "USA", true, LOLA_SITE),
  preset("a3-mouton-plateau", "Mons Mouton Plateau", -85.427, 31.743, 8, "Artemis III candidate", "USA", true, `${LOLA_SITE} (Site20, Leibnitz Beta Plateau)`),
  preset("a3-mouton", "Mons Mouton", -84.6, 31.0, 10, "Artemis III candidate", "USA", false, "Approximate: IAU Gazetteer centre of Mons Mouton"),
  preset("a3-nobile-1", "Nobile Rim 1", -85.438, 37.367, 10, "Artemis III candidate", "USA", true, LOLA_SITE),
  preset("a3-nobile-2", "Nobile Rim 2", -83.954, 58.822, 10, "Artemis III candidate", "USA", true, LOLA_SITE),
  preset("a3-de-gerlache-2", "de Gerlache Rim 2", -88.683, 292.068, 8, "Artemis III candidate", "USA", false, "Approximate: LOLA 'de Gerlache Rim' (Site11) DEM centre; NASA's Rim 2 boundary not published"),
  preset("a3-slater", "Slater Plain", -88.1, 111.3, 10, "Artemis III candidate", "USA", false, "Approximate: IAU Gazetteer centre of Slater crater"),
]

export const DEFAULT_SITE_ID = "a3-malapert"

/** Verified rows only, as plain LunarSite values for the science provider. */
export const VERIFIED_SITES: FreeplaySite[] = PRESET_SITES.filter((s) => s.verified)
