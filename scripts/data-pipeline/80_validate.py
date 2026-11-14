#!/usr/bin/env python3
"""Stage 80: recompute validation checks, cross-check lit fractions, validate the seed, write the size report.

1. validationChecks: computed / deltaDeg / status / computedBy are written ONLY here, using the same client
   math as lib/ephemeris on the stored hourly series (LROC site coordinates, ALSJ times).
2. Lit-fraction cross-check (prompt §5.3): for catalog points poleward of 88°S, the share of hourly steps
   (15 Feb 2010 - 5 Feb 2011, the LROC WAC year) with the Sun's centre above the site horizon mask, vs the
   LROC WAC PCT map (float32 IMG, percent) at the site pixel. Report-only (no pass/fail tolerance).
3. Seed validation: enums, weights sum to 1, chapter-tool order, <= 500 KB per document (Firestore storage-size
   formula), every stored scientific number has a source or basis, no protected collections.
4. Writes catalog/meta and docs/DATA_SIZE_REPORT.md.
Exits non-zero if any check fails.
"""
import base64
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

from pipeline.common import CACHE, DOCS, PIPELINE_VERSION, SEED, curated, git_sha, log, now_iso, read_json, ref, write_doc
from pipeline.ephem import Series, azel_from_cart
from pipeline.geo import ll_to_xy, sph_to_cart, topo_azel

errors: list[str] = []
SPARK = {"storedGiB": 1, "readsPerDay": 50_000, "writesPerDay": 20_000, "egressGiBMonth": 10}
MAX_DOC = 500_000


def err(m):
    errors.append(m)


# ------------------------------------------------------------------ Firestore size estimate
def vsize(v):
    if v is None or isinstance(v, bool):
        return 1
    if isinstance(v, (int, float)):
        return 8
    if isinstance(v, str):
        return len(v.encode()) + 1
    if isinstance(v, list):
        return sum(vsize(x) for x in v)
    if isinstance(v, dict):
        if set(v) == {"$bytes"}:
            return (len(v["$bytes"]) * 3) // 4
        return sum(len(k.encode()) + 1 + vsize(x) for k, x in v.items())
    raise TypeError(type(v))


def doc_size(path_segments, data):
    return 32 + sum(len(s.encode()) + 1 for s in path_segments) + vsize(data)


def walk_docs():
    for p in sorted(SEED.rglob("*.json")):
        rel = p.relative_to(SEED)
        if rel.parts[0] in ("_reports", "fixtures"):
            continue
        yield rel, read_json(p)


# ------------------------------------------------------------------ validation checks
def compute_checks():
    cur = curated("validation.json")
    alsj = cur["alsjSiteCoords"]
    sha = git_sha()
    by = f"pipeline 80_validate.py @ {sha}"
    out, rows = [], []
    for c in cur["checks"]:
        site = read_json(SEED / "sites" / f"{c['siteId']}.json")
        lat, lon = site["coordinates"]["latDeg"], site["coordinates"]["lonDeg"]
        chunk = f"hist-{c['siteId']}"
        ser = Series([chunk])
        t = dt.datetime.fromisoformat(c["time"].replace("Z", "+00:00"))
        sun, _ = ser.at(t)
        az, el = azel_from_cart(lat, lon, sun)
        az, el = float(az[0]), float(el[0])
        la, lo = alsj[c["siteId"]]
        az2, el2 = azel_from_cart(la, lo, sun)
        doc = read_json(SEED / "validationChecks" / f"{c['id']}.json")
        q = c["quantity"]
        computed = el if q == "sun-elevation-deg" else az
        alt = float(el2[0] if q == "sun-elevation-deg" else az2[0])
        note_extra = f" With the ALSJ table's older site coordinates ({la}, {lo}) the pipeline gives {alt:.3f}° ({alt-computed:+.3f}° from the LROC-coordinate value)."
        if c.get("range"):
            lo_r, hi_r = c["range"]["min"], c["range"]["max"]
            status = "pass" if lo_r <= computed <= hi_r else "fail"
            doc.update({"computed": round(computed, 3), "deltaDeg": None, "status": status})
            doc["note"] = f"Computed Sun elevation {computed:.3f}° is {'inside' if status == 'pass' else 'outside'} the NASA SP-4029 acceptable range {lo_r}°-{hi_r}° (planned value 10.8°)."
        else:
            delta = computed - c["historical"]
            status = "pass" if abs(delta) <= c["toleranceDeg"] else "fail"
            doc.update({"computed": round(computed, 3), "deltaDeg": round(delta, 3), "status": status})
            base = (c.get("note") or "").strip()
            doc["note"] = (f"Computed {computed:.3f}° vs ALSJ computed reconstruction {c['historical']}°: delta {delta:+.3f}° (tolerance ±{c['toleranceDeg']}°). "
                           "The historical value is a reconstruction, not an in-situ measurement." + note_extra + (" " + base if base else ""))
        doc["computedBy"] = by
        if status == "fail":
            err(f"{c['id']}: FAIL computed {computed} vs {c['historical']}")
        write_doc("validationChecks", c["id"], doc)
        rows.append({"id": c["id"], "site": c["siteId"], "time": c["time"], "quantity": q, "computed": doc["computed"],
                     "historical": c["historical"], "delta": doc["deltaDeg"], "status": status})
        out.append(doc)
    return rows


def lit_fractions():
    cur = curated("validation.json")["litFraction"]
    win = cur["window"]
    z = np.load(CACHE / "ephem-wac-2010.npz")
    data = z["data"]  # sunLat, sunLon, r, earthLat, earthLon, delta
    raw = np.fromfile(CACHE / "lroc/WAC_POLE_ILL_PCT_SOUTH_100M.IMG", dtype="<f4")[-1214 * 1214:].reshape(1214, 1214)
    raw = np.where(raw < -1e30, np.nan, raw)
    rows = []
    for p in sorted((SEED / "sites").glob("*.json")):
        s = read_json(p)
        pt = s.get("coordinates") or s.get("representativePoint")
        if not pt or pt["latDeg"] > -88.0:
            continue
        tp = SEED / "sites" / p.stem / "terrain" / "v1.json"
        if not tp.exists():
            continue
        terr = read_json(tp)
        mask = np.frombuffer(base64.b64decode(terr["mask"]["$bytes"]), dtype="<f4").astype(float)
        az, el = topo_azel(pt["latDeg"], pt["lonDeg"], data[:, 0], data[:, 1], data[:, 2])
        m = mask[(np.round(az / terr["binDeg"]).astype(int)) % len(mask)]
        # linear interpolation of the mask between bins
        x = az / terr["binDeg"]; i0 = np.floor(x).astype(int) % len(mask); f = x - np.floor(x)
        m = mask[i0] * (1 - f) + mask[(i0 + 1) % len(mask)] * f
        lit = float(np.mean(el > m))
        x_, y_ = ll_to_xy(pt["latDeg"], pt["lonDeg"])
        col = int(np.floor((float(x_) + 60700) / 100)); row = int(np.floor((60700 - float(y_)) / 100))
        wac = float(raw[row, col]) / 100.0
        nb = raw[row - 2:row + 3, col - 2:col + 3] / 100.0
        rows.append({"site": p.stem, "name": s["name"], "lat": pt["latDeg"], "lon": pt["lonDeg"], "computed": lit, "wac": wac,
                     "wacNeighbourhoodMin": float(np.nanmin(nb)), "wacNeighbourhoodMax": float(np.nanmax(nb)), "approx": bool(s.get("representativePoint"))})
        window = {"start": win["start"], "end": win["end"], "stepMinutes": win["stepMinutes"]}
        terr["litFractionCheck"] = {"computed": round(lit, 4), "lrocWac": round(wac, 4), "window": window}
        write_doc(f"sites/{p.stem}/terrain", "v1", terr)
        cid = f"val-lit-fraction-{p.stem}"
        write_doc("validationChecks", cid, {
            "siteId": p.stem, "time": f"{win['start']}/{win['end']}", "quantity": "lit-fraction",
            "computed": round(lit, 4), "computedBy": f"pipeline 80_validate.py @ {git_sha()}",
            "historical": round(wac, 4), "historicalKind": "measured", "historicalSource": ref("wacIll"),
            "toleranceDeg": None, "deltaDeg": None, "status": "pending", "range": None,
            "note": (f"Report only (no pass/fail tolerance). Fraction of hourly steps with the Sun centre above the horizon mask ({lit*100:.1f}%) vs the LROC WAC "
                     f"percentage-of-observations map at the site pixel ({wac*100:.1f}%; 5x5-pixel range {np.nanmin(nb)*100:.1f}-{np.nanmax(nb)*100:.1f}%). "
                     "The WAC map is observed, 100 m, surface level (observer height 0), and its binary threshold is conservative; the mask uses a 1 m observer and a point-source Sun. "
                     "Expect agreement within tens of percent only." + (" The site is an approximate Artemis region reference point." if s.get("representativePoint") else "")),
        })
    return rows


def grid_lit_crosscheck():
    """Aggregate lit-fraction check over every grid cell poleward of 88°S (2 km cells, g2 tiles):
    Sun-centre-above-mask fraction over the WAC year vs the LROC WAC percentage map at the cell's pixel."""
    from pipeline.geo import xy_to_ll
    z = np.load(CACHE / "ephem-wac-2010.npz")["data"]
    raw = np.fromfile(CACHE / "lroc/WAC_POLE_ILL_PCT_SOUTH_100M.IMG", dtype="<f4")[-1214 * 1214:].reshape(1214, 1214)
    raw = np.where(raw < -1e30, np.nan, raw) / 100.0
    rho88 = 2 * 1737400.0 * np.tan(np.radians(2.0) / 2)
    comp, wac, names = [], [], []
    for p in sorted((SEED / "terrainGrid").glob("g2_*.json")):
        d = read_json(p)
        sp = d["gridSpacingKm"] * 1000
        masks = np.frombuffer(base64.b64decode(d["masks"]["$bytes"]), dtype="<i2").reshape(256, d["bins"]).astype(float) / 100.0
        for k in range(256):
            if masks[k, 0] == -327.68:
                continue
            ix, iy = k % 16, k // 16
            x = d["tileOriginXY"]["xM"] + ix * sp; y = d["tileOriginXY"]["yM"] + iy * sp
            if np.hypot(x, y) > rho88 - 300:
                continue
            col = int(np.floor((x + 60700) / 100)); row = int(np.floor((60700 - y) / 100))
            w = raw[row, col]
            if not np.isfinite(w):
                continue
            lat, lon = xy_to_ll(np.array([x]), np.array([y]))
            az, el = topo_azel(float(lat[0]), float(lon[0]), z[:, 0], z[:, 1], z[:, 2])
            xx = az / d["binDeg"]; i0 = np.floor(xx).astype(int) % d["bins"]; f = xx - np.floor(xx)
            m = masks[k, i0] * (1 - f) + masks[k, (i0 + 1) % d["bins"]] * f
            comp.append(float(np.mean(el > m))); wac.append(float(w))
    comp, wac = np.array(comp), np.array(wac)
    diff = comp - wac
    out = {"nCells": int(len(comp)), "correlation": float(np.corrcoef(comp, wac)[0, 1]), "meanAbsDiff": float(np.mean(np.abs(diff))),
           "meanDiff": float(np.mean(diff)), "medianAbsDiff": float(np.median(np.abs(diff))), "p95AbsDiff": float(np.percentile(np.abs(diff), 95)),
           "meanComputed": float(comp.mean()), "meanWac": float(wac.mean()), "fracWithin0p1": float(np.mean(np.abs(diff) <= 0.1)),
           "note": "2 km grid cells with centre poleward of 88°S (minus a 300 m edge margin); WAC value at the cell's 100 m pixel; computed uses a 1 m observer and a point-source Sun."}
    return out


# ------------------------------------------------------------------ seed validation
FAMILY = {"apollo", "surveyor", "luna", "change", "chandrayaan", "slim", "clps", "commercial", "artemis-candidate", "custom"}
KIND = {"landing", "impact", "rover-final", "region-reference"}
OUTCOME = {"success", "partial", "failure", "planned", "n/a"}
CHAPTERS = {"ch1-first-landing": "horizon-dial", "ch2-robotic-explorer": "power-simulator", "ch3-lunar-base": "base-scoring"}
PROFILES = {"short-landing", "robotic-14-day", "long-term-base"}
RULES = {"nasa2011-dl-boundary", "nasa2011-artifact-boundary", "nasa2011-impact-boundary", "psr-buffer-by-analogy"}


def validate_seed():
    sizes, counts, per_coll = {}, {}, {}
    sites = set()
    for rel, d in walk_docs():
        parts = list(rel.parts)
        parts[-1] = parts[-1][:-5]
        coll = parts[0] if len(parts) == 2 else f"{parts[0]}/{parts[2]}"
        sz = doc_size(parts, d)
        sizes[tuple(parts)] = sz
        counts[coll] = counts.get(coll, 0) + 1
        per_coll.setdefault(coll, []).append(sz)
        if sz > MAX_DOC:
            err(f"{'/'.join(parts)}: {sz} bytes > {MAX_DOC}")
        if parts[0] == "users":
            err("seed contains users/*")
        if coll == "sites":
            sites.add(parts[1])
            for k, e in (("family", FAMILY), ("siteKind", KIND), ("outcome", OUTCOME)):
                if d[k] not in e:
                    err(f"site {parts[1]}: bad {k}")
            if not d.get("sources"):
                err(f"site {parts[1]}: no sources")
            if d["coordinates"] is None and d["representativePoint"] is None:
                err(f"site {parts[1]}: no coordinates or representative point")
            if d["coordinates"] and not d["coordsVerified"] and d["coordsFrame"] != "unknown":
                err(f"site {parts[1]}: unverified coordinates must have coordsFrame 'unknown'")
        if coll == "missionProfiles":
            if abs(sum(d["weights"].values()) - 1) > 1e-3:
                err(f"profile {parts[1]}: weights sum {sum(d['weights'].values())}")
        if coll == "storyChapters" and CHAPTERS.get(parts[1]) != d["unlocksTool"]:
            err(f"chapter {parts[1]}: wrong tool")
        if coll == "protectionZones":
            if d["ruleId"] not in RULES:
                err(f"zone {parts[1]}: bad ruleId")
            if not d.get("sources"):
                err(f"zone {parts[1]}: no sources")
        if coll == "landerPresets":
            for k, f in d["fields"].items():
                if f["value"] is not None and f["basis"] not in ("sourced", "derived", "assumption"):
                    err(f"preset {parts[1]}.{k}: value without basis")
                if f["value"] is not None and f["basis"] != "assumption" and f["sourceIdx"] is None:
                    err(f"preset {parts[1]}.{k}: value without source")
        if coll == "facts":
            for r in d["rows"]:
                if not r.get("source", {}).get("url"):
                    err(f"fact {parts[1]} row '{r['label']}': no source url")
        if coll == "sites/terrain":
            for k in ("mask", "distAtMaxKm"):
                n = len(base64.b64decode(d[k]["$bytes"])) // 4
                if n != 720:
                    err(f"{'/'.join(parts)}: {k} has {n} values")
            if not d.get("sources"):
                err(f"{'/'.join(parts)}: no sources")
    cs = read_json(SEED / "catalog" / "siteIndex.json")
    if {s["id"] for s in cs["sites"]} != sites:
        err("catalog/siteIndex does not match sites")
    for rel, d in walk_docs():
        if rel.parts[0] == "storyChapters":
            for sid in d["featuredSiteIds"]:
                if sid not in sites:
                    err(f"{rel}: featured site {sid} missing")
    return sizes, counts, per_coll


# ------------------------------------------------------------------ reports
def kib(b):
    return f"{b/1024:,.1f} KiB" if b < 1024 * 1024 else f"{b/1048576:,.2f} MiB"


def write_size_report(counts, per_coll, checks, lits, grid_lit):
    n_docs = sum(counts.values())
    total = sum(sum(v) for v in per_coll.values())
    biggest = max((s, c) for c, v in per_coll.items() for s in v)
    L = ["# Data size and Firestore quota report", "",
         f"Generated by `scripts/data-pipeline/80_validate.py` on {now_iso()} (pipeline {PIPELINE_VERSION}, git {git_sha()}). "
         "Sizes use the Firestore storage-size formula (document name + 32 bytes + field names + values; Bytes = decoded length).", "",
         "## Per collection", "", "| Collection | Docs | Total | Largest doc | Limit check (<= 500 KB) |", "|---|---:|---:|---:|---|"]
    for c in sorted(per_coll):
        v = per_coll[c]
        L.append(f"| `{c}` | {len(v)} | {kib(sum(v))} | {kib(max(v))} | {'ok' if max(v) <= MAX_DOC else '**OVER**'} |")
    L += [f"| **Total** | **{n_docs}** | **{kib(total)}** | {kib(biggest[0])} | |", "",
          f"Total stored data is **{kib(total)}**, {total/ (SPARK['storedGiB']*2**30)*100:.2f}% of the 1 GiB Spark limit (index entries and metadata add a little). "
          f"A full seed is {n_docs} writes, so about {SPARK['writesPerDay']//n_docs} full re-seeds fit in the 20,000 writes/day Spark quota.", "",
          "Spark (no-cost) limits, Firestore quotas page updated 2026-11-12: 1 GiB stored, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 10 GiB/month egress, one free database.", "",
          "## Cold Mission Control session (computed from this seed)", ""]
    def sz(coll_prefix):
        return sum(per_coll.get(coll_prefix, [0]))
    eph = per_coll["ephemerisGlobal"]
    month = float(np.mean([s for s in eph if s < 60_000])) if eph else 0
    psr = per_coll.get("psrLayer", [])
    zones = per_coll.get("protectionZones", [])
    terr = per_coll.get("sites/terrain", [0])
    grid = per_coll.get("terrainGrid", [0])
    rows = [("catalog/siteIndex + catalog/meta", 2, sz("catalog")),
            ("missionProfiles", counts.get("missionProfiles", 0), sz("missionProfiles")),
            ("landerPresets", counts.get("landerPresets", 0), sz("landerPresets")),
            ("protectionZones (all)", counts.get("protectionZones", 0), sz("protectionZones")),
            ("psrLayer (only when the zone overlay is on)", len(psr), sum(psr)),
            ("3 selected sites (doc + terrain/v1 each)", 6, int(3 * (np.mean(per_coll["sites"]) + np.mean(terr)))),
            ("ephemeris months: 14-day window (2 chunks)", 2, int(2 * month)),
            ("custom point: one terrainGrid tile", 1, int(np.mean(grid)))]
    L += ["| Item | Reads | Egress |", "|---|---:|---:|"] + [f"| {a} | {b} | {kib(c)} |" for a, b, c in rows]
    tr, te = sum(r[1] for r in rows), sum(r[2] for r in rows)
    yr = int(13 * month)
    L += [f"| **Total (14-day window)** | **{tr}** | **{kib(te)}** |", "",
          f"A year-long base profile reads 13 ephemeris months instead of 2 (+11 reads, +{kib(int(11*month))}). "
          f"At about {tr} reads per cold session, 50,000 reads/day supports **{SPARK['readsPerDay']//tr:,} cold sessions/day**. "
          f"Egress per cold session is about {kib(te)} (up to {kib(te + int(11*month))} for a year-long window), so 10 GiB/month allows roughly "
          f"{int(SPARK['egressGiBMonth']*2**30 / (te + int(11*month))):,}+ cold sessions. Repeat visits cost about 0 reads (persistent local cache).", "",
          "## Validation results", "", "| Check | Computed | Historical | Delta | Status |", "|---|---:|---:|---:|---|"]
    for r in checks:
        L.append(f"| `{r['id']}` | {r['computed']} | {r['historical'] if r['historical'] is not None else '5-14 range'} | {r['delta'] if r['delta'] is not None else ''} | {r['status']} |")
    L += ["", "## Lit-fraction cross-check vs LROC WAC (report only)", "", "| Site | Computed | WAC at pixel | WAC 5x5 range |", "|---|---:|---:|---|"]
    for r in lits:
        L.append(f"| {r['name']}{' (approx. region reference)' if r['approx'] else ''} | {r['computed']*100:.1f}% | {r['wac']*100:.1f}% | {r['wacNeighbourhoodMin']*100:.1f}-{r['wacNeighbourhoodMax']*100:.1f}% |")
    g = grid_lit
    L += ["", f"Grid-wide check ({g['nCells']:,} terrain-grid cells poleward of 88°S, 2 km spacing): correlation **{g['correlation']:.3f}**, "
          f"mean computed lit fraction {g['meanComputed']*100:.1f}% vs WAC {g['meanWac']*100:.1f}% (mean difference {g['meanDiff']*100:+.1f} points), "
          f"mean absolute difference {g['meanAbsDiff']*100:.1f} points, 95th percentile {g['p95AbsDiff']*100:.1f} points, "
          f"{g['fracWithin0p1']*100:.0f}% of cells within 10 points. {g['note']}"]
    (DOCS / "DATA_SIZE_REPORT.md").write_text("\n".join(L) + "\n")


BEGIN, END = "<!-- BEGIN GENERATED: pipeline source list -->", "<!-- END GENERATED: pipeline source list -->"


def write_sources_appendix():
    """Regenerate the pipeline source list at the end of docs/SOURCES.md from curated/refs.json + dataSources."""
    refs = {k: v for k, v in curated("refs.json").items() if not k.startswith("_")}
    ds = curated("dataSources.json")["sources"]
    L = [BEGIN, "", "## Datasets, papers and pages used by the Shadowline data pipeline", "",
         "Generated by `scripts/data-pipeline/80_validate.py` from `curated/dataSources.json` and `curated/refs.json`. "
         "Tier: A = agency or peer-reviewed, B = company or official mission document, C = secondary press. "
         "Retrieved 2026-11-14 unless noted; whole-file downloads (URL, bytes, sha256, Last-Modified) are in `scripts/data-pipeline/manifest.lock.json`.", "",
         "### Datasets", "", "| Dataset | Version | Citation / DOI | URL |", "|---|---|---|---|"]
    for d in ds:
        doi = f"doi:{d['doi']}" if d.get("doi") else ""
        cite = "; ".join(x for x in [d.get("citation") or "", doi, f"data doi:{d['dataDoi']}" if d.get("dataDoi") else ""] if x)
        L.append(f"| {d['label']} | {d.get('version') or ''} | {cite} | {d.get('url') or ''} |")
    L += ["", "### Every cited page, paper and document", "", "| Tier | Source | URL |", "|---|---|---|"]
    for k, r in sorted(refs.items(), key=lambda kv: (kv[1].get("tier", "Z"), kv[1]["label"])):
        L.append(f"| {r.get('tier', '')} | {r['label']} | {r.get('url') or ''} |")
    L += ["", END, ""]
    f = DOCS / "SOURCES.md"
    t = f.read_text()
    if BEGIN in t:
        t = t[:t.index(BEGIN)] + "\n".join(L) + t[t.index(END) + len(END):].lstrip("\n")
    else:
        t = t.rstrip("\n") + "\n\n---\n\n" + "\n".join(L)
    f.write_text(t)


def main():
    for p in ("sites", "ephemerisGlobal"):
        if not (SEED / p).exists():
            sys.exit(f"missing data/seed/{p}: run the earlier stages")
    checks = compute_checks()
    lits = lit_fractions()
    grid_lit = grid_lit_crosscheck()
    sizes, counts, per_coll = validate_seed()
    meta = {"datasetVersion": "2026-11-14", "generatedAt": now_iso(), "pipelineGitSha": git_sha(), "pipelineVersion": PIPELINE_VERSION,
            "counts": dict(sorted({**counts, "catalog": counts.get("catalog", 0) + 1}.items()))}
    write_doc("catalog", "meta", meta)
    sizes, counts, per_coll = validate_seed()  # include meta
    write_size_report(counts, per_coll, checks, lits, grid_lit)
    write_sources_appendix()
    (SEED / "_reports").mkdir(exist_ok=True)
    json.dump({"checks": checks, "litFractions": lits, "gridLitCrosscheck": grid_lit}, open(SEED / "_reports/validation.json", "w"), indent=1)
    for r in checks:
        log(f"  {r['id']:36s} computed {r['computed']}  hist {r['historical']}  Δ {r['delta']}  {r['status']}")
    for r in lits:
        log(f"  lit-fraction {r['name']:20s} computed {r['computed']*100:5.1f}%  WAC {r['wac']*100:5.1f}% (range {r['wacNeighbourhoodMin']*100:.1f}-{r['wacNeighbourhoodMax']*100:.1f})")
    log(f"  grid lit-fraction cross-check: n={grid_lit['nCells']} corr={grid_lit['correlation']:.3f} meanΔ={grid_lit['meanDiff']*100:+.1f} MAE={grid_lit['meanAbsDiff']*100:.1f} pts within10={grid_lit['fracWithin0p1']*100:.0f}%")
    log(f"80_validate: {sum(counts.values())} docs, max doc {max(max(v) for v in per_coll.values())/1024:.0f} KB; {len(errors)} errors")
    if errors:
        log("FAILED:\n  " + "\n  ".join(errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
