import { describe, expect, it } from "vitest"
import { catalogToFreeplay, type FreeplaySite } from "@/data/sites"
import { approachHref, driveHref, lunarSiteFor, siteFromDriveParams, timeFromDriveParams } from "@/lib/drive-link"

const custom: FreeplaySite = {
  id: "custom-1", name: "Ridge camp", latitudeDeg: -89.2, longitudeDeg: 120, radiusKm: 10, kind: "custom",
  coordinateReference: "x", provenance: "user",
}
const query = (href: string) => new URLSearchParams(href.split("?")[1])
const T = Date.parse("2027-03-14T05:30:00.000Z")

describe("Freeplay → drive links", () => {
  it("carries a custom site and time, and the drive reads them back", () => {
    const q = query(driveHref(custom, T))
    expect(siteFromDriveParams(q)).toMatchObject({ name: "Ridge camp", latitudeDeg: -89.2, longitudeDeg: 120, provenance: "user" })
    expect(timeFromDriveParams(q)?.getTime()).toBe(T)
  })

  it("uses the catalog id for verified catalog sites so the drive gets their LOLA mask", () => {
    const apollo = catalogToFreeplay({ id: "apollo-11-tranquility", name: "Apollo 11", latDeg: 0.67416, lonDeg: 23.47314 })
    expect(lunarSiteFor(apollo)).toMatchObject({ id: "apollo-11-tranquility", provenance: "scientific" })
  })

  it("never sends approximate catalog points by id (the science API rejects them)", () => {
    const malapert = catalogToFreeplay({ id: "artemis-malapert-massif", name: "Malapert", latDeg: -85.995, lonDeg: -0.24, pointIsApproximate: true })
    expect(query(driveHref(malapert, T)).get("siteId")).toBeNull()
    expect(lunarSiteFor(malapert).provenance).toBe("user")
    // the approach planner still selects it by id (its terrain lookup falls back to coordinates)
    expect(query(approachHref(malapert, T)).get("siteId")).toBe("artemis-malapert-massif")
  })

  it("rejects missing or out-of-range coordinates", () => {
    expect(siteFromDriveParams(new URLSearchParams(""))).toBeNull()
    expect(siteFromDriveParams(new URLSearchParams("lat=95&lon=10"))).toBeNull()
    expect(timeFromDriveParams(new URLSearchParams("t=not-a-date"))).toBeNull()
  })

  it("without a site, links to the plain pages", () => {
    expect(driveHref(null, T)).toBe("/freeplay/drive")
    expect(approachHref(null, T)).toBe("/freeplay/approach")
  })
})
