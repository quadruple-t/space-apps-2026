#!/usr/bin/env python3
"""Stage 30: per-site horizon masks -> sites/<id>/terrain/v1.json, and terrainSummary on sites/<id>.

Method (prompt §5.3; docs/METHODS.md): 720 great-circle sight lines at 0.5°, rays to 310 km, exact
curvature, observer height dz = 1 m above the DEM surface. Nested DEMs by latitude regime:

  regime   near field                                   mid field                 far field (to 310 km)
  5m       PGDA-78 5 m tile, 0-5 km @ 5 m               80 m, 5-100 km @ 80 m     240 m @ 240 m
  polar    PGDA-90 20 m COG window, 0-7 km @ 20 m       80 m, 7-100 km @ 80 m     240 m @ 240 m
  60-80S   PGDA-90 60 m COG window, 0-20 km @ 60 m      -                         240 m (+LDEM_64 fallback)
  equat.   SLDEM2015 512 ppd window, 0-20 km @ 60 m     -                         LOLA LDEM_64 window @ 240 m
  north60  LOLA LDEM_512 window, 0-20 km @ 60 m         -                         LOLA LDEM_64 window @ 240 m

Heights are relative to the 1737.4 km sphere throughout (PGDA, SLDEM2015 and LOLA GDR share it).
Slope at 100 m: PGDA LDRM_80S_50MPP_ADJ_SLP_100M (plane fit, 100 m baseline) for sites poleward of
80°S, with slope error from LDSM_80S_20MPP_ADJ_ERR; elsewhere a least-squares plane over the 3x3
near-field pixels (~180 m baseline, recorded in notes). PSR / cold-trap distances need 40_psr.py first.
"""
import argparse
import sys

import numpy as np
import shapely

from pipeline.common import CACHE, PIPELINE_VERSION, SEED, b64, finite_or_none, log, now_iso, read_json, ref, write_doc
from pipeline.dem import StereoRaster, ldem512_north_window, ldem64_window, sldem_window, stereo_bbox
from pipeline.geo import ll_to_xy, scale_factor
from pipeline.raycast import Band, horizon_mask, plane_fit_slope_deg
from pipeline.sources import PGDA90

N_AZ = 720
DZ_M = 1.0
RAY_KM = 310.0

TILE_5M = {}  # filled lazily: name -> (surf, toterr)


def load_globals():
    g = {
        "d240": StereoRaster.from_file("pgda90/LDEM_60S_240MPP_ADJ.TIF"),
        "e240": StereoRaster.from_file("pgda90/LDEM_60S_240MPP_ADJ_ERR.TIF"),
        "d80": StereoRaster.from_file("pgda90/LDEM_80S_80MPP_ADJ.TIF"),
        "e80": StereoRaster.from_file("pgda90/LDEM_80S_80MPP_ADJ_ERR.TIF"),
    }
    return g


def tile_5m(name):
    if name not in TILE_5M:
        TILE_5M[name] = (StereoRaster.from_file(f"pgda78/{name}_final_adj_5mpp_surf.tif", f"{name}_5mpp_surf"),
                         StereoRaster.from_file(f"pgda78/{name}_final_adj_5mpp_toterr.tif", f"{name}_5mpp_toterr"))
    return TILE_5M[name]


def find_5m_tile(lat, lon):
    from pipeline.sources import SITES_5M
    x, y = ll_to_xy(lat, lon)
    for name in SITES_5M:
        try:
            surf, _ = tile_5m(name)
        except FileNotFoundError:
            continue
        x0, x1, y0, y1 = surf.extent
        # need >= 5 km of near field inside the tile on every side
        if x0 + 5000 <= x <= x1 - 5000 and y0 + 5000 <= y <= y1 - 5000:
            return name
    return None


def build_bands(lat, lon, g):
    notes, products = [], []
    # LOLA LDEM_64 (~474 m) far-field window; also the fallback beyond the 240 m polar map.
    ld = [ldem64_window(lat, lon)] if lat > -80 else []
    t5 = find_5m_tile(lat, lon) if lat <= -80 else None
    if t5:
        surf, err = tile_5m(t5)
        bands = [Band(0, 5, 0.005, [surf, g["d80"], g["d240"]], [err, g["e80"]], "5 m"),
                 Band(5, 100, 0.08, [g["d80"], g["d240"]], [g["e80"], g["e240"]], "80 m"),
                 Band(100, RAY_KM, 0.24, [g["d240"]] + ld, [g["e240"], 20.0], "240 m")]
        products = [f"PGDA-78 {t5}_final_adj_5mpp_surf (5 m)", "PGDA-90 LDEM_80S_80MPP_ADJ (80 m)", "PGDA-90 LDEM_60S_240MPP_ADJ (240 m)"]
        regime = "5m"
    elif lat <= -80:
        bb = stereo_bbox(lat, lon, 8000)
        d20 = StereoRaster.from_cog("LDEM_80S_20MPP_ADJ", f"{PGDA90}/LDEM_80S_20MPP_ADJ.TIF", bb)
        e20 = StereoRaster.from_cog("LDEM_80S_20MPP_ADJ_ERR", f"{PGDA90}/LDEM_80S_20MPP_ADJ_ERR.TIF", bb)
        bands = [Band(0, 7, 0.02, [d20, g["d80"], g["d240"]], [e20, g["e80"]], "20 m"),
                 Band(7, 100, 0.08, [g["d80"], g["d240"]], [g["e80"], g["e240"]], "80 m"),
                 Band(100, RAY_KM, 0.24, [g["d240"]] + ld, [g["e240"], 20.0], "240 m")]
        products = ["PGDA-90 LDEM_80S_20MPP_ADJ (20 m, COG window)", "PGDA-90 LDEM_80S_80MPP_ADJ (80 m)", "PGDA-90 LDEM_60S_240MPP_ADJ (240 m)"]
        regime = "polar"
    elif lat <= -60:
        bb = stereo_bbox(lat, lon, 21000)
        d60 = StereoRaster.from_cog("LDEM_60S_60MPP_ADJ", f"{PGDA90}/LDEM_60S_60MPP_ADJ.TIF", bb)
        e60 = StereoRaster.from_cog("LDEM_60S_60MPP_ADJ_ERR", f"{PGDA90}/LDEM_60S_60MPP_ADJ_ERR.TIF", bb)
        bands = [Band(0, 20, 0.06, [d60, g["d240"]] + ld, [e60, g["e240"]], "60 m"),
                 Band(20, RAY_KM, 0.24, [g["d240"]] + ld, [g["e240"], 20.0], "240 m")]
        products = ["PGDA-90 LDEM_60S_60MPP_ADJ (60 m, COG window)", "PGDA-90 LDEM_60S_240MPP_ADJ (240 m)", "LOLA LDEM_64 (fallback beyond the 240 m map)"]
        regime = "60-80S"
    elif abs(lat) <= 59.8:
        sw = sldem_window(lat, lon, 21.0)
        bands = [Band(0, 20, 0.06, [sw] + ld, [3.5, 20.0], "SLDEM2015"),
                 Band(20, RAY_KM, 0.24, ld, [20.0], "LDEM_64")]
        products = ["SLDEM2015 512 ppd (59 m, range-read window)", "LOLA LDEM_64 (64 ppd, ~474 m, range-read window)"]
        notes.append("Far field (20-310 km) uses LOLA LDEM_64 (~474 m pixels), which smooths distant peaks; its height error is an assumed 20 m (far-field error barely affects the mask).")
        regime = "equatorial"
    else:
        nw = ldem512_north_window(lat, lon, 21.0)
        bands = [Band(0, 20, 0.06, [nw] + ld, [5.0, 20.0], "LDEM_512"),
                 Band(20, RAY_KM, 0.24, ld, [20.0], "LDEM_64")]
        products = ["LOLA LDEM_512 (512 ppd, ~59 m, range-read window)", "LOLA LDEM_64 (64 ppd, ~474 m, range-read window)"]
        notes.append("North of 60°N SLDEM2015 has no coverage, so the near field uses LOLA LDEM_512 (gridded LOLA tracks, many interpolated pixels); its height error is an assumed 5 m.")
        regime = "north60"
    return bands, products, notes, regime, t5


def slope_and_roughness(lat, lon, regime, bands):
    """Returns slope100mDeg, slope100mErrDeg, roughness100mM, note."""
    if lat <= -80:
        bb = stereo_bbox(lat, lon, 150)
        slp = StereoRaster.from_cog("LDRM_80S_50MPP_ADJ_SLP_100M", f"{PGDA90}/LDRM_80S_50MPP_ADJ_SLP_100M.TIF", bb)
        rgh = StereoRaster.from_cog("LDRM_80S_50MPP_ADJ_ROUGH_100M", f"{PGDA90}/LDRM_80S_50MPP_ADJ_ROUGH_100M.TIF", bb)
        sle = StereoRaster.from_cog("LDSM_80S_20MPP_ADJ_ERR", f"{PGDA90}/LDSM_80S_20MPP_ADJ_ERR.TIF", bb)
        x, y = ll_to_xy(np.array([lat]), np.array([lon]))
        s = finite_or_none(slp.sample_xy(x, y)[0], 2)
        r = finite_or_none(rgh.sample_xy(x, y)[0], 2)
        e = finite_or_none(sle.sample_xy(x, y)[0], 2)
        return s, e, r, ("Slope: PGDA-90 LDRM_80S_50MPP_ADJ_SLP_100M (plane fit over a 100 m baseline). Slope error: LDSM_80S_20MPP_ADJ_ERR "
                         "at the site (20 m pixel-scale slope error; a conservative bound for the 100 m baseline). Roughness: LDRM ROUGH_100M.")
    src = bands[0].sources[0]
    if regime == "60-80S":
        x, y = ll_to_xy(lat, lon)
        col = int(round((float(x) - src.x0) / src.dx - 0.5)); row = int(round((src.y0 - float(y)) / src.dx - 0.5))
        win = src.arr[row - 1:row + 2, col - 1:col + 2]
        s = plane_fit_slope_deg(win, src.dx)
        return (None if s is None else round(s, 2)), None, None, "Slope: least-squares plane over 3x3 pixels of LDEM_60S_60MPP_ADJ (~180 m baseline, not 100 m)."
    if regime == "equatorial":
        row = int(round((src.lat_top - lat) * src.ppd - 0.5)); col = int(round(((lon - src.lon_left) % 360) * src.ppd - 0.5))
        win = src.arr[row - 1:row + 2, col - 1:col + 2]
        dx = 1737400 * np.pi / 180 / src.ppd
        # columns shrink with cos(lat): fit with anisotropic spacing
        if win.shape == (3, 3) and not np.isnan(win).any():
            yy, xx = np.mgrid[0:3, 0:3]
            A = np.column_stack([xx.ravel() * dx * np.cos(np.radians(lat)), -yy.ravel() * dx, np.ones(9)])
            (a, b, _), *_ = np.linalg.lstsq(A, win.ravel().astype(float), rcond=None)
            s = float(np.degrees(np.arctan(np.hypot(a, b))))
            return round(s, 2), None, None, "Slope: least-squares plane over 3x3 SLDEM2015 pixels (~178 m baseline, not 100 m)."
        return None, None, None, "Slope unavailable (SLDEM2015 window incomplete)."
    return None, None, None, "Slope not computed north of 60°N (no fine DEM)."


class PsrIndex:
    def __init__(self):
        z = np.load(CACHE / "psr_index.npz")
        geoms = shapely.from_wkb(np.load(CACHE / "psr_full.wkb.npy", allow_pickle=True))
        self.cold = z["cold"]
        self.tree_all = shapely.STRtree(geoms)
        self.geoms = geoms
        self.cold_geoms = geoms[self.cold]
        self.tree_cold = shapely.STRtree(self.cold_geoms)

    def query(self, lat, lon):
        """(nearestPsrKm, nearestColdTrapKm, insidePsr) for points poleward of 80°S, else Nones."""
        if lat > -80:
            return None, None, None
        x, y = ll_to_xy(lat, lon)
        p = shapely.Point(float(x), float(y))
        k = scale_factor(lat)
        i, d = self.tree_all.query_nearest(p, return_distance=True)
        j, dc = self.tree_cold.query_nearest(p, return_distance=True)
        inside = bool(d[0] == 0.0)
        return round(float(d[0]) / k / 1000, 3), (round(float(dc[0]) / k / 1000, 3) if len(dc) else None), inside


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated site ids")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    g = load_globals()
    try:
        psr = PsrIndex()
    except FileNotFoundError:
        psr = None
        log("  PSR index missing (run 40_psr.py first): PSR distances will be null")

    stamp = now_iso()
    done, skipped = 0, []
    for p in sorted((SEED / "sites").glob("*.json")):
        sid = p.stem
        if only and sid not in only:
            continue
        s = read_json(p)
        pt = s.get("coordinates") or s.get("representativePoint")
        if not pt:
            skipped.append(sid)
            continue
        lat, lon = float(pt["latDeg"]), float(pt["lonDeg"])
        try:
            bands, products, notes, regime, t5 = build_bands(lat, lon, g)
            r = horizon_mask(lat, lon, bands, N_AZ, DZ_M)
        except Exception as e:
            log(f"  {sid}: FAILED {e}")
            skipped.append(sid)
            continue
        if np.isnan(r.mask_deg).any():
            log(f"  {sid}: {int(np.isnan(r.mask_deg).sum())} azimuths without terrain; skipping")
            skipped.append(sid)
            continue
        slope, slope_err, rough, slope_note = slope_and_roughness(lat, lon, regime, bands)
        npsr, ncold, inside = psr.query(lat, lon) if psr else (None, None, None)
        err_margin = float(round(2 * np.nanpercentile(r.sigma_deg, 95), 3))
        srcs = [ref("pgda90")] + ([ref("pgda78")] if t5 else []) + ([ref("sldem2015")] if regime == "equatorial" else []) \
            + ([ref("lolaGdr")] if regime in ("equatorial", "north60", "60-80S") else []) + ([ref("divinerPrp")] if npsr is not None else [])
        if s.get("representativePoint"):
            notes.insert(0, "Computed at the approximate region reference point, not at a NASA site coordinate.")
        notes += [slope_note,
                  f"Observer {DZ_M:g} m above the DEM surface (h = {r.h_obs_m:.1f} m above the 1737.4 km sphere). errorMarginDeg = 2 x the 95th percentile of the per-azimuth 1-sigma error (maskSigma).",
                  "maskP05/maskP95 are null: the product-78 error clones were not processed (see docs/MISSING_DATA.md)."]
        if npsr is None:
            notes.append("PSR and cold-trap distances are null: the PSR map (PGDA-90) covers 80-90°S only.")
        doc = {
            "binDeg": 0.5, "bins": N_AZ,
            "mask": b64(r.mask_deg.astype("<f4")), "maskP05": None, "maskP95": None,
            "maskSigma": b64(r.sigma_deg.astype("<f4")),
            "distAtMaxKm": b64(r.dist_at_max_km.astype("<f4")),
            "errorMarginDeg": err_margin, "observerHeightM": DZ_M, "rayLengthKm": RAY_KM, "demProducts": products,
            "regime": regime, "siteHeightM": round(r.h_obs_m, 1),
            "slope100mDeg": slope, "slope100mErrDeg": slope_err, "roughness100mM": rough,
            "nearestPsrKm": npsr, "nearestColdTrapPsrKm": ncold, "insidePsr": inside,
            "litFractionCheck": None, "sources": srcs, "computedAt": stamp, "pipelineVersion": PIPELINE_VERSION, "notes": notes,
        }
        write_doc(f"sites/{sid}/terrain", "v1", doc)
        s["terrainSummary"] = {"hasMask": True, "slope100mDeg": slope, "nearestPsrKm": npsr, "nearestColdTrapKm": ncold, "insidePsr": inside}
        write_doc("sites", sid, s)
        done += 1
        log(f"  {sid:34s} {regime:10s} mask {np.min(r.mask_deg):6.2f}..{np.max(r.mask_deg):5.2f}°  ±{err_margin:.2f}°  slope {slope}  psr {npsr}")
    log(f"30_site_terrain: {done} masks written; skipped {skipped}")


if __name__ == "__main__":
    main()
