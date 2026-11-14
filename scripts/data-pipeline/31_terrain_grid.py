#!/usr/bin/env python3
"""Stage 31: south-polar custom-coordinate terrain grid -> terrainGrid/*.json (prompt §6.1, §7.2).

Grid (must match lib/terrain/grid.ts): cells centred on multiples of the spacing in south polar
stereographic metres. g2 = 2 km spacing, centre poleward of 84°S (~26,000 cells); g5 = 5 km spacing,
centre between 84°S and 80°S (~7,400 cells). Tiles are 16x16 cells; tile (ti, tj) holds global cells
gx in [16ti, 16ti+15], gy in [16tj, 16tj+15], cell index = iy*16 + ix. Only tiles containing at least
one valid cell are written; cells outside the regime are written as no-data (-32768).

Per cell: 360 azimuth bins at 1° (bin i centred on azimuth i), rays to 310 km, exact curvature,
observer 1 m above the DEM surface, mask = max elevation angle (centidegrees, int16), 1-sigma error
(uint8, 0.05° steps), plus slope at ~100 m, nearest PSR / cold-trap distance and inside-PSR flag.

COARSENING (recorded in METHODS.md): the near field uses the LOCAL 40 m PGDA-90 map (0-15 km), not the
20 m COG: 33,000 cells x 20 m windows are not practical over this link, and a 20 m local copy is 2.6 GB.
Mid field 80 m (15-100 km), far field 240 m (100-310 km). The 40 m product has no error raster, so the
80 m error raster is used for the near field (a conservative substitute: coarser maps have larger error).
Slope: least-squares plane over 3x3 pixels of the 40 m DEM (~120 m baseline, not exactly 100 m).
Resumable: per-tile results are cached in .cache/grid/.
"""
import argparse
import multiprocessing as mp
import sys
import time

import numpy as np
import shapely

from pipeline.common import CACHE, PIPELINE_VERSION, SEED, b64, clear_collection, log, now_iso, ref, write_doc
from pipeline.dem import StereoRaster
from pipeline.geo import R_M, scale_factor, xy_to_ll
from pipeline.raycast import Band, horizon_mask

CELLS = 16
BINS = 360
RAY_KM = 310.0
DZ_M = 1.0
RHO_84 = 2 * R_M * np.tan(np.radians(6) / 2)
RHO_80 = 2 * R_M * np.tan(np.radians(10) / 2)
REGIMES = {"g2": (2000.0, 0.0, RHO_84), "g5": (5000.0, RHO_84, RHO_80)}  # spacing, rho_min (excl), rho_max (incl)
GRID_CACHE = CACHE / "grid"
GRID_CACHE.mkdir(exist_ok=True)
NO_DATA = -32768

G: dict = {}


def init():
    G["d40"] = StereoRaster.from_file("pgda90/LDEM_80S_40MPP_ADJ.TIF")
    G["d80"] = StereoRaster.from_file("pgda90/LDEM_80S_80MPP_ADJ.TIF")
    G["e80"] = StereoRaster.from_file("pgda90/LDEM_80S_80MPP_ADJ_ERR.TIF")
    G["d240"] = StereoRaster.from_file("pgda90/LDEM_60S_240MPP_ADJ.TIF")
    G["e240"] = StereoRaster.from_file("pgda90/LDEM_60S_240MPP_ADJ_ERR.TIF")
    G["bands"] = [Band(0, 15, 0.04, [G["d40"], G["d80"], G["d240"]], [G["e80"]], "40 m"),
                  Band(15, 100, 0.08, [G["d80"], G["d240"]], [G["e80"], G["e240"]], "80 m"),
                  Band(100, RAY_KM, 0.24, [G["d240"]], [G["e240"]], "240 m")]
    z = np.load(CACHE / "psr_index.npz")
    geoms = shapely.from_wkb(np.load(CACHE / "psr_full.wkb.npy", allow_pickle=True))
    G["tree_all"] = shapely.STRtree(geoms)
    cold = geoms[z["cold"]]
    G["tree_cold"] = shapely.STRtree(cold)


def valid_cells(regime):
    sp, rmin, rmax = REGIMES[regime]
    n = int(np.ceil(rmax / sp)) + 1
    out = []
    for gx in range(-n, n + 1):
        for gy in range(-n, n + 1):
            r = np.hypot(gx * sp, gy * sp)
            if rmin < r <= rmax or (rmin == 0.0 and r <= rmax):
                out.append((gx, gy))
    return out


def slope_3x3(x, y):
    d = G["d40"]
    dx = d.dx
    offs = np.array([-1, 0, 1]) * dx
    gx, gy = np.meshgrid(offs, offs)
    h = np.stack([d.sample_xy(x + a, y + b) for a, b in zip(gx.ravel(), gy.ravel())])
    if np.isnan(h).any():
        return None
    A = np.column_stack([gx.ravel(), gy.ravel(), np.ones(9)])
    (a, b, _), *_ = np.linalg.lstsq(A, h.astype(np.float64), rcond=None)
    return float(np.degrees(np.arctan(np.hypot(a, b))))


def do_tile(args):
    regime, ti, tj = args
    sp = REGIMES[regime][0]
    tid = f"{regime}_{ti}_{tj}"
    cp = GRID_CACHE / f"{tid}.npz"
    if cp.exists():
        return tid, True
    cells = set(valid_cells_cached[regime])
    masks = np.full((CELLS * CELLS, BINS), NO_DATA, dtype=np.int16)
    errs = np.zeros((CELLS * CELLS, BINS), dtype=np.uint8)
    stats = np.zeros((CELLS * CELLS, 4), dtype=np.int64)  # slope cdeg, psr 10m, cold 10m, inside
    stats[:, 0] = NO_DATA
    stats[:, 1] = 65535
    stats[:, 2] = 65535
    for iy in range(CELLS):
        for ix in range(CELLS):
            gx, gy = ti * CELLS + ix, tj * CELLS + iy
            if (gx, gy) not in cells:
                continue
            x, y = gx * sp, gy * sp
            lat, lon = xy_to_ll(np.array([x]), np.array([y]))
            lat, lon = float(lat[0]), float(lon[0])
            try:
                r = horizon_mask(lat, lon, G["bands"], BINS, DZ_M)
            except ValueError:
                continue
            if np.isnan(r.mask_deg).any():
                continue
            k = iy * CELLS + ix
            masks[k] = np.clip(np.round(r.mask_deg * 100), -32767, 32767).astype(np.int16)
            errs[k] = np.clip(np.round(r.sigma_deg / 0.05), 0, 255).astype(np.uint8)
            s = slope_3x3(x, y)
            if s is not None:
                stats[k, 0] = int(round(s * 100))
            p = shapely.Point(x, y)
            sc = scale_factor(lat) * 1000.0 * 10.0
            i, d = G["tree_all"].query_nearest(p, return_distance=True)
            stats[k, 1] = min(65534, int(round(float(d[0]) / sc)))
            stats[k, 3] = 1 if d[0] == 0.0 else 0
            j, dc = G["tree_cold"].query_nearest(p, return_distance=True)
            if len(dc):
                stats[k, 2] = min(65534, int(round(float(dc[0]) / sc)))
    np.savez_compressed(cp, masks=masks, errs=errs, stats=stats)
    return tid, False


valid_cells_cached: dict = {}


def pack_stats(stats):
    out = bytearray()
    for s, p, c, ins in stats:
        out += int(s).to_bytes(2, "little", signed=True) + int(p).to_bytes(2, "little") + int(c).to_bytes(2, "little") + bytes([int(ins)])
    return bytes(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--procs", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0, help="process only N tiles (testing)")
    args = ap.parse_args()
    for r in REGIMES:
        valid_cells_cached[r] = valid_cells(r)
    tiles = []
    for r, cells in valid_cells_cached.items():
        ts = {(int(np.floor(gx / CELLS)), int(np.floor(gy / CELLS))) for gx, gy in cells}
        tiles += [(r, ti, tj) for ti, tj in sorted(ts)]
    log(f"31_terrain_grid: {sum(len(v) for v in valid_cells_cached.values()):,} cells in {len(tiles)} tiles")
    if args.limit:
        tiles = tiles[:args.limit]
    t0 = time.time()
    init()
    ctx = mp.get_context("fork")
    done = 0
    with ctx.Pool(args.procs) as pool:
        for tid, cached in pool.imap_unordered(do_tile, tiles):
            done += 1
            if done % 5 == 0 or done == len(tiles):
                el = time.time() - t0
                log(f"  {done}/{len(tiles)} tiles ({el/60:.1f} min elapsed, ETA {(el/done*(len(tiles)-done))/60:.1f} min)")

    stamp = now_iso()
    clear_collection("terrainGrid")
    n_cells = n_valid = 0
    for r, ti, tj in tiles:
        sp = REGIMES[r][0]
        z = np.load(GRID_CACHE / f"{r}_{ti}_{tj}.npz")
        masks, errs, stats = z["masks"], z["errs"], z["stats"]
        n_valid += int(np.sum(masks[:, 0] != NO_DATA))
        write_doc("terrainGrid", f"{r}_{ti}_{tj}", {
            "regime": r, "gridSpacingKm": sp / 1000.0,
            "tileOriginXY": {"xM": float(ti * CELLS * sp), "yM": float(tj * CELLS * sp)},
            "cellsPerSide": CELLS, "binDeg": 1, "bins": BINS,
            "masks": b64(masks.astype("<i2")), "maskErr": b64(errs.astype(np.uint8)), "cellStats": b64(pack_stats(stats)),
            "demProducts": ["PGDA-90 LDEM_80S_40MPP_ADJ (40 m, 0-15 km)", "PGDA-90 LDEM_80S_80MPP_ADJ (80 m, 15-100 km)", "PGDA-90 LDEM_60S_240MPP_ADJ (240 m, 100-310 km)"],
            "rayLengthKm": RAY_KM, "observerHeightM": DZ_M,
            "maskErrNote": "1-sigma, 0.05° steps; height error from the 80 m / 240 m PGDA-90 error rasters (40 m has no error raster)",
            "cellStatsLayout": "7 bytes per cell: int16 slope (centideg, -32768 = null), uint16 nearest PSR (10 m units, 65535 = null), uint16 nearest cold-trap PSR (10 m units), uint8 inside PSR",
            "slopeNote": "least-squares plane over 3x3 pixels of the 40 m DEM (~120 m baseline)",
            "sources": [ref("pgda90"), ref("divinerPrp")], "computedAt": stamp, "pipelineVersion": PIPELINE_VERSION,
        })
        n_cells += CELLS * CELLS
    log(f"31_terrain_grid: wrote {len(tiles)} tiles; {n_valid:,} cells with masks; runtime {(time.time()-t0)/60:.1f} min")
    (SEED / "_reports").mkdir(exist_ok=True)
    import json
    json.dump({"tiles": len(tiles), "cellsWithMasks": n_valid, "runtimeMin": round((time.time() - t0) / 60, 1), "procs": args.procs},
              open(SEED / "_reports/terrain-grid.json", "w"))


if __name__ == "__main__":
    main()
