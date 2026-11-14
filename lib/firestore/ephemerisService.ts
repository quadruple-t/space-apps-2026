import type { EphemerisChunk } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { ephemerisChunkConverter } from "./converters";
import { fetchRequiredStaticDoc } from "./fetch";

const CHUNK_ID = /^(\d{4}-(0[1-9]|1[0-2])|hist-[a-z0-9-]+)$/;

/** Month chunk id ("YYYY-MM") for a UTC instant. */
export function monthChunkId(time: Date | string): string {
  const d = typeof time === "string" ? new Date(time) : time;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Historic window chunk id for a site. */
export function historicChunkId(siteId: string): string {
  return `hist-${siteId}`;
}

/**
 * ephemerisGlobal/{id} for ids "YYYY-MM" or "hist-<siteId>". Fetched once per page load.
 * Rejects with DocumentNotFoundError if the chunk does not exist.
 */
export function getEphemerisChunk(id: string): Promise<EphemerisChunk> {
  if (!CHUNK_ID.test(id)) return Promise.reject(new Error(`Invalid ephemeris chunk id "${id}"`));
  return fetchRequiredStaticDoc(`${COLLECTIONS.ephemerisGlobal}/${id}`, ephemerisChunkConverter);
}
