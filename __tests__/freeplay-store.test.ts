import { beforeEach, describe, expect, test } from "@jest/globals"
import { PRESET_SITES } from "../data/sites"
import { currentTimeMs, useFreeplay } from "../lib/freeplay-store"

const initial = useFreeplay.getState()
beforeEach(() => useFreeplay.setState(initial, true))

describe("freeplay store", () => {
  test("custom site normalizes longitude to 0–360 and keeps the radius", () => {
    useFreeplay.getState().setRadius(12)
    useFreeplay.getState().selectCustom(-85.123456, -40)
    const { site, calloutOpen } = useFreeplay.getState()
    expect(site.kind).toBe("custom")
    expect(site.longitudeDeg).toBe(320)
    expect(site.latitudeDeg).toBe(-85.1235)
    expect(site.radiusKm).toBe(12)
    expect(calloutOpen).toBe(true)
  })

  test("elapsed time is clamped to the mission duration", () => {
    const s = useFreeplay.getState()
    s.setDuration(24)
    s.setElapsed(100)
    expect(useFreeplay.getState().elapsedHours).toBe(24)
    s.setElapsed(-5)
    expect(useFreeplay.getState().elapsedHours).toBe(0)
  })

  test("pressing play at the end restarts from zero", () => {
    const s = useFreeplay.getState()
    s.setDuration(24)
    s.setElapsed(24)
    s.setPlaying(true)
    expect(useFreeplay.getState().elapsedHours).toBe(0)
  })

  test("changing the start date resets playback", () => {
    const s = useFreeplay.getState()
    s.setElapsed(5)
    s.setPlaying(true)
    s.setStart("2027-01-01T00:00:00.000Z")
    const after = useFreeplay.getState()
    expect(after.elapsedHours).toBe(0)
    expect(after.playing).toBe(false)
    expect(currentTimeMs(after)).toBe(Date.parse("2027-01-01T00:00:00.000Z"))
  })

  test("saving and deleting a site", () => {
    const s = useFreeplay.getState()
    s.selectSite(PRESET_SITES[0])
    s.saveCurrentSite()
    const saved = useFreeplay.getState().savedSites
    expect(saved).toHaveLength(1)
    expect(useFreeplay.getState().site.id).toBe(saved[0].id)
    s.renameSaved(saved[0].id, "Base camp")
    expect(useFreeplay.getState().site.name).toBe("Base camp")
    s.deleteSaved(saved[0].id)
    expect(useFreeplay.getState().savedSites).toHaveLength(0)
    expect(useFreeplay.getState().site.kind).toBe("custom")
  })

  test("every preset has coordinates in range and a source", () => {
    for (const p of PRESET_SITES) {
      expect(p.latitudeDeg).toBeGreaterThanOrEqual(-90)
      expect(p.latitudeDeg).toBeLessThanOrEqual(90)
      expect(p.longitudeDeg).toBeGreaterThanOrEqual(0)
      expect(p.longitudeDeg).toBeLessThan(360)
      expect(p.source.length).toBeGreaterThan(5)
    }
    expect(new Set(PRESET_SITES.map((p) => p.id)).size).toBe(PRESET_SITES.length)
  })
})
