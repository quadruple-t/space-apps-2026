#!/usr/bin/env python3
"""Stage 40: PSR layer, cold-trap fractions and PSR protection zones.

Inputs (PGDA product 90, Barker et al. 2023): LPSR_80S_20MPP_ADJ_1km2.SHP (1,531 PSRs > 1 km2) and
LPSR_80S_20MPP_ADJ.SHP (all 506,349 PSRs). Diviner PRP south (Paige et al. 2010): per-triangle
annual maximum temperature temp_max; rows with tri_clat < -80 are kept.

Outputs:
  psrLayer/south-1km2 (or quadrant tiles if > 500 KB): PSRs > 1 km2, simplified (tolerance recorded),
      int32 stereographic metres, delta-coded rings; index (byte offset, area x100, coldTrapFraction x1000)
  protectionZones/psr-*.json: named large PSRs as kind "psr-ice", ruleId "psr-buffer-by-analogy"
  .cache/psr_index.npz + .cache/psr_full.wkb.npy: every PSR >= 5 pixels (2,000 m2) with a cold-trap flag,
      used by 30_site_terrain.py and 31_terrain_grid.py for nearest-PSR / nearest-cold-trap distances.

Cold trap = annual maximum temperature below 110 K (Li et al. 2018; Fisher et al. 2017). A PSR > 1 km2
is a cold trap when its coldTrapFraction >= 0.5 (area fraction sampled on a 100 m lattice, each point
taking the temp_max of the nearest Diviner triangle centre). Smaller PSRs use the temp_max at their
representative point. Never call a PSR "ice-bearing".
"""
import sys

import numpy as np
import shapefile
import shapely
from scipy.spatial import cKDTree
from shapely.geometry import Polygon, MultiPolygon

from pipeline.common import CACHE, SEED, b64, cached, log, now_iso, ref, write_doc
from pipeline.geo import ll_to_xy, xy_to_ll

MIN_AREA_KM2 = 0.002          # 5 pixels at 20 m (Barker 2023 false-positive guidance)
COLD_K = 110.0
SIMPLIFY_M = 50.0
ZONE_SIMPLIFY_M = 150.0
LATTICE_M = 100.0
MAX_DOC_BYTES = 480_000
BUFFER = {"defaultKm": 2.0, "secondaryRingKm": 1.5,
          "label": "NASA 2011 heritage landing stand-off, applied by analogy (not a PSR-protection standard)"}


def read_polys(rel_shp):
    r = shapefile.Reader(str(cached(rel_shp)))
    fields = [f[0].lower() for f in r.fields[1:]]
    polys, recs = [], []
    for sr in r.iterShapeRecords():
        pts, parts = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
        rings = [pts[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]
        # Shapefile convention: outer rings clockwise, holes counter-clockwise.
        outers, holes = [], []
        for ring in rings:
            if len(ring) < 4:
                continue
            (outers if shapely.LinearRing(ring).is_ccw is False else holes).append(ring)
        if not outers:
            outers, holes = holes[:1], holes[1:]
        shells = [Polygon(o) for o in outers]
        geoms = []
        for s in shells:
            hs = [h for h in holes if s.contains(shapely.Point(h[0]))]
            geoms.append(Polygon(s.exterior.coords, hs))
        g = geoms[0] if len(geoms) == 1 else MultiPolygon(geoms)
        if not g.is_valid:
            g = shapely.make_valid(g)
        polys.append(g)
        recs.append(dict(zip(fields, sr.record)))
    return polys, recs


def load_diviner():
    cp = CACHE / "diviner_south80.npz"
    if cp.exists():
        z = np.load(cp)
        return z["x"], z["y"], z["tmax"]
    path = cached("diviner/dlre_prp_south.tab")
    lons, lats, tmax = [], [], []
    with open(path) as f:
        for line in f:
            p = line.split()
            if len(p) < 15:
                continue
            la = float(p[10])
            if la < -80.0:
                lons.append(float(p[9])); lats.append(la); tmax.append(float(p[13]))
    x, y = ll_to_xy(np.array(lats), np.array(lons))
    tmax = np.array(tmax, dtype=np.float32)
    np.savez_compressed(cp, x=x.astype(np.float32), y=y.astype(np.float32), tmax=tmax)
    log(f"  Diviner: kept {len(tmax):,} triangles with tri_clat < -80")
    return x, y, tmax


def cold_fraction(poly, tree, tmax):
    xmin, ymin, xmax, ymax = poly.bounds
    step = LATTICE_M
    area = poly.area
    if area / step ** 2 > 40000:  # very large PSR: coarsen the lattice
        step = np.sqrt(area / 40000)
    xs = np.arange(xmin + step / 2, xmax, step)
    ys = np.arange(ymin + step / 2, ymax, step)
    gx, gy = np.meshgrid(xs, ys)
    inside = shapely.contains_xy(poly, gx.ravel(), gy.ravel())
    px, py = gx.ravel()[inside], gy.ravel()[inside]
    if len(px) < 10:
        rp = poly.representative_point()
        px, py = np.array([rp.x]), np.array([rp.y])
    dist, idx = tree.query(np.column_stack([px, py]))
    ok = dist < 1500.0
    if not ok.any():
        return None
    return float(np.mean(tmax[idx[ok]] < COLD_K))


def encode_polys(polys):
    """int32 stream: per polygon nRings, then per ring nPoints, x0, y0, (dx, dy)*(n-1)."""
    out, offsets = [], []
    pos = 0
    for g in polys:
        parts = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
        rings = []
        for p in parts:
            rings.append(np.asarray(p.exterior.coords)[:-1])
            rings += [np.asarray(h.coords)[:-1] for h in p.interiors]
        rings = [r for r in rings if len(r) >= 3]
        buf = [len(rings)]
        for r in rings:
            q = np.round(r).astype(np.int64)
            d = np.diff(q, axis=0)
            buf += [len(q), int(q[0, 0]), int(q[0, 1])] + d.ravel().tolist()
        offsets.append(pos)
        pos += 4 * len(buf)
        out += buf
    return np.array(out, dtype="<i4"), offsets


def main():
    t0 = now_iso()
    log("40_psr: reading 1 km2 PSRs")
    big, big_rec = read_polys("pgda90/LPSR_80S_20MPP_ADJ_1km2.SHP")
    log(f"  {len(big)} PSRs > 1 km2")
    dx, dy, dt = load_diviner()
    tree = cKDTree(np.column_stack([dx, dy]))

    areas = np.array([float(r.get("area_km2") or g.area / 1e6) for g, r in zip(big, big_rec)])
    fracs = [cold_fraction(g, tree, dt) for g in big]
    names = [str(r.get("name") or "").strip() for r in big_rec]

    # --- full PSR set for distances --------------------------------------------------------------
    log("40_psr: reading all PSRs (this is the 154 MB shapefile)")
    allp, allr = read_polys("pgda90/LPSR_80S_20MPP_ADJ.SHP")
    a_all = np.array([float(r.get("area_km2") or g.area / 1e6) for g, r in zip(allp, allr)])
    keep = a_all >= MIN_AREA_KM2
    allp = [g for g, k in zip(allp, keep) if k]
    a_all = a_all[keep]
    rp = shapely.point_on_surface(np.array(allp, dtype=object))
    rx, ry = shapely.get_x(rp), shapely.get_y(rp)
    d_rp, i_rp = tree.query(np.column_stack([rx, ry]))
    cold_small = (dt[i_rp] < COLD_K) & (d_rp < 1500.0)
    # PSRs > 1 km2 use their area fraction instead of a single point.
    big_tree = shapely.STRtree(big)
    cold = cold_small.copy()
    for j, g in enumerate(allp):
        if a_all[j] > 1.0:
            hit = big_tree.query(g.representative_point(), predicate="intersects")
            if len(hit):
                f = fracs[int(hit[0])]
                cold[j] = f is not None and f >= 0.5
    np.save(CACHE / "psr_full.wkb.npy", np.array(shapely.to_wkb(np.array(allp, dtype=object)), dtype=object), allow_pickle=True)
    np.savez_compressed(CACHE / "psr_index.npz", area_km2=a_all, cold=cold, min_area_km2=MIN_AREA_KM2, cold_k=COLD_K)
    log(f"  {len(allp):,} PSRs >= {MIN_AREA_KM2} km2 kept for distances; {int(cold.sum()):,} flagged cold trap")

    # --- psrLayer document(s) --------------------------------------------------------------------
    for p in (SEED / "psrLayer").glob("*.json"):
        p.unlink()
    tol = SIMPLIFY_M
    simp = [shapely.simplify(g, tol, preserve_topology=True) for g in big]
    stream, offsets = encode_polys(simp)
    sources = [ref("pgda90"), ref("divinerPrp"), ref("li2018"), ref("fisher2017")]
    encoding = "int32 little-endian, south polar stereographic metres (sphere 1737400 m); per polygon: nRings, then per ring nPoints, x0, y0, (dx, dy) x (nPoints-1). index: int32 triples (byteOffset, round(areaKm2*100), round(coldTrapFraction*1000) or -1)."

    def doc_for(sel, doc_id):
        st, offs = encode_polys([simp[i] for i in sel])
        idx = np.array([[offs[k], int(round(areas[i] * 100)), -1 if fracs[i] is None else int(round(fracs[i] * 1000))]
                        for k, i in enumerate(sel)], dtype="<i4").ravel()
        nm = [{"i": k, "name": names[i]} for k, i in enumerate(sel) if names[i]]
        return {"count": len(sel), "encoding": encoding, "polygons": b64(st), "index": b64(idx), "names": nm,
                "simplifyToleranceM": tol, "minAreaKm2": 1.0, "coldTrapThresholdK": COLD_K,
                "coldTrapNote": "coldTrapFraction = area fraction with Diviner annual maximum temperature below 110 K. A cold trap is not detected ice: Li et al. (2018) found surface ice exposures in only about 3.5% of cold traps.",
                "sources": sources, "computedAt": t0}, st.nbytes + len(idx) * 4

    allsel = list(range(len(big)))
    d, size = doc_for(allsel, "south-1km2")
    if size < MAX_DOC_BYTES:
        write_doc("psrLayer", "south-1km2", d)
        log(f"  psrLayer/south-1km2: {len(big)} polygons, {size/1e3:.0f} KB binary, tolerance {tol} m")
    else:
        cx = np.array([g.centroid.x for g in big]); cy = np.array([g.centroid.y for g in big])
        quads = {"q1": (cx >= 0) & (cy >= 0), "q2": (cx < 0) & (cy >= 0), "q3": (cx < 0) & (cy < 0), "q4": (cx >= 0) & (cy < 0)}
        for q, m in quads.items():
            sel = list(np.nonzero(m)[0])
            d, size = doc_for(sel, f"south-1km2-{q}")
            if size >= MAX_DOC_BYTES:
                sys.exit(f"psrLayer quadrant {q} still {size} bytes; raise SIMPLIFY_M")
            d["tile"] = q
            write_doc("psrLayer", f"south-1km2-{q}", d)
            log(f"  psrLayer/south-1km2-{q}: {len(sel)} polygons, {size/1e3:.0f} KB")

    # --- named PSR protection zones -------------------------------------------------------------
    for p in (SEED / "protectionZones").glob("psr-*.json"):
        p.unlink()
    nz = 0
    for i, g in enumerate(big):
        if not names[i]:
            continue
        zg = shapely.simplify(g, ZONE_SIMPLIFY_M, preserve_topology=True)
        parts = list(zg.geoms) if isinstance(zg, MultiPolygon) else [zg]
        main_part = max(parts, key=lambda p: p.area)
        ex = np.asarray(main_part.exterior.coords)
        lat, lon = xy_to_ll(ex[:, 0], ex[:, 1])
        slug = "".join(ch if ch.isalnum() else "-" for ch in names[i].lower()).strip("-")
        write_doc("protectionZones", f"psr-{slug}-{i}", {
            "kind": "psr-ice", "ruleId": "psr-buffer-by-analogy", "name": f"{names[i]} PSR",
            "siteId": None,
            "geometry": {"type": "Polygon", "rings": [{"points": [{"latDeg": round(float(a), 6), "lonDeg": round(float(b), 6)} for a, b in zip(lat, lon)]}]},
            "rationale": "Permanently shadowed region (PGDA product 90). No published distance supports a PSR buffer; NASA OTPS (2022) says no distance can eliminate ejecta impacts entirely. The stand-off is a user parameter defaulting to 2.0 km, the NASA 2011 heritage landing stand-off applied by analogy, with the 1.5 km Apollo rock-ejecta range as a secondary ring. Neither is a PSR-protection standard. Cold-trap fraction: Diviner annual maximum below 110 K; a cold trap is not detected ice.",
            "sources": [ref("pgda90"), ref("divinerPrp"), ref("nasa2011Heritage"), ref("nasaOtps2022")],
            "needsData": False, "buffer": BUFFER, "areaKm2": round(float(areas[i]), 3),
            "coldTrapFraction": None if fracs[i] is None else round(fracs[i], 3),
            "geometryNote": f"Largest part of the PSR outline, simplified to {ZONE_SIMPLIFY_M:g} m. Full outlines are in psrLayer.",
        })
        nz += 1
    log(f"40_psr: {nz} named PSR zones; cold-trap fraction computed for {sum(f is not None for f in fracs)}/{len(big)} PSRs > 1 km2")


if __name__ == "__main__":
    main()
