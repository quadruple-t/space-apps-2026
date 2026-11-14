/**
 * Verified lunar landing sites in the LunarSite coordinate frame:
 * planetocentric latitude (°N), east-positive longitude (0–360°).
 *
 * Sources:
 *   Apollo 11  — ALSJ hq.nasa.gov/alsj/a11/a11.landing.html
 *   SLIM       — JAXA post-landing announcement 2024-01-19
 *   Chang'e 4  — CLEP MoonGIS SPICE kernel; CNSA 2019-01-03
 *   Shackleton — LROC NAC mosaic; rim peak at ~89.9°S
 *   de Gerlache — NASA Artemis III evaluation 2022
 *   Nobile     — LRO/Mini-RF volatiles study
 *   Malapert   — Heiken 2012; LROC NAC topographic profile
 */

import type { LunarSite } from "@/integrations/science/types"

export const VERIFIED_SITES: LunarSite[] = [
  {
    id: "apollo11",
    name: "Apollo 11 — Tranquility Base",
    latitudeDeg: 0.6741,
    longitudeDeg: 23.4732,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
  {
    id: "slim",
    name: "SLIM — Shioli Crater",
    latitudeDeg: -13.316,
    longitudeDeg: 25.258,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
  {
    id: "change4",
    name: "Chang'e 4 — Von Kármán Crater",
    latitudeDeg: -45.4446,
    longitudeDeg: 177.5991,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
  {
    id: "shackleton",
    name: "Shackleton Crater Rim",
    latitudeDeg: -89.9,
    longitudeDeg: 0.0,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
  {
    id: "degerlache",
    name: "de Gerlache Crater",
    latitudeDeg: -88.5,
    longitudeDeg: 273.0,  // 273° E = 87° W
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
  {
    id: "nobile",
    name: "Nobile Crater",
    latitudeDeg: -85.1,
    longitudeDeg: 53.5,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
  {
    id: "malapert",
    name: "Malapert Massif",
    latitudeDeg: -86.0,
    longitudeDeg: 2.9,
    coordinateReference: "Planetocentric latitude, east-positive longitude",
    provenance: "scientific",
  },
]
