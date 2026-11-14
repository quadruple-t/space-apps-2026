import { readFileSync } from "node:fs";
import { join } from "node:path";
import { base64ToU8 } from "@/lib/bytes";
import { decodeEphemerisData } from "@/lib/ephemeris";
import { EPHEMERIS_LAYOUT, type EphemerisChunk } from "@/lib/model/types";

export const SEED_DIR = join(process.cwd(), "data", "seed");

export function readSeed<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readFileSync(join(SEED_DIR, rel), "utf8")) as T;
}

interface ChunkJson {
  startUtc: string; stepMinutes: number; count: number; data: { $bytes: string };
  sunAngularDiameterDegMean: number | null; frame: string; horizonsQuery: string;
  ephemerisVersion: string | null; retrievedAt: string;
}

/** Load a seeded ephemeris chunk exactly as the client converter would decode it. */
export function loadChunk(id: string): EphemerisChunk {
  const j = readSeed<ChunkJson>(`ephemerisGlobal/${id}.json`);
  return {
    id, startUtc: j.startUtc, stepMinutes: j.stepMinutes, count: j.count, layout: EPHEMERIS_LAYOUT,
    data: decodeEphemerisData(base64ToU8(j.data.$bytes), j.count),
    sunAngularDiameterDegMean: j.sunAngularDiameterDegMean, frame: j.frame, timeScale: "UTC",
    source: "JPL Horizons API", horizonsQuery: j.horizonsQuery, ephemerisVersion: j.ephemerisVersion, retrievedAt: j.retrievedAt,
  };
}
