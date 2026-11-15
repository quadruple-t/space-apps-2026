/**
 * Site screening for /api/v1/science/rank. Pure: inputs are per-site measurements already computed by
 * the API, outputs are min-max criterion scores, a weighted total and a rank.
 *
 * A criterion a site has no value for scores 0 (worst) and is reported as `missing:<criterion>`, so a
 * site can never gain rank by lacking data. A criterion no candidate has data for is left out entirely.
 */

export const RANK_CRITERIA = ["sunlight", "darkness", "earth", "slope", "ice", "iron", "titanium", "aluminium", "calcium"] as const;
export type RankCriterion = (typeof RANK_CRITERIA)[number];
export type RankWeights = Partial<Record<RankCriterion, number>>;

/** What each criterion reads and whether a larger value is better. */
export const CRITERION_INFO: Record<RankCriterion, { field: keyof RankMeasurements; higherIsBetter: boolean; label: string }> = {
  sunlight: { field: "sunlightPercent", higherIsBetter: true, label: "mean share of time the Sun is above the local horizon" },
  darkness: { field: "longestDarknessHours", higherIsBetter: false, label: "longest continuous darkness (worst window)" },
  earth: { field: "earthVisibilityPercent", higherIsBetter: true, label: "mean share of time Earth is above the local horizon" },
  slope: { field: "slope100mDeg", higherIsBetter: false, label: "terrain slope over a 100 m baseline" },
  ice: { field: "nearestColdTrapKm", higherIsBetter: false, label: "distance to the nearest cold trap (water-ice proxy, south polar only)" },
  iron: { field: "feoWtPct", higherIsBetter: true, label: "regional FeO abundance (about 60 km pixel)" },
  titanium: { field: "tio2WtPct", higherIsBetter: true, label: "regional TiO2 abundance (about 60 km pixel)" },
  aluminium: { field: "al2o3WtPct", higherIsBetter: true, label: "regional Al2O3 abundance (about 60 km pixel)" },
  calcium: { field: "caoWtPct", higherIsBetter: true, label: "regional CaO abundance (about 60 km pixel)" },
};

/** Used when the request gives no weights: the criteria every catalog site has data for. */
export const DEFAULT_WEIGHTS: RankWeights = { sunlight: 1, darkness: 1, earth: 1, slope: 1 };
export const MAX_WEIGHT = 10;

export type RankMeasurements = {
  sunlightPercent: number | null;
  worstWindowSunlightPercent: number | null;
  longestDarknessHours: number | null;
  earthVisibilityPercent: number | null;
  slope100mDeg: number | null;
  nearestColdTrapKm: number | null;
  feoWtPct: number | null;
  tio2WtPct: number | null;
  al2o3WtPct: number | null;
  caoWtPct: number | null;
};

export type RankInput<T> = { measurements: RankMeasurements; flags: string[]; extra: T };
/** `weightCoverage`: share of the scored weight this site had data for (1 = every active criterion). */
export type RankedRow<T> = T & RankMeasurements & { scores: Partial<Record<RankCriterion, number>>; score: number | null; weightCoverage: number; rank: number | null; flags: string[] };

/** Flags that make a site a poor place to build: the recommended pick is the best site without any of them. */
export const BLOCKING_FLAGS = ["heritage-protection-zone", "impact-site", "slope-over-hls-10deg"] as const;
/** A recommended pick must have data for at least this share of the scored weight. */
export const MIN_PICK_COVERAGE = 0.5;

export type Recommendation = {
  siteId: string;
  rank: number;
  reason: string;
  /** The rank-1 site when it was passed over, with the blocking flags that decided it. */
  passedOver: { siteId: string; blockingFlags: string[] } | null;
  allBlocked: boolean;
};

const blockingOf = (flags: string[]) => flags.filter((f) => (BLOCKING_FLAGS as readonly string[]).includes(f));

/** Best-ranked site with no blocking flag and enough data; the top score only if every site is blocked. Rows must be rank-sorted. */
export function recommend(rows: { siteId: string; rank: number | null; flags: string[]; weightCoverage: number }[]): Recommendation | null {
  const ranked = rows.filter((r) => r.rank !== null);
  if (!ranked.length) return null;
  const top = ranked[0];
  const clean = ranked.find((r) => blockingOf(r.flags).length === 0 && r.weightCoverage >= MIN_PICK_COVERAGE);
  if (!clean) return { siteId: top.siteId, rank: top.rank!, reason: "Every ranked site has a blocking flag or too little data, so this is simply the top score and carries those flags.", passedOver: null, allBlocked: true };
  const blocked = blockingOf(top.flags);
  const passed = clean.siteId !== top.siteId;
  return {
    siteId: clean.siteId, rank: clean.rank!, allBlocked: false,
    reason: passed ? "Best-ranked site with no blocking flag (heritage zone, impact site, slope over 10 degrees) and enough data; rank 1 was passed over." : "Rank 1 and no blocking flag.",
    passedOver: passed ? { siteId: top.siteId, blockingFlags: blocked.length ? blocked : ["low data coverage"] } : null,
  };
}

/** Parses `sunlight:3,darkness:2`. Returns an error message for unknown keys or bad numbers. */
export function parseWeights(raw: string | null): { ok: true; weights: RankWeights } | { ok: false; error: string } {
  if (raw === null || raw.trim() === "") return { ok: true, weights: { ...DEFAULT_WEIGHTS } };
  const weights: RankWeights = {};
  for (const part of raw.split(",")) {
    const [key, value, ...rest] = part.split(":").map((s) => s.trim());
    if (rest.length || !key) return { ok: false, error: `weights entry "${part}" must look like name:number` };
    if (!(RANK_CRITERIA as readonly string[]).includes(key)) return { ok: false, error: `Unknown weight "${key}". Allowed: ${RANK_CRITERIA.join(", ")}` };
    const n = Number(value);
    if (value === undefined || value === "" || !Number.isFinite(n) || n < 0 || n > MAX_WEIGHT) return { ok: false, error: `weight for ${key} must be a number from 0 to ${MAX_WEIGHT}` };
    weights[key as RankCriterion] = n;
  }
  if (!Object.values(weights).some((w) => (w ?? 0) > 0)) return { ok: false, error: "At least one weight must be greater than 0" };
  return { ok: true, weights };
}

export function activeCriteria(weights: RankWeights): RankCriterion[] {
  return RANK_CRITERIA.filter((c) => (weights[c] ?? 0) > 0);
}

/** Min-max normalises each active criterion across the candidates (1 = best), then ranks by the weighted mean. */
export function rankSites<T>(inputs: RankInput<T>[], weights: RankWeights): RankedRow<T>[] {
  const criteria = activeCriteria(weights);
  const ranges = new Map<RankCriterion, { min: number; max: number }>();
  for (const c of criteria) {
    const vals = inputs.map((s) => s.measurements[CRITERION_INFO[c].field]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length) ranges.set(c, { min: Math.min(...vals), max: Math.max(...vals) });
  }
  // Criteria with no data at any candidate carry no information, so they are not scored.
  const scored = criteria.filter((c) => ranges.has(c));
  const totalWeight = scored.reduce((a, c) => a + (weights[c] ?? 0), 0);
  const rows: RankedRow<T>[] = inputs.map((s) => {
    const scores: Partial<Record<RankCriterion, number>> = {};
    const flags = [...s.flags];
    let sum = 0, wsum = 0;
    for (const c of criteria) {
      const v = s.measurements[CRITERION_INFO[c].field];
      const r = ranges.get(c);
      if (!r) { flags.push(`missing:${c}`); continue; }
      if (typeof v !== "number" || !Number.isFinite(v)) { flags.push(`missing:${c}`); scores[c] = 0; continue; }
      const span = r.max - r.min;
      const norm = span === 0 ? null : (v - r.min) / span;
      const score = norm === null ? 1 : CRITERION_INFO[c].higherIsBetter ? norm : 1 - norm;
      scores[c] = Number(score.toFixed(3));
      sum += score * (weights[c] ?? 0);
      wsum += weights[c] ?? 0;
    }
    return { ...s.extra, ...s.measurements, scores, score: wsum > 0 ? Number((sum / totalWeight).toFixed(3)) : null, weightCoverage: totalWeight > 0 ? Number((wsum / totalWeight).toFixed(2)) : 0, rank: null, flags };
  });
  const order = rows.filter((r) => r.score !== null).sort((a, b) => (b.score! - a.score!) || ((a.longestDarknessHours ?? Infinity) - (b.longestDarknessHours ?? Infinity)));
  order.forEach((r, i) => { r.rank = i + 1; });
  return [...order, ...rows.filter((r) => r.score === null)];
}
