/**
 * Decoders for the packed binary layouts that do not map 1:1 onto a typed array.
 * All layouts are little-endian. Pure functions; no Firebase imports.
 */
import { decodeInt32, toU8, type BytesLike } from "@/lib/bytes";
import type { PsrPolygon, TerrainGridCellStats } from "@/lib/model/types";

export const MASK_NO_DATA = -32768;
const SLOPE_NULL = -32768;
const DIST_NULL = 65535;
export const CELL_STATS_BYTES = 7;

/**
 * terrainGrid cellStats: 7 bytes per cell, unaligned:
 *   int16 slope100m (centidegrees, -32768 = null)
 *   uint16 nearestPsr (10 m units, 65535 = null)
 *   uint16 nearestColdTrap (10 m units, 65535 = null)
 *   uint8 insidePsr (0/1)
 * hasData is derived from the masks: any bin of the cell's row != -32768.
 */
export function decodeCellStats(
  cellStatsBytes: BytesLike,
  masks: Int16Array,
  bins: number,
  cells: number,
): TerrainGridCellStats[] {
  const u8 = toU8(cellStatsBytes);
  if (u8.byteLength !== cells * CELL_STATS_BYTES) {
    throw new Error(`cellStats length ${u8.byteLength} != ${cells} cells x ${CELL_STATS_BYTES} bytes`);
  }
  if (masks.length !== cells * bins) {
    throw new Error(`masks length ${masks.length} != ${cells} cells x ${bins} bins`);
  }
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const out: TerrainGridCellStats[] = new Array(cells);
  for (let c = 0; c < cells; c++) {
    const o = c * CELL_STATS_BYTES;
    const slope = view.getInt16(o, true);
    const psr = view.getUint16(o + 2, true);
    const cold = view.getUint16(o + 4, true);
    const inside = view.getUint8(o + 6);
    let hasData = false;
    const rowStart = c * bins;
    for (let b = 0; b < bins; b++) {
      if (masks[rowStart + b] !== MASK_NO_DATA) {
        hasData = true;
        break;
      }
    }
    out[c] = {
      hasData,
      slope100mDeg: slope === SLOPE_NULL ? null : slope / 100,
      nearestPsrKm: psr === DIST_NULL ? null : psr / 100,
      nearestColdTrapKm: cold === DIST_NULL ? null : cold / 100,
      insidePsr: inside === 1,
    };
  }
  return out;
}

/** Inverse of decodeCellStats (used by tests). */
export function encodeCellStats(cells: Omit<TerrainGridCellStats, "hasData">[]): Uint8Array {
  const u8 = new Uint8Array(cells.length * CELL_STATS_BYTES);
  const view = new DataView(u8.buffer);
  cells.forEach((c, i) => {
    const o = i * CELL_STATS_BYTES;
    view.setInt16(o, c.slope100mDeg === null ? SLOPE_NULL : Math.round(c.slope100mDeg * 100), true);
    view.setUint16(o + 2, c.nearestPsrKm === null ? DIST_NULL : Math.round(c.nearestPsrKm * 100), true);
    view.setUint16(o + 4, c.nearestColdTrapKm === null ? DIST_NULL : Math.round(c.nearestColdTrapKm * 100), true);
    view.setUint8(o + 6, c.insidePsr ? 1 : 0);
  });
  return u8;
}

/**
 * psrLayer polygons: int32 stream. Per polygon: nRings, then per ring: nPoints, x0, y0
 * (absolute metres), then nPoints-1 (dx, dy) deltas.
 * index: int32 triples per PSR: byteOffset into polygons, round(areaKm2*100),
 * round(coldTrapFraction*1000) or -1 for null.
 */
export function decodePsrPolygons(
  polygonsBytes: BytesLike,
  indexBytes: BytesLike,
  names: { i: number; name: string }[],
): PsrPolygon[] {
  const stream = decodeInt32(polygonsBytes);
  const index = decodeInt32(indexBytes);
  if (index.length % 3 !== 0) throw new Error(`psr index length ${index.length} is not a multiple of 3`);
  const nameByIndex = new Map(names.map((n) => [n.i, n.name]));
  const count = index.length / 3;
  const out: PsrPolygon[] = new Array(count);
  for (let p = 0; p < count; p++) {
    const byteOffset = index[p * 3];
    if (byteOffset % 4 !== 0) throw new Error(`psr ${p}: byte offset ${byteOffset} is not int32-aligned`);
    let k = byteOffset / 4;
    const read = (): number => {
      if (k >= stream.length) throw new Error(`psr ${p}: polygon stream overrun at int ${k}`);
      return stream[k++];
    };
    const nRings = read();
    const rings: [number, number][][] = [];
    for (let r = 0; r < nRings; r++) {
      const nPoints = read();
      let x = read();
      let y = read();
      const ring: [number, number][] = [[x, y]];
      for (let i = 1; i < nPoints; i++) {
        x += read();
        y += read();
        ring.push([x, y]);
      }
      rings.push(ring);
    }
    const cold = index[p * 3 + 2];
    out[p] = {
      index: p,
      areaKm2: index[p * 3 + 1] / 100,
      coldTrapFraction: cold === -1 ? null : cold / 1000,
      name: nameByIndex.get(p) ?? null,
      rings,
    };
  }
  return out;
}

/** Inverse of decodePsrPolygons (used by tests). Points must be integer metres. */
export function encodePsrPolygons(polys: Pick<PsrPolygon, "areaKm2" | "coldTrapFraction" | "rings">[]): {
  polygons: Uint8Array;
  index: Uint8Array;
} {
  const stream: number[] = [];
  const index: number[] = [];
  for (const poly of polys) {
    index.push(stream.length * 4, Math.round(poly.areaKm2 * 100), poly.coldTrapFraction === null ? -1 : Math.round(poly.coldTrapFraction * 1000));
    stream.push(poly.rings.length);
    for (const ring of poly.rings) {
      stream.push(ring.length, ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) stream.push(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
    }
  }
  return {
    polygons: new Uint8Array(Int32Array.from(stream).buffer),
    index: new Uint8Array(Int32Array.from(index).buffer),
  };
}
