import { describe, expect, it } from "vitest"
import { makeGrid } from "@/lib/terrain/dem"
import { buildDemSurface, createRegolithNormalTexture, fillColors } from "@/scenes/lunar/dem-terrain"
import { cellOffsets, MAX_ROCK_RADIUS_M, ROCK_FIELD_HIGH, ROCK_FIELD_LOW, rockInCell, scatterRocks, type Rock } from "@/scenes/lunar/rock-field"

describe("decorative rock field", () => {
  it("is deterministic per cell and independent of the viewer", () => {
    expect(rockInCell(12, -7, 1.6, 0.42)).toEqual(rockInCell(12, -7, 1.6, 0.42))
    const a: Rock[] = [], b: Rock[] = []
    const na = scatterRocks(3.2, -4.1, ROCK_FIELD_HIGH, a)
    const nb = scatterRocks(3.2, -4.1, ROCK_FIELD_HIGH, b)
    expect(na).toBeGreaterThan(50)
    expect(a.slice(0, na)).toEqual(b.slice(0, nb))
    // A rock near both viewpoints sits at the same spot after a small step.
    const c: Rock[] = []
    const nc = scatterRocks(4.0, -4.1, ROCK_FIELD_HIGH, c)
    const near = a.slice(0, na).filter((r) => Math.hypot(r.x - 3.6, r.z + 4.1) < 3)
    for (const rock of near) expect(c.slice(0, nc).some((r) => r.x === rock.x && r.z === rock.z)).toBe(true)
  })

  it("stays within the radius and caps, nearest first", () => {
    for (const options of [ROCK_FIELD_HIGH, ROCK_FIELD_LOW]) {
      const out: Rock[] = []
      const n = scatterRocks(100, 250, options, out)
      expect(n).toBeLessThanOrEqual(options.maxRocks)
      let last = 0
      for (const rock of out.slice(0, n)) {
        const d = Math.hypot(rock.x - 100, rock.z - 250)
        expect(d).toBeLessThan(options.radiusM)
        expect(rock.radius).toBeGreaterThan(0)
        expect(rock.radius).toBeLessThanOrEqual(MAX_ROCK_RADIUS_M)
        // Cell order is nearest first; jitter within a cell allows a little slack.
        expect(d).toBeGreaterThan(last - options.cellM * 1.5)
        last = Math.max(last, d)
      }
    }
    const capped: Rock[] = []
    expect(scatterRocks(0, 0, { ...ROCK_FIELD_HIGH, maxRocks: 10 }, capped)).toBe(10)
    expect(cellOffsets(3).slice(0, 2)).toEqual(new Int32Array([0, 0]))
  })

  it("respects the accept filter", () => {
    const out: Rock[] = []
    const n = scatterRocks(0, 0, ROCK_FIELD_LOW, out, (x) => x > 0)
    expect(n).toBeGreaterThan(0)
    for (const rock of out.slice(0, n)) expect(rock.x).toBeGreaterThan(0)
  })
})

describe("regolith surface", () => {
  it("colours the default regolith mode in neutral grey", () => {
    const size = 33
    const heights = new Float32Array(size * size).map((_, k) => Math.sin(k * 0.3) * 40 + (k % size) * 3)
    const surface = buildDemSurface(makeGrid(heights, size, 1))
    const colors = new Float32Array(size * size * 3)
    fillColors(surface, "regolith", colors)
    for (let k = 0; k < size * size; k++) {
      expect(colors[k * 3]).toBeCloseTo(colors[k * 3 + 1], 6)
      expect(colors[k * 3 + 1]).toBeCloseTo(colors[k * 3 + 2], 6)
      expect(colors[k * 3]).toBeGreaterThan(0.03)
    }
    // Analysis colour modes still produce colour.
    fillColors(surface, "elevation", colors)
    expect(colors.some((v, k) => k % 3 === 0 && Math.abs(v - colors[k + 2]) > 0.1)).toBe(true)
  })

  it("builds a tileable micro-relief normal map pointing mostly up", () => {
    const texture = createRegolithNormalTexture(64)
    const data = texture.image.data as Uint8Array
    expect(data.length).toBe(64 * 64 * 4)
    let blue = 0
    for (let k = 0; k < 64 * 64; k++) blue += data[k * 4 + 2]
    expect(blue / (64 * 64)).toBeGreaterThan(200)
    texture.dispose()
  })
})
