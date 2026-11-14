/**
 * Global sub-point series → Cartesian, linear interpolation (never interpolate raw longitudes:
 * the sub-Earth longitude wraps through 0/360). Measured interpolation error at a 1 h step is
 * about 0.0001° (docs/research/ephemeris.md §2.3).
 */
import type { EphemerisChunk } from "@/lib/model/types";
import { EPHEMERIS_STRIDE } from "./decode";
import { subPointToCartesian, type Vec3 } from "./topocentric";

const HOUR_MS = 3_600_000;

/** Month chunk ids ("YYYY-MM") covering [startIso, endIso] inclusive. Main series: 2026-01 … 2030-12. */
export function monthChunkIds(startIso: string, endIso: string): string[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new Error("invalid window");
  if (e < s) throw new Error("window end before start");
  const ids: string[] = [];
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  // The last hourly sample of a month is HH=23; interpolating past it needs the next chunk.
  const last = new Date(e.getTime() + HOUR_MS);
  while (y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth())) {
    ids.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return ids;
}

export const MAIN_SERIES_START = "2026-01-01T00:00:00Z";
export const MAIN_SERIES_END = "2030-12-31T23:00:00Z";

/** A contiguous hourly series of Moon-centred Sun and Earth positions (km). */
export class CartesianSeries {
  readonly startMs: number;
  readonly stepMs: number;
  readonly count: number;
  private readonly sun: Float64Array;
  private readonly earth: Float64Array;
  private readonly sunDist: Float64Array;

  constructor(chunks: EphemerisChunk[]) {
    if (chunks.length === 0) throw new Error("no ephemeris chunks");
    const sorted = [...chunks].sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
    const step = sorted[0].stepMinutes * 60_000;
    let expected = Date.parse(sorted[0].startUtc);
    let total = 0;
    for (const c of sorted) {
      if (c.stepMinutes * 60_000 !== step) throw new Error("mixed ephemeris step sizes");
      if (Date.parse(c.startUtc) !== expected) throw new Error(`ephemeris chunks not contiguous at ${c.id}`);
      expected += c.count * step;
      total += c.count;
    }
    this.startMs = Date.parse(sorted[0].startUtc);
    this.stepMs = step;
    this.count = total;
    this.sun = new Float64Array(total * 3);
    this.earth = new Float64Array(total * 3);
    this.sunDist = new Float64Array(total);
    let k = 0;
    for (const c of sorted) {
      for (let i = 0; i < c.count; i++, k++) {
        const o = i * EPHEMERIS_STRIDE;
        const s = subPointToCartesian(c.data[o], c.data[o + 1], c.data[o + 2]);
        const e = subPointToCartesian(c.data[o + 3], c.data[o + 4], c.data[o + 5]);
        this.sun.set(s, k * 3);
        this.earth.set(e, k * 3);
        this.sunDist[k] = c.data[o + 2];
      }
    }
  }

  get endMs(): number {
    return this.startMs + (this.count - 1) * this.stepMs;
  }

  covers(tMs: number): boolean {
    return tMs >= this.startMs && tMs <= this.endMs;
  }

  /** Linearly interpolated Moon-centred positions (km) at time t. */
  at(tMs: number): { sun: Vec3; earth: Vec3 } {
    if (!this.covers(tMs)) {
      throw new RangeError(`time ${new Date(tMs).toISOString()} outside ephemeris ${new Date(this.startMs).toISOString()}…${new Date(this.endMs).toISOString()}`);
    }
    const h = (tMs - this.startMs) / this.stepMs;
    let i0 = Math.floor(h);
    if (i0 >= this.count - 1) i0 = this.count - 2;
    const f = h - i0;
    return { sun: this.lerp(this.sun, i0, f), earth: this.lerp(this.earth, i0, f) };
  }

  private lerp(a: Float64Array, i0: number, f: number): Vec3 {
    const o = i0 * 3;
    return [
      a[o] + (a[o + 3] - a[o]) * f,
      a[o + 1] + (a[o + 4] - a[o + 1]) * f,
      a[o + 2] + (a[o + 5] - a[o + 2]) * f,
    ];
  }
}

/** Fetch the chunks covering a window with a caller-supplied fetcher (e.g. ephemerisService.getEphemerisChunk). */
export async function loadSeries(
  fetchChunk: (id: string) => Promise<EphemerisChunk>,
  startIso: string,
  endIso: string,
): Promise<CartesianSeries> {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (s < Date.parse(MAIN_SERIES_START) || e > Date.parse(MAIN_SERIES_END)) {
    throw new RangeError(`window outside the stored main series (${MAIN_SERIES_START} … ${MAIN_SERIES_END}); historic windows use "hist-<siteId>" chunks`);
  }
  const ids = monthChunkIds(startIso, endIso).filter((id) => id <= "2030-12");
  const chunks = await Promise.all(ids.map(fetchChunk));
  return new CartesianSeries(chunks);
}
