import { describe, expect, it } from "vitest";
import { encodeFloat32 } from "@/lib/bytes";
import { decodeCellStats, decodePsrPolygons, encodeCellStats, encodePsrPolygons, MASK_NO_DATA } from "@/lib/firestore/binary";
import {
  coordinatesToRings,
  ephemerisChunkFromData,
  protectionZoneFromData,
  reportToData,
  ringsToCoordinates,
  siteFromData,
  terrainGridTileFromData,
} from "@/lib/firestore/converters";
import { ChapterOrderError, DocumentShapeError } from "@/lib/firestore/errors";
import {
  applyCompleteChapter,
  applyExpertMode,
  emptyProgress,
  isMissionControlUnlocked,
  mergeProgress,
  normalizeProgress,
} from "@/lib/firestore/progressLogic";
import { decodeSessionFromUrl, encodeSessionToUrl } from "@/lib/firestore/sessionUrl";
import { loadSeedDocs } from "@/scripts/seed/load";
import { validateSeed } from "@/scripts/seed/validate";
import type { SessionState } from "@/lib/model/types";

const NOW = "2026-11-14T00:00:00.000Z";

describe("binary layouts", () => {
  it("decodes terrainGrid cellStats (7 bytes/cell, nulls, hasData from masks)", () => {
    const bins = 4;
    const masks = new Int16Array([100, 200, 300, 400, MASK_NO_DATA, MASK_NO_DATA, MASK_NO_DATA, MASK_NO_DATA]);
    const bytes = encodeCellStats([
      { slope100mDeg: 3.25, nearestPsrKm: 1.23, nearestColdTrapKm: null, insidePsr: true },
      { slope100mDeg: null, nearestPsrKm: null, nearestColdTrapKm: 655.34, insidePsr: false },
    ]);
    const stats = decodeCellStats(bytes, masks, bins, 2);
    expect(stats[0]).toEqual({ hasData: true, slope100mDeg: 3.25, nearestPsrKm: 1.23, nearestColdTrapKm: null, insidePsr: true });
    expect(stats[1]).toEqual({ hasData: false, slope100mDeg: null, nearestPsrKm: null, nearestColdTrapKm: 655.34, insidePsr: false });
  });

  it("round-trips delta-coded PSR polygons", () => {
    const polys = [
      { areaKm2: 12.34, coldTrapFraction: 0.5, rings: [[[1000, 2000], [1100, 2000], [1100, 2100]] as [number, number][]] },
      {
        areaKm2: 1.01,
        coldTrapFraction: null,
        rings: [
          [[-5, -5], [5, -5], [5, 5], [-5, 5]] as [number, number][],
          [[-1, -1], [1, -1], [1, 1]] as [number, number][],
        ],
      },
    ];
    const { polygons, index } = encodePsrPolygons(polys);
    const out = decodePsrPolygons(polygons, index, [{ i: 1, name: "Shackleton" }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ index: 0, areaKm2: 12.34, coldTrapFraction: 0.5, name: null, rings: polys[0].rings });
    expect(out[1]).toMatchObject({ index: 1, areaKm2: 1.01, coldTrapFraction: null, name: "Shackleton", rings: polys[1].rings });
  });
});

describe("converters", () => {
  it("maps protection-zone rings to GeoJSON [lon, lat] and back", () => {
    const rings = [{ points: [{ latDeg: -89, lonDeg: 10 }, { latDeg: -89.1, lonDeg: 11 }, { latDeg: -89.2, lonDeg: 12 }] }];
    expect(ringsToCoordinates(rings)).toEqual([[[10, -89], [11, -89.1], [12, -89.2]]]);
    expect(coordinatesToRings(ringsToCoordinates(rings))).toEqual(rings);
    const zone = protectionZoneFromData("z", {
      kind: "psr-ice",
      ruleId: "psr-buffer-by-analogy",
      name: "Z",
      siteId: null,
      geometry: { type: "Polygon", rings },
      rationale: "r",
      sources: [],
      needsData: false,
      coldTrapFraction: null,
    });
    expect(zone.geometry).toEqual({ type: "Polygon", coordinates: [[[10, -89], [11, -89.1], [12, -89.2]]] });
    expect(zone.coldTrapFraction).toBeNull();
  });

  it("converts Timestamps to ISO and rejects bad enums", () => {
    const base = {
      name: "S", family: "apollo", siteKind: "landing", country: "USA", agency: "NASA", mission: null,
      landingTimeUtc: null, landingTimePrecision: null, outcome: "success", outcomeDetail: null,
      coordinates: { latDeg: 1, lonDeg: 2 }, latDeg: 1, lonDeg: 2, coordsVerified: true, coordsFrame: "MOON_ME",
      coordsUncertaintyM: null, coordsAsPublished: null, representativePoint: null, chapterId: null, blurb: "b",
      sources: [], terrainSummary: null, updatedAt: { toDate: () => new Date(NOW) },
    };
    const site = siteFromData("s", base);
    expect(site.updatedAt).toBe(NOW);
    expect(site).not.toHaveProperty("latDeg");
    expect(() => siteFromData("s", { ...base, family: "artemis-iii-candidate" })).toThrow(DocumentShapeError);
  });

  it("decodes ephemeris Bytes and checks the row count", () => {
    const d = {
      startUtc: "2027-01-01T00:00:00Z", stepMinutes: 60, count: 1,
      layout: ["sunLatDeg", "sunLonDeg", "sunDistKm", "earthLatDeg", "earthLonDeg", "earthDistKm"],
      data: encodeFloat32([1, 2, 3, 4, 5, 6]), sunAngularDiameterDegMean: 0.53, frame: "MOON_ME (DE421)",
      timeScale: "UTC", source: "JPL Horizons API", horizonsQuery: "q", ephemerisVersion: "DE441", retrievedAt: NOW,
    };
    const chunk = ephemerisChunkFromData("2027-01", d);
    expect(Array.from(chunk.data)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => ephemerisChunkFromData("2027-01", { ...d, count: 2 })).toThrow(/data has 6 values, expected 12/);
  });

  it("decodes a terrainGrid tile", () => {
    const cells = 4;
    const bins = 2;
    const masks = new Int16Array(cells * bins).fill(MASK_NO_DATA);
    masks[2] = 150;
    const tile = terrainGridTileFromData("t", {
      gridSpacingKm: 0.24, tileOriginXY: { xM: 0, yM: 0 }, cellsPerSide: 2, binDeg: 180, bins,
      masks: new Uint8Array(masks.buffer), maskErr: new Uint8Array(cells * bins),
      cellStats: encodeCellStats(Array.from({ length: cells }, () => ({ slope100mDeg: 1, nearestPsrKm: 2, nearestColdTrapKm: 3, insidePsr: false }))),
      demProducts: [], rayLengthKm: 150, observerHeightM: 2, computedAt: NOW,
    });
    expect(tile.cellStats.map((c) => c.hasData)).toEqual([false, true, false, false]);
    expect(tile.masks[2]).toBe(150);
  });

  it("strips time series from report payloads", () => {
    const summary = {
      siteLabel: "A", latDeg: 0, lonDeg: 0, scoreTotal: 1, disqualified: false,
      longestLitHours: 1, longestDarkHours: 1, minSocPct: null, flags: [],
    };
    const input = {
      profileId: "short-landing" as const, window: { start: NOW, end: NOW, stepMinutes: 60 },
      siteSummaries: [{ ...summary, series: [1] }], methodsSummary: "m", disclaimer: "d", format: "csv" as const,
      series: [1, 2],
    };
    const out = reportToData(input);
    expect(out).not.toHaveProperty("series");
    expect((out.siteSummaries as object[])[0]).not.toHaveProperty("series");
    expect(() => reportToData({ ...input, siteSummaries: [] })).toThrow();
  });
});

describe("progress logic", () => {
  it("enforces chapter order and unlocks tools", () => {
    let p = emptyProgress();
    expect(() => applyCompleteChapter(p, "ch2-robotic-explorer", NOW)).toThrow(ChapterOrderError);
    p = applyCompleteChapter(p, "ch1-first-landing", NOW);
    p = applyCompleteChapter(p, "ch2-robotic-explorer", NOW);
    expect(isMissionControlUnlocked(p)).toBe(false);
    p = applyCompleteChapter(p, "ch3-lunar-base", NOW);
    expect(p.unlockedTools).toEqual(["horizon-dial", "power-simulator", "base-scoring"]);
    expect(isMissionControlUnlocked(p)).toBe(true);
    expect(isMissionControlUnlocked(applyExpertMode(emptyProgress(), NOW))).toBe(true);
  });

  it("merges local into remote (union, OR, later stepAnswers win)", () => {
    const local = { ...emptyProgress("2026-11-14T10:00:00Z"), chaptersCompleted: ["ch1-first-landing" as const], stepAnswers: { a: 1 } };
    const remote = { ...emptyProgress("2026-11-13T10:00:00Z"), unlockedTools: ["power-simulator" as const], expertMode: true, stepAnswers: { b: 2 } };
    const m = mergeProgress(local, remote, NOW);
    expect(m.chaptersCompleted).toEqual(["ch1-first-landing"]);
    expect(m.unlockedTools).toEqual(["power-simulator"]);
    expect(m.expertMode).toBe(true);
    expect(m.stepAnswers).toEqual({ a: 1 });
    expect(mergeProgress({ ...local, updatedAt: "2026-11-01T00:00:00Z" }, remote, NOW).stepAnswers).toEqual({ b: 2 });
  });

  it("normalizes untrusted localStorage data", () => {
    const p = normalizeProgress({ chaptersCompleted: ["ch3-lunar-base", "bogus", "ch1-first-landing"], unlockedTools: "x", stepAnswers: { a: {}, b: "ok" } });
    expect(p.chaptersCompleted).toEqual(["ch1-first-landing", "ch3-lunar-base"]);
    expect(p.unlockedTools).toEqual([]);
    expect(p.stepAnswers).toEqual({ b: "ok" });
  });
});

describe("session URL", () => {
  const state: SessionState = {
    siteSelections: [
      { kind: "library", siteId: "apollo-11-tranquility" },
      { kind: "custom", label: "Rim, west", coordinates: { latDeg: -89.45, lonDeg: -137.31 } },
    ],
    window: { start: "2027-01-01T00:00:00Z", end: "2027-01-15T00:00:00Z", stepMinutes: 30 },
    scrubTime: "2027-01-02T12:00:00Z",
    profileId: "long-term-base",
  };

  it("round-trips", () => {
    expect(decodeSessionFromUrl(`?${encodeSessionToUrl(state)}`)).toEqual(state);
  });

  it("rejects invalid input", () => {
    const q = new URLSearchParams(encodeSessionToUrl(state));
    const variant = (k: string, v: string | null) => {
      const c = new URLSearchParams(q);
      if (v === null) c.delete(k);
      else c.set(k, v);
      return decodeSessionFromUrl(c.toString());
    };
    expect(variant("profile", "week-long")).toBeNull();
    expect(variant("sel", null)).toBeNull();
    expect(variant("sel", "pt:-91,0")).toBeNull();
    expect(variant("sel", "pt:0,181")).toBeNull();
    expect(variant("sel", "site:../etc")).toBeNull();
    expect(variant("step", "0")).toBeNull();
    expect(variant("end", "2026-01-01T00:00:00Z")).toBeNull();
    const four = new URLSearchParams(q);
    four.append("sel", "site:a");
    four.append("sel", "site:b");
    expect(decodeSessionFromUrl(four.toString())).toBeNull();
    expect(variant("t", "2030-01-01T00:00:00Z")?.scrubTime).toBe(state.window.end);
  });
});

describe("seed validator", () => {
  it("accepts the current data/seed", () => {
    const { docs, errors } = loadSeedDocs("data/seed");
    expect(errors).toEqual([]);
    expect(validateSeed(docs)).toEqual([]);
  }, 60_000); // Full static dataset includes the binary globe archive.

  it("flags bad enums, weights, refs and users/", () => {
    const doc = (p: string, data: Record<string, never> | object) => ({
      path: p, collection: p.split("/")[0], group: p.split("/").filter((_, i) => i % 2 === 0).join("/*/"), file: p,
      data: data as never,
    });
    const errors = validateSeed([
      doc("sites/a", { name: "A", family: "nope", siteKind: "landing", outcome: "success", chapterId: null }),
      doc("missionProfiles/short-landing", { weights: { sunlight: 0.5, earthComms: 0.6, thermalMargin: 0, batterySurvival: 0, iceAccess: 0, longSunlight: 0, hazardMargin: 0 } }),
      doc("validationChecks/v", { siteId: "missing" }),
      doc("users/u", {}),
    ]);
    expect(errors.join("\n")).toMatch(/family/);
    expect(errors.join("\n")).toMatch(/weights sum to 1\.1/);
    expect(errors.join("\n")).toMatch(/"missing" is not a site/);
    expect(errors.join("\n")).toMatch(/users\/ must never be seeded/);
  });
});
