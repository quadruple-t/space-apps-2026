#!/usr/bin/env python3
"""Stage 10: build sites/*.json and catalog/siteIndex.json from curated/sites.json.

Cross-checks every site that names an lrocObjectId against the LROC anthropogenic-objects
shapefile (last updated 2026-08-14). A verified site that differs from the shapefile by more
than 50 m fails the stage unless the curated row sets coordsFromShapefile (explicit override,
used where the shapefile gives more decimals: IM-1 and Chandrayaan-3, per prompt §5.1).
Elevation (m above the 1737.4 km sphere) and missing uncertainties come from the shapefile.
"""
import json
import sys

import shapefile  # pyshp

from pipeline.common import CACHE, SEED, clear_collection, curated, log, now_iso, ref, refs, write_doc
from pipeline.geo import R_M, gc_distance_km

ENUM_FAMILY = {"apollo", "surveyor", "luna", "change", "chandrayaan", "slim", "clps", "commercial", "artemis-candidate", "custom"}
ENUM_KIND = {"landing", "impact", "rover-final", "region-reference"}
ENUM_OUTCOME = {"success", "partial", "failure", "planned", "n/a"}
ENUM_PRECISION = {"second", "minute", "approx", "date", None}
ENUM_CHAPTER = {"ch1-first-landing", "ch2-robotic-explorer", "ch3-lunar-base", None}
MAX_MOVE_M = 50.0


def load_shapefile() -> dict:
    shp = CACHE / "lroc/anthropogenic/ANTHROPOGENIC_OBJECTS_180.SHP"
    if not shp.exists():
        raise SystemExit("LROC shapefile missing; run 00_fetch.py --only lroc")
    r = shapefile.Reader(str(shp))
    return {rec["OBJECT_ID"]: rec.as_dict() for rec in r.records()}


def main() -> None:
    cur = curated("sites.json")
    lroc = load_shapefile()
    clear_collection("sites")
    stamp = now_iso()
    index, report, errors = [], [], []

    for s in cur["sites"]:
        sid = s["id"]
        for field, enum in [("family", ENUM_FAMILY), ("siteKind", ENUM_KIND), ("outcome", ENUM_OUTCOME),
                            ("landingTimePrecision", ENUM_PRECISION), ("chapterId", ENUM_CHAPTER)]:
            if s.get(field) not in enum:
                errors.append(f"{sid}: bad {field}={s.get(field)!r}")
        coords = dict(s["coordinates"]) if s.get("coordinates") else None
        uncert = s.get("coordsUncertaintyM")
        notes = []
        src_keys = list(s["sources"])

        obj = lroc.get(s.get("lrocObjectId")) if s.get("lrocObjectId") else None
        if s.get("lrocObjectId") and obj is None:
            errors.append(f"{sid}: lrocObjectId {s['lrocObjectId']} not in shapefile")
        if obj and coords:
            d_m = float(gc_distance_km(coords["latDeg"], coords["lonDeg"], obj["LATITUDE"], obj["LONGITUDE"])) * 1000
            row = {"id": sid, "curated": [coords["latDeg"], coords["lonDeg"]], "shapefile": [obj["LATITUDE"], obj["LONGITUDE"]],
                   "deltaM": round(d_m, 1), "shapefileUncertM": obj.get("UNCERTAIN"), "action": "kept"}
            if s.get("coordsFromShapefile"):
                notes.append(f"Coordinates taken from the LROC anthropogenic shapefile (2026-08-14), which gives more decimals; "
                             f"previous value {coords['latDeg']}, {coords['lonDeg']} moved {d_m:.0f} m.")
                coords = {"latDeg": float(obj["LATITUDE"]), "lonDeg": float(obj["LONGITUDE"])}
                uncert = float(obj["UNCERTAIN"]) if obj.get("UNCERTAIN") is not None else uncert
                row["action"] = "replaced-by-shapefile"
            elif s["coordsVerified"] and d_m > MAX_MOVE_M:
                errors.append(f"{sid}: shapefile differs by {d_m:.0f} m (> {MAX_MOVE_M} m) with no override")
            if uncert is None and obj.get("UNCERTAIN") is not None:
                uncert = float(obj["UNCERTAIN"])
                notes.append("Coordinate uncertainty from the LROC anthropogenic shapefile (UNCERTAIN column).")
            if obj.get("RADIUS"):
                coords["elevationM"] = round(float(obj["RADIUS"]) - R_M, 1)
                notes.append(f"Elevation = shapefile RADIUS ({obj.get('RAD_SRC')}) minus 1,737,400 m.")
            if "lrocShapefile" not in src_keys:
                src_keys.append("lrocShapefile")
            report.append(row)

        cap = s.get("coordsAsPublished")
        doc = {
            "name": s["name"], "family": s["family"], "siteKind": s["siteKind"],
            "country": s["country"], "agency": s["agency"], "mission": s.get("mission"),
            "landingTimeUtc": s.get("landingTimeUtc"), "landingTimePrecision": s.get("landingTimePrecision"),
            "outcome": s["outcome"],
            "outcomeDetail": ({"summary": s["outcomeDetail"]["summary"], "causeClass": s["outcomeDetail"]["causeClass"],
                               "sources": refs(s["outcomeDetail"]["sources"])} if s.get("outcomeDetail") else None),
            "coordinates": coords,
            "latDeg": coords["latDeg"] if coords else None, "lonDeg": coords["lonDeg"] if coords else None,
            "coordsVerified": bool(s["coordsVerified"]), "coordsFrame": s["coordsFrame"], "coordsUncertaintyM": uncert,
            "coordsAsPublished": ({"latDeg": cap["latDeg"], "lonDeg": cap["lonDeg"], "source": ref(cap["source"], note=cap.get("note"))} if cap else None),
            "representativePoint": None,
            "chapterId": s.get("chapterId"), "blurb": s["blurb"], "sources": refs(src_keys),
            "terrainSummary": None, "notes": notes + ([s["timeNote"]] if s.get("timeNote") else []),
            "updatedAt": stamp,
        }
        write_doc("sites", sid, doc)
        index.append(_index_row(sid, doc, coords))

    ar = cur["artemisRegions"]
    for g in ar["regions"]:
        doc = {
            "name": g["name"], "family": "artemis-candidate", "siteKind": "region-reference",
            "country": "USA", "agency": "NASA", "mission": "Artemis IV (first crewed landing, planned early 2028)",
            "landingTimeUtc": None, "landingTimePrecision": None, "outcome": "planned", "outcomeDetail": None,
            "coordinates": None, "latDeg": None, "lonDeg": None,
            "coordsVerified": False, "coordsFrame": "MOON_ME", "coordsUncertaintyM": None, "coordsAsPublished": None,
            "representativePoint": {"latDeg": g["point"]["latDeg"], "lonDeg": g["point"]["lonDeg"], "method": g["method"],
                                    "sources": refs(g["sources"])},
            "chapterId": "ch3-lunar-base",
            "blurb": f"Artemis-era candidate region '{g['name']}' (one of nine NASA named on 28 Oct 2024). The point shown is an approximate region reference, not a NASA coordinate.",
            "sources": refs(ar["commonSources"] + g["sources"]),
            "terrainSummary": None,
            "notes": ["NASA has never published coordinates or boundaries for the candidate regions. Label every point 'approximate region reference'."],
            "updatedAt": stamp,
        }
        write_doc("sites", g["id"], doc)
        index.append(_index_row(g["id"], doc, g["point"], approx=True))

    if errors:
        log("10_sites FAILED:\n  " + "\n  ".join(errors))
        sys.exit(1)

    write_doc("catalog", "siteIndex", {"sites": index, "count": len(index), "updatedAt": stamp})
    (SEED / "_reports").mkdir(exist_ok=True)
    with open(SEED / "_reports/lroc-crosscheck.json", "w") as f:
        json.dump({"maxAllowedMoveM": MAX_MOVE_M, "rows": report, "noLandingCheck": cur.get("noLandingCheck")}, f, indent=1)
    log(f"10_sites: {len(index)} sites ({len(ar['regions'])} Artemis regions); "
        f"max shapefile delta (kept rows) {max([r['deltaM'] for r in report if r['action']=='kept'] or [0]):.1f} m")
    for r in report:
        if r["deltaM"] > 5:
            log(f"   {r['id']}: Δ {r['deltaM']} m ({r['action']})")


def _index_row(sid, doc, point, approx=False):
    return {"id": sid, "name": doc["name"], "family": doc["family"], "siteKind": doc["siteKind"], "country": doc["country"],
            "agency": doc["agency"], "outcome": doc["outcome"],
            "latDeg": point["latDeg"] if point else None, "lonDeg": point["lonDeg"] if point else None,
            "pointIsApproximate": approx, "coordsVerified": bool(doc["coordsVerified"]) and not approx, "landingTimeUtc": doc["landingTimeUtc"], "chapterId": doc["chapterId"]}


if __name__ == "__main__":
    main()
