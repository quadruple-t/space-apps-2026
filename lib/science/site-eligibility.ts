/**
 * Which catalog sites may receive `provenance: "scientific"` results.
 *
 * A catalog site is eligible only when its document carries a point coordinate AND that
 * coordinate is marked verified (primary-source LROC/NASA/NSSDCA). Unverified points
 * (for example Luna 9) and Artemis region references are rejected, so they can never be
 * presented as verified science. The catalog index exposes `coordsVerified` so clients
 * can apply the same rule without inferring it from `pointIsApproximate`.
 */
export type SiteEligibility =
  | { ok: true; latDeg: number; lonDeg: number }
  | { ok: false; reason: string };

type SiteLike = { coordinates?: { latDeg?: number | null; lonDeg?: number | null } | null; coordsVerified?: boolean | null };

export function scienceEligibility(site: SiteLike | undefined): SiteEligibility {
  const c = site?.coordinates;
  if (!c || typeof c.latDeg !== "number" || typeof c.lonDeg !== "number") {
    return { ok: false, reason: "The selected site does not have a point coordinate" };
  }
  if (site?.coordsVerified !== true) {
    return { ok: false, reason: "The selected site's coordinates are not verified, so scientific results are not available for it" };
  }
  return { ok: true, latDeg: c.latDeg, lonDeg: c.lonDeg };
}

/** Index-row form of the same rule, for client selectors. */
export function indexEntryIsScientific(e: { latDeg: number | null; lonDeg: number | null; coordsVerified?: boolean; pointIsApproximate?: boolean }): boolean {
  return e.coordsVerified === true && e.pointIsApproximate !== true && e.latDeg !== null && e.lonDeg !== null;
}
