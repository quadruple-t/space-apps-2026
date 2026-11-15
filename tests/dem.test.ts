import { describe, expect, it } from "vitest"
import * as THREE from "three"
import {
  curvatureDropM, decodeFloat32Tiff, decodeHeights, demRequestUrl, discVisibleFraction, encodeHeights, heightAtLocal,
  heightsFromRaster, horizonElevationDeg, makeGrid, parseDemQuery, skyAtLocal, slopeAtLocal, smoothToSourceResolution, tangentPlaneHeight,
} from "@/lib/terrain/dem"
import { buildDemSurface, computeSunVisibility, groundY } from "@/scenes/lunar/dem-terrain"
import { radiusFromDriveParams } from "@/lib/drive-link"
import { loadPlacements, placementSiteKey, savePlacements } from "@/lib/drive-placements"

/** Minimal little-endian float32 TIFF in `strips` strips, the layout Lunaserv returns. */
function tiff(width: number, height: number, values: number[], strips = 2): Uint8Array {
  const rowsPerStrip = Math.ceil(height / strips)
  const tagCount = 9
  const ifd = 8
  const offsetsAt = ifd + 2 + tagCount * 12 + 4
  const countsAt = offsetsAt + strips * 4
  const dataAt = countsAt + strips * 4
  const buf = new ArrayBuffer(dataAt + values.length * 4)
  const v = new DataView(buf)
  v.setUint8(0, 0x49); v.setUint8(1, 0x49); v.setUint16(2, 42, true); v.setUint32(4, ifd, true)
  v.setUint16(ifd, tagCount, true)
  const tags: Array<[number, number, number, number]> = [
    [256, 3, 1, width], [257, 3, 1, height], [258, 3, 1, 32], [259, 3, 1, 1], [273, 4, strips, offsetsAt],
    [277, 3, 1, 1], [278, 3, 1, rowsPerStrip], [279, 4, strips, countsAt], [339, 3, 1, 3],
  ]
  tags.forEach(([tag, type, count, value], i) => {
    const at = ifd + 2 + i * 12
    v.setUint16(at, tag, true); v.setUint16(at + 2, type, true); v.setUint32(at + 4, count, true)
    if (type === 3 && count === 1) v.setUint16(at + 8, value, true)
    else v.setUint32(at + 8, value, true)
  })
  for (let s = 0; s < strips; s++) {
    const rows = Math.min(rowsPerStrip, height - s * rowsPerStrip)
    v.setUint32(offsetsAt + s * 4, dataAt + s * rowsPerStrip * width * 4, true)
    v.setUint32(countsAt + s * 4, rows * width * 4, true)
  }
  values.forEach((x, i) => v.setFloat32(dataAt + i * 4, x, true))
  return new Uint8Array(buf)
}

const params = (o: Record<string, string>) => new URLSearchParams(o)

describe("DEM query and upstream request", () => {
  it("normalises coordinates and rejects bad input", () => {
    expect(parseDemQuery(params({ lat: "-89.45", lon: "315", radiusKm: "12.345", size: "129" }))).toEqual({ latDeg: -89.45, lonDeg: -45, radiusKm: 25, size: 129 })
    expect(parseDemQuery(params({ lat: "0", lon: "0" }))).toMatchObject({ radiusKm: 5, size: 257 })
    expect(parseDemQuery(params({ lon: "0" }))).toHaveProperty("error")
    expect(parseDemQuery(params({ lat: "91", lon: "0" }))).toHaveProperty("error")
    expect(parseDemQuery(params({ lat: "0", lon: "0", radiusKm: "501" }))).toHaveProperty("error")
    expect(parseDemQuery(params({ lat: "0", lon: "0", size: "128" }))).toHaveProperty("error")
  })

  it("asks Lunaserv for a site-centred orthographic float grid", () => {
    const url = new URL(demRequestUrl({ latDeg: 0.6742, lonDeg: 23.4731, radiusKm: 5, size: 129 }))
    expect(url.origin).toBe("https://wms.im-ldi.com")
    expect(url.searchParams.get("LAYERS")).toBe("luna_wac_dtm_numeric")
    expect(url.searchParams.get("SRS")).toBe("IAU2000:30166,9001,23.4731,0.6742")
    expect(url.searchParams.get("BBOX")).toBe("-5000,-5000,5000,5000")
    expect(url.searchParams.get("FORMAT")).toBe("image/tiff")
  })
})

describe("TIFF decoding and height cleanup", () => {
  it("reads multi-strip float32 rasters", () => {
    const values = Array.from({ length: 12 }, (_, i) => -1.9 + i * 0.001)
    const out = decodeFloat32Tiff(tiff(4, 3, values, 2))
    expect(out.width).toBe(4)
    expect(out.height).toBe(3)
    expect(Array.from(out.data)).toEqual(values.map((x) => Math.fround(x)))
  })

  it("rejects things that are not float TIFFs", () => {
    expect(() => decodeFloat32Tiff(new TextEncoder().encode("<ServiceExceptionReport/>"))).toThrow()
  })

  it("converts km to m and fills isolated no-data from neighbours", () => {
    const raster = new Float32Array([1, 1, 1, 1, NaN, 1, 1, 1, -3.4e38])
    const m = heightsFromRaster(raster, 3)
    expect(m[0]).toBe(1000)
    expect(m[4]).toBeCloseTo(1000)
    expect(m[8]).toBeCloseTo(1000)
    expect(() => heightsFromRaster(new Float32Array([NaN, NaN, NaN, 1]), 2)).toThrow()
  })

  it("round-trips heights through the int16 payload", () => {
    const h = new Float32Array([-9100.4, 0, 10786.6])
    expect(Array.from(decodeHeights(encodeHeights(h), 3))).toEqual([-9100, 0, 10787])
  })
})

/** Grid (north row first) whose heights follow f(east, north). */
function gridFrom(size: number, radiusKm: number, f: (e: number, n: number) => number) {
  const half = radiusKm * 1000, spacing = (2 * half) / (size - 1)
  const h = new Float32Array(size * size)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) h[j * size + i] = f(-half + i * spacing, half - j * spacing)
  return makeGrid(h, size, radiusKm)
}

describe("display smoothing", () => {
  it("turns whole-metre terraces into a ramp on a fine grid and leaves coarse grids alone", () => {
    const size = 65
    // A 0.5° slope quantised to whole metres: flat steps with abrupt edges.
    const terraced = Float32Array.from({ length: size * size }, (_, k) => Math.round(((k % size) * 20 * Math.tan((0.5 * Math.PI) / 180))))
    const stepAt = (h: Float32Array) => Math.max(...Array.from({ length: size - 3 }, (_, i) => Math.abs(h[30 * size + i + 2] - h[30 * size + i + 1])))
    const before = stepAt(terraced)
    expect(smoothToSourceResolution(terraced, size, 20)).toBeGreaterThan(0)
    expect(stepAt(terraced)).toBeLessThan(before)
    const coarse = new Float32Array(size * size).map((_, k) => k % 7)
    const copy = Float32Array.from(coarse)
    expect(smoothToSourceResolution(coarse, size, 100)).toBe(0)
    expect(Array.from(coarse)).toEqual(Array.from(copy))
  })
})

describe("grid sampling", () => {
  it("interpolates heights and measures slope on a tilted plane", () => {
    const grid = gridFrom(33, 1, (e) => e * Math.tan((10 * Math.PI) / 180))
    expect(heightAtLocal(grid, 100, 0)).toBeCloseTo(100 * Math.tan((10 * Math.PI) / 180), 3)
    expect(slopeAtLocal(grid, 0, 0)).toBeCloseTo(10, 3)
    expect(grid.spacingM).toBeCloseTo(62.5)
  })

  it("puts curvature on the scene and keeps the site centre at its height", () => {
    expect(curvatureDropM(10_000)).toBeCloseTo(28.78, 1)
    expect(tangentPlaneHeight(0, 0, -1929)).toBeCloseTo(-1929, 6)
    expect(tangentPlaneHeight(10_000, 0, 0)).toBeCloseTo(-28.78, 1)
    expect(tangentPlaneHeight(0, 0, 100, 3)).toBeCloseTo(300, 6)
  })

  it("matches the rendered mesh exactly at vertices", () => {
    const grid = gridFrom(9, 1, (e, n) => (e * n) / 1000)
    const s = buildDemSurface(grid)
    // scene z = -north; vertex (i=2, j=3) is east -500, north 250
    expect(groundY(s, -500, -250)).toBeCloseTo(s.worldY[3 * 9 + 2], 6)
  })
})

describe("terrain line of sight", () => {
  // Flat ground with a 500 m north–south wall 2 km east of the site.
  const grid = gridFrom(129, 5, (e) => (e > 1900 && e < 2100 ? 500 : 0))

  it("finds the wall in the east and an open horizon in the west", () => {
    // The wall face is blurred over one 78 m cell by interpolation, so allow about a degree.
    const ideal = (Math.atan2(498, 1900) * 180) / Math.PI
    expect(Math.abs(horizonElevationDeg(grid, 0, 0, 90, 2) - ideal)).toBeLessThan(1)
    expect(horizonElevationDeg(grid, 0, 0, 270, 2)).toBeLessThan(0)
  })

  it("scores partial solar discs", () => {
    expect(discVisibleFraction(10, 5)).toBe(1)
    expect(discVisibleFraction(5, 5)).toBeCloseTo(0.5)
    expect(discVisibleFraction(4, 5)).toBe(0)
  })

  it("shades ground behind the wall and leaves open ground lit", () => {
    const s = buildDemSurface(grid)
    const out = new Float32Array(s.size * s.size)
    // Sun low in the east (azimuth 90°, elevation 5°): +X in scene space.
    const sun = new THREE.Vector3(Math.cos((5 * Math.PI) / 180), Math.sin((5 * Math.PI) / 180), 0)
    computeSunVisibility(s, sun, out, 1)
    const at = (east: number) => out[64 * s.size + Math.round((east + 5000) / s.spacing)]
    expect(at(0)).toBe(0)
    expect(at(-2000)).toBe(0) // wall subtends ~7° from 4 km
    expect(at(-5000)).toBe(1) // ~4.8° from 6.9 km, below the 5° Sun
    expect(at(3000)).toBe(1)
    // Sun below the horizon everywhere.
    computeSunVisibility(s, new THREE.Vector3(1, -0.2, 0).normalize(), out, 1)
    expect(Math.max(...out)).toBe(0)
  })
})

describe("local sky across the tile", () => {
  it("is unchanged at the centre and tilts with curvature away from it", () => {
    expect(skyAtLocal(10, 0, 0, 123, 15)).toMatchObject({ azimuthDeg: expect.closeTo(123, 6), elevationDeg: expect.closeTo(15, 6) })
    // 100 km toward the Sun raises it by the arc angle (100 / 1737.4 rad ≈ 3.3°).
    expect(skyAtLocal(0, 100_000, 0, 90, 10).elevationDeg).toBeCloseTo(13.3, 1)
    expect(skyAtLocal(0, -100_000, 0, 90, 10).elevationDeg).toBeCloseTo(6.7, 1)
  })

  it("works at the pole", () => {
    expect(skyAtLocal(-90, 0, 0, 200, 3).elevationDeg).toBeCloseTo(3, 6)
  })
})

describe("drive radius and placements", () => {
  it("reads the preset radius from the drive link and clamps it", () => {
    expect(radiusFromDriveParams(params({ r: "10" }))).toBe(10)
    expect(radiusFromDriveParams(params({ r: "9000" }))).toBe(500)
    expect(radiusFromDriveParams(params({ r: "0.01" }))).toBe(0.1)
    expect(radiusFromDriveParams(params({ r: "-1" }))).toBeNull()
    expect(radiusFromDriveParams(params({}))).toBeNull()
  })

  it("stores placements per site and drops malformed entries", () => {
    const store = new Map<string, string>()
    const g = globalThis as unknown as { window?: unknown }
    const previous = g.window
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
    try {
      const key = placementSiteKey(-89.45, -225)
      expect(key).toBe("-89.4500,135.0000")
      savePlacements(key, [{ id: "a", type: "dome", eastM: 10, northM: -5, headingDeg: 0 }])
      expect(loadPlacements(key)).toHaveLength(1)
      expect(loadPlacements("elsewhere")).toEqual([])
      store.set("lunaris360-drive-placements-v1", JSON.stringify({ [key]: [{ id: "x", type: "castle", eastM: 0, northM: 0, headingDeg: 0 }] }))
      expect(loadPlacements(key)).toEqual([])
    } finally {
      g.window = previous
    }
  })
})

describe("parseDemQuery snapping", () => {
  it("snaps coordinates to 0.001° and the radius up to a preset so cache keys stay bounded", () => {
    expect(parseDemQuery(params({ lat: "0.67421", lon: "23.47319", radiusKm: "3" }))).toMatchObject({ latDeg: 0.674, lonDeg: 23.473, radiusKm: 5 })
    expect(parseDemQuery(params({ lat: "0", lon: "0", radiusKm: "0.5" }))).toMatchObject({ radiusKm: 0.5 })
  })
})
