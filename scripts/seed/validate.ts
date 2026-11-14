/**
 * Seed validator. Runs over the FULL local dataset (even with --only) so cross-references
 * resolve, and reports every problem before any write. Works with partial data: checks
 * only what exists.
 */
import {
  CHAPTER_IDS,
  CHAPTER_TOOL,
  EPHEMERIS_LAYOUT,
  MISSION_PROFILE_IDS,
  OUTCOMES,
  SITE_FAMILIES,
  SITE_KINDS,
  TOOL_IDS,
  type ChapterId,
} from "../../lib/model/types";
import { COLLECTIONS, STATIC_COLLECTIONS, TERRAIN_SUBCOLLECTION } from "../../lib/firestore/collections";
import type { SeedData, SeedDoc, SeedValue } from "./load";
import { documentSize } from "./size";

export const MAX_DOC_BYTES = 500 * 1024;

const BASES = ["sourced", "derived", "assumption"] as const;
const ZONE_KINDS = ["psr-ice", "heritage-buffer"] as const;
const ZONE_RULES = [
  "nasa2011-dl-boundary",
  "nasa2011-artifact-boundary",
  "nasa2011-impact-boundary",
  "psr-buffer-by-analogy",
] as const;
const WEIGHT_KEYS = [
  "sunlight",
  "earthComms",
  "thermalMargin",
  "batterySurvival",
  "iceAccess",
  "longSunlight",
  "hazardMargin",
] as const;

type Obj = { [k: string]: SeedValue };

function isObj(v: SeedValue | undefined): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !Buffer.isBuffer(v) && !("toMillis" in v);
}

function docId(path: string): string {
  return path.split("/").pop() ?? path;
}

export function validateSeed(docs: SeedDoc[]): string[] {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const siteIds = new Set(docs.filter((d) => d.group === COLLECTIONS.sites).map((d) => docId(d.path)));

  const oneOf = (path: string, data: Obj, key: string, allowed: readonly string[], nullable = false) => {
    const v = data[key];
    if (nullable && (v === null || v === undefined)) return;
    if (typeof v !== "string" || !allowed.includes(v)) {
      err(path, `${key} = ${JSON.stringify(v ?? null)} is not one of ${allowed.join("|")}${nullable ? "|null" : ""}`);
    }
  };
  const bytesLen = (path: string, data: SeedData, key: string, expected: number, nullable = false) => {
    const v = data[key];
    if (nullable && (v === null || v === undefined)) return;
    if (!Buffer.isBuffer(v)) return err(path, `${key} should be {"$bytes": ...}`);
    if (v.length !== expected) err(path, `${key} is ${v.length} bytes, expected ${expected}`);
  };
  const num = (data: SeedData, key: string): number | null => (typeof data[key] === "number" ? (data[key] as number) : null);
  const siteRef = (path: string, key: string, v: SeedValue | undefined, nullable: boolean) => {
    if (nullable && (v === null || v === undefined)) return;
    if (typeof v !== "string" || !siteIds.has(v)) err(path, `${key} ${JSON.stringify(v ?? null)} is not a site in data/seed/sites`);
  };

  for (const d of docs) {
    const { path, data } = d;
    if (d.collection === COLLECTIONS.users) {
      err(path, "documents under users/ must never be seeded");
      continue;
    }
    if (!(STATIC_COLLECTIONS as readonly string[]).includes(d.collection)) {
      err(path, `collection "${d.collection}" is not a static collection in firestore.rules (clients could not read it)`);
    }
    if (d.group.includes("/") && d.group !== `${COLLECTIONS.sites}/*/${TERRAIN_SUBCOLLECTION}`) {
      err(path, `sub-collection group "${d.group}" is not allowed by firestore.rules`);
    }
    const size = documentSize(path, data);
    if (size > MAX_DOC_BYTES) err(path, `estimated size ${(size / 1024).toFixed(1)} KB exceeds ${MAX_DOC_BYTES / 1024} KB`);

    switch (d.group) {
      case COLLECTIONS.sites: {
        oneOf(path, data, "family", SITE_FAMILIES);
        oneOf(path, data, "siteKind", SITE_KINDS);
        oneOf(path, data, "outcome", OUTCOMES);
        oneOf(path, data, "chapterId", CHAPTER_IDS, true);
        if (typeof data.name !== "string") err(path, "name must be a string");
        break;
      }
      case `${COLLECTIONS.sites}/*/${TERRAIN_SUBCOLLECTION}`: {
        const bins = num(data, "bins");
        if (bins === null) err(path, "bins must be a number");
        else {
          bytesLen(path, data, "mask", bins * 4);
          for (const k of ["maskP05", "maskP95", "maskSigma", "distAtMaxKm"]) bytesLen(path, data, k, bins * 4, true);
        }
        siteRef(path, "parent site", path.split("/")[1], false);
        break;
      }
      case COLLECTIONS.catalog: {
        if (docId(path) === "siteIndex") {
          const sites = data.sites;
          if (!Array.isArray(sites)) err(path, "sites must be an array");
          else
            sites.forEach((e, i) => {
              if (!isObj(e)) return err(path, `sites[${i}] must be an object`);
              const p = `${path}.sites[${i}]`;
              siteRef(p, "id", e.id, false);
              oneOf(p, e, "family", SITE_FAMILIES);
              oneOf(p, e, "siteKind", SITE_KINDS);
              oneOf(p, e, "outcome", OUTCOMES);
              oneOf(p, e, "chapterId", CHAPTER_IDS, true);
              if (typeof e.coordsVerified !== "boolean") err(p, "coordsVerified must be a boolean");
              else if (e.coordsVerified && (typeof e.latDeg !== "number" || typeof e.lonDeg !== "number" || e.pointIsApproximate === true)) err(p, "coordsVerified requires a non-approximate point coordinate");
            });
        }
        break;
      }
      case COLLECTIONS.storyChapters: {
        const id = docId(path);
        const index = CHAPTER_IDS.indexOf(id as ChapterId);
        if (index < 0) {
          err(path, `doc id is not one of ${CHAPTER_IDS.join("|")}`);
          break;
        }
        if (data.order !== index + 1) err(path, `order = ${JSON.stringify(data.order ?? null)}, expected ${index + 1}`);
        oneOf(path, data, "unlocksTool", TOOL_IDS);
        const tool = CHAPTER_TOOL[id as ChapterId];
        if (data.unlocksTool !== tool) err(path, `unlocksTool = ${JSON.stringify(data.unlocksTool ?? null)}, expected ${tool}`);
        if (!Array.isArray(data.featuredSiteIds)) err(path, "featuredSiteIds must be an array");
        else data.featuredSiteIds.forEach((s, i) => siteRef(path, `featuredSiteIds[${i}]`, s, false));
        break;
      }
      case COLLECTIONS.missionProfiles: {
        if (!(MISSION_PROFILE_IDS as readonly string[]).includes(docId(path))) {
          err(path, `doc id is not one of ${MISSION_PROFILE_IDS.join("|")}`);
        }
        const w = data.weights;
        if (!isObj(w)) {
          err(path, "weights must be a map");
          break;
        }
        let sum = 0;
        for (const k of WEIGHT_KEYS) {
          const v = w[k];
          if (typeof v !== "number" || v < 0 || v > 1) err(path, `weights.${k} = ${JSON.stringify(v ?? null)} must be 0..1`);
          else sum += v;
        }
        const extra = Object.keys(w).filter((k) => !(WEIGHT_KEYS as readonly string[]).includes(k));
        if (extra.length) err(path, `unknown weights: ${extra.join(", ")}`);
        if (Math.abs(sum - 1) > 0.001) err(path, `weights sum to ${sum.toFixed(4)}, expected 1 (±0.001)`);
        break;
      }
      case COLLECTIONS.protectionZones: {
        oneOf(path, data, "kind", ZONE_KINDS);
        oneOf(path, data, "ruleId", ZONE_RULES);
        siteRef(path, "siteId", data.siteId, true);
        const g = data.geometry;
        if (!isObj(g)) err(path, "geometry must be a map");
        else if (g.type === "Circle") {
          if (!isObj(g.center) || typeof g.radiusKm !== "number") err(path, "Circle geometry needs center{latDeg,lonDeg} and radiusKm");
        } else if (g.type === "Polygon") {
          const rings = g.rings;
          const ok =
            Array.isArray(rings) &&
            rings.length > 0 &&
            rings.every((r) => isObj(r) && Array.isArray(r.points) && r.points.length >= 3 && r.points.every((p) => isObj(p) && typeof p.latDeg === "number" && typeof p.lonDeg === "number"));
          if (!ok) err(path, "Polygon geometry needs rings[{points[{latDeg,lonDeg}] (>= 3 points)}]");
        } else err(path, `geometry.type ${JSON.stringify(g.type ?? null)} must be Circle or Polygon`);
        break;
      }
      case COLLECTIONS.landerPresets: {
        const fields = data.fields;
        if (!isObj(fields)) {
          err(path, "fields must be a map");
          break;
        }
        for (const [k, f] of Object.entries(fields)) {
          if (!isObj(f)) {
            err(path, `fields.${k} must be a map`);
            continue;
          }
          if (f.value !== null && typeof f.value !== "number") err(path, `fields.${k}.value must be a number or null`);
          oneOf(path, f, "basis", BASES);
          if (f.value !== null && f.value !== undefined && f.basis === undefined) err(path, `fields.${k} has a value but no basis`);
        }
        break;
      }
      case COLLECTIONS.validationChecks: {
        siteRef(path, "siteId", data.siteId, false);
        break;
      }
      case COLLECTIONS.ephemerisGlobal: {
        const layout = data.layout;
        if (!Array.isArray(layout) || layout.join(",") !== EPHEMERIS_LAYOUT.join(",")) {
          err(path, `layout must be ${JSON.stringify(EPHEMERIS_LAYOUT)}`);
        }
        const count = num(data, "count");
        if (count === null) err(path, "count must be a number");
        else bytesLen(path, data, "data", count * EPHEMERIS_LAYOUT.length * 4);
        if (data.timeScale !== "UTC") err(path, 'timeScale must be "UTC"');
        if (data.source !== "JPL Horizons API") err(path, 'source must be "JPL Horizons API"');
        if (typeof data.siteId === "string") siteRef(path, "siteId", data.siteId, false);
        break;
      }
      case COLLECTIONS.terrainGrid: {
        const side = num(data, "cellsPerSide");
        const bins = num(data, "bins");
        if (side === null || bins === null) {
          err(path, "cellsPerSide and bins must be numbers");
          break;
        }
        const cells = side * side;
        bytesLen(path, data, "masks", cells * bins * 2);
        bytesLen(path, data, "maskErr", cells * bins);
        bytesLen(path, data, "cellStats", cells * 7);
        break;
      }
      case COLLECTIONS.psrLayer: {
        const count = num(data, "count");
        if (count === null) err(path, "count must be a number");
        else bytesLen(path, data, "index", count * 12);
        if (!Buffer.isBuffer(data.polygons)) err(path, 'polygons should be {"$bytes": ...}');
        break;
      }
      case COLLECTIONS.demo: {
        const count = num(data, "count");
        if (count === null) err(path, "count must be a number");
        else bytesLen(path, data, "series", count * 16);
        const binDeg = num(data, "maskBinDeg");
        if (binDeg === null) err(path, "maskBinDeg must be a number");
        else bytesLen(path, data, "mask", Math.round(360 / binDeg) * 4);
        siteRef(path, "siteId", data.siteId, false);
        break;
      }
    }
  }
  return errors;
}
