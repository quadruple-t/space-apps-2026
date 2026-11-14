/**
 * Earth visibility from the prefetched JPL Horizons year (2026-12-01, hourly).
 * The far side never sees Earth; the near-side equator always does.
 */
import { describe, expect, test } from "@jest/globals"
import { readFileSync } from "fs"
import { join } from "path"
import { PRESET_SITES } from "../data/sites"
import { observerFile, PREFETCH_DAYS, type PrefetchedObserver } from "../lib/prefetch"

const load = (id: string, command: "10" | "399") => {
  const s = PRESET_SITES.find((p) => p.id === id)!
  const file = join(process.cwd(), "public", "data", "horizons", "prefetch", observerFile(command, s.latitudeDeg, s.longitudeDeg))
  return JSON.parse(readFileSync(file, "utf8")) as PrefetchedObserver
}

describe("Earth visibility from Horizons", () => {
  test("Chang'e 4 (far side): Earth stays below the horizon for a whole year", () => {
    const d = load("change4", "399")
    expect(d.el).toHaveLength(PREFETCH_DAYS * 24 + 1)
    expect(Math.max(...d.el)).toBeLessThan(0)
  })

  test("Chang'e 6 (far side): Earth stays below the horizon", () => {
    expect(Math.max(...load("change6", "399").el)).toBeLessThan(0)
  })

  test("Apollo 11 (near-side equator): Earth is always well above the horizon", () => {
    expect(Math.min(...load("apollo11", "399").el)).toBeGreaterThan(45)
  })

  test("Chang'e 4 still gets sunlight: the Sun rises and sets each lunar day", () => {
    const el = load("change4", "10").el
    expect(Math.max(...el)).toBeGreaterThan(30)
    expect(Math.min(...el)).toBeLessThan(-30)
  })
})
