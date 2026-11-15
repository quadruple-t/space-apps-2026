import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, parseWeights, rankSites, recommend, type RankMeasurements } from "@/lib/science/rank";
import { lowConfidenceOxides } from "@/lib/science/composition";
import { scienceEligibility } from "@/lib/science/site-eligibility";

const m = (over: Partial<RankMeasurements> = {}): RankMeasurements => ({
  sunlightPercent: 50, worstWindowSunlightPercent: 50, longestDarknessHours: 300, earthVisibilityPercent: 50,
  slope100mDeg: 5, nearestColdTrapKm: null, feoWtPct: 10, tio2WtPct: 2, al2o3WtPct: 15, caoWtPct: 12, ...over,
});
const site = (id: string, over: Partial<RankMeasurements> = {}, flags: string[] = []) => ({ measurements: m(over), flags, extra: { siteId: id } });

describe("rank weight parsing", () => {
  it("defaults to the criteria every site has data for", () => {
    expect(parseWeights(null)).toEqual({ ok: true, weights: DEFAULT_WEIGHTS });
    expect(parseWeights("  ")).toEqual({ ok: true, weights: DEFAULT_WEIGHTS });
  });

  it("parses known criteria and rejects unknown names, bad numbers and all-zero weights", () => {
    expect(parseWeights("sunlight:3, darkness:2,iron:1")).toEqual({ ok: true, weights: { sunlight: 3, darkness: 2, iron: 1 } });
    expect(parseWeights("gold:5").ok).toBe(false);
    expect(parseWeights("sunlight:-1").ok).toBe(false);
    expect(parseWeights("sunlight:11").ok).toBe(false);
    expect(parseWeights("sunlight").ok).toBe(false);
    expect(parseWeights("sunlight:1:2").ok).toBe(false);
    expect(parseWeights("sunlight:0,slope:0").ok).toBe(false);
  });
});

describe("site ranking", () => {
  it("min-max scales each criterion in the right direction and ranks by the weighted mean", () => {
    const rows = rankSites([
      site("dark", { sunlightPercent: 20, longestDarknessHours: 350 }),
      site("bright", { sunlightPercent: 80, longestDarknessHours: 50 }),
      site("middle", { sunlightPercent: 50, longestDarknessHours: 200 }),
    ], { sunlight: 1, darkness: 1 });
    expect(rows.map((r) => r.siteId)).toEqual(["bright", "middle", "dark"]);
    expect(rows[0]).toMatchObject({ rank: 1, score: 1, scores: { sunlight: 1, darkness: 1 }, weightCoverage: 1 });
    expect(rows[2]).toMatchObject({ rank: 3, score: 0 });
    expect(rows[1].scores.sunlight).toBeCloseTo(0.5);
  });

  it("lets weights decide between competing criteria", () => {
    const inputs = [site("flat", { slope100mDeg: 1, sunlightPercent: 40 }), site("sunny", { slope100mDeg: 15, sunlightPercent: 90 })];
    expect(rankSites(inputs, { sunlight: 5, slope: 1 })[0].siteId).toBe("sunny");
    expect(rankSites(inputs, { sunlight: 1, slope: 5 })[0].siteId).toBe("flat");
  });

  it("scores a missing criterion as worst, flags it and reports weight coverage", () => {
    const rows = rankSites([
      site("polar", { nearestColdTrapKm: 2, sunlightPercent: 60 }),
      site("equatorial", { nearestColdTrapKm: null, sunlightPercent: 60 }),
      site("polar-far", { nearestColdTrapKm: 20, sunlightPercent: 60 }),
    ], { sunlight: 1, ice: 1 });
    const eq = rows.find((r) => r.siteId === "equatorial")!;
    expect(eq.flags).toContain("missing:ice");
    expect(eq.scores.ice).toBe(0);
    expect(eq.weightCoverage).toBe(0.5);
    expect(eq.score).toBe(0.5);
    // Lacking data never beats having the best value.
    expect(rows[0].siteId).toBe("polar");
    expect(rows.find((r) => r.siteId === "polar")!.scores.ice).toBe(1);
    expect(rows.find((r) => r.siteId === "polar-far")!.scores.ice).toBe(0);
  });

  it("gives everyone full marks when a criterion does not vary, and keeps unscorable sites unranked at the end", () => {
    const rows = rankSites([
      site("a", { slope100mDeg: 3 }), site("b", { slope100mDeg: 3 }), site("none", { slope100mDeg: null }),
    ], { slope: 1 });
    expect(rows.slice(0, 2).every((r) => r.scores.slope === 1)).toBe(true);
    expect(rows[2]).toMatchObject({ siteId: "none", score: null, rank: null, weightCoverage: 0 });
  });

  it("ignores a criterion no candidate has data for", () => {
    const rows = rankSites([site("a", { sunlightPercent: 80 }), site("b", { sunlightPercent: 40 })], { sunlight: 1, ice: 1 });
    expect(rows[0]).toMatchObject({ siteId: "a", score: 1, weightCoverage: 1 });
    expect(rows[0].flags).toContain("missing:ice");
  });

  it("keeps caller flags", () => {
    const [row] = rankSites([site("artemis", {}, ["approximate-region-point"])], DEFAULT_WEIGHTS);
    expect(row.flags).toEqual(["approximate-region-point"]);
  });
});

describe("recommended pick", () => {
  const row = (siteId: string, rank: number | null, flags: string[] = [], weightCoverage = 1) => ({ siteId, rank, flags, weightCoverage });

  it("is rank 1 when it carries no blocking flag", () => {
    expect(recommend([row("a", 1), row("b", 2)])).toMatchObject({ siteId: "a", rank: 1, passedOver: null, allBlocked: false });
  });

  it("passes over a heritage, impact or steep rank-1 site for the best clean one and says why", () => {
    for (const flag of ["heritage-protection-zone", "impact-site", "slope-over-hls-10deg"]) {
      const r = recommend([row("top", 1, [flag]), row("mid", 2, ["heritage-protection-zone"]), row("clean", 3, ["approximate-region-point"])])!;
      expect(r).toMatchObject({ siteId: "clean", rank: 3, passedOver: { siteId: "top", blockingFlags: [flag] } });
    }
  });

  it("skips sites with too little data, and falls back to the top score only when every site is blocked", () => {
    expect(recommend([row("a", 1, [], 0.3), row("b", 2, [], 1)])!.siteId).toBe("b");
    expect(recommend([row("a", 1, ["impact-site"]), row("b", 2, ["heritage-protection-zone"])])).toMatchObject({ siteId: "a", allBlocked: true, passedOver: null });
  });

  it("ignores unranked sites and returns null when nothing is ranked", () => {
    expect(recommend([row("a", null), row("b", 1)])!.siteId).toBe("b");
    expect(recommend([row("a", null)])).toBeNull();
    expect(recommend([])).toBeNull();
  });
});

describe("oxide noise", () => {
  it("flags values below two sigma of their uncertainty", () => {
    expect(lowConfidenceOxides({ FeO: 20.59, TiO2: 4.85, Al2O3: 2.05, CaO: 15.12 }, { FeO: 2.36, TiO2: 1.36, Al2O3: 7.83, CaO: 4.82 })).toEqual(["Al2O3"]);
    expect(lowConfidenceOxides({ TiO2: 0 }, { TiO2: 0.15 })).toEqual(["TiO2"]);
    expect(lowConfidenceOxides({ FeO: 10 }, { FeO: 5 })).toEqual([]);
    expect(lowConfidenceOxides({}, { FeO: 1 })).toEqual([]);
  });
});

describe("eligibility stays strict for the non-rank endpoints", () => {
  it("still refuses an Artemis region reference", () => {
    const artemis = { coordinates: null, coordsVerified: false, representativePoint: { latDeg: -85.995, lonDeg: -0.24 } };
    expect(scienceEligibility(artemis).ok).toBe(false);
  });
});
