#!/usr/bin/env python3
"""Stage 50: heritage protection zones (prompt §5.4) -> protectionZones/heritage-*.json.

Source: NASA (2011, Rev A), Recommendations to Space-Faring Entities (U.S. Government artifacts only).
  - 2.0 km descent/landing boundary (A1-3, A2-2) around every US Government lander site in the catalog
    (Apollo 11, 12, 14, 15, 16, 17; Surveyor 1, 3, 5, 6, 7).
  - Artifact boundaries: 75 m (Apollo 11, A3-1) and 225 m (Apollo 17, A3-2) from the LM descent stage;
    3 m from the descent stage at Apollo 12, 14, 15, 16 (A3-3).
  - 0.5 km impact-site boundary (A1-3) for Ranger and S-IVB impact sites (named in the 2011 document)
    and LCROSS (listed as an impact-site example in NASA OTPS 2022), using coordinates from the LROC
    anthropogenic-objects shapefile (2026-08-14). Only sites with a cited coordinate get a zone.
Non-US sites (Luna, Chang'e, SLIM, Chandrayaan) and commercial CLPS landers are heritage without a
NASA-2011 zone; the UI must say so. PSR zones are written by 40_psr.py.
"""
import shapefile

from pipeline.common import CACHE, SEED, log, read_json, ref, write_doc

DL_SITES = ["apollo-11-tranquility", "apollo-12-oceanus-procellarum", "apollo-14-fra-mauro", "apollo-15-hadley-apennine",
            "apollo-16-descartes", "apollo-17-taurus-littrow", "surveyor-1", "surveyor-3", "surveyor-5", "surveyor-6", "surveyor-7"]
ARTIFACT = {
    "apollo-11-tranquility": (0.075, "A3-1", "the exclusion zone extends 75 m from the lunar module descent stage; visits to any part of the site are prohibited"),
    "apollo-17-taurus-littrow": (0.225, "A3-2", "the exclusion zone extends 225 meters from the lunar module descent stage; visits to any part of the site are prohibited"),
    "apollo-12-oceanus-procellarum": (0.003, "A3-3", "Descent stage: 3 meters buffer; other hardware 1 meter"),
    "apollo-14-fra-mauro": (0.003, "A3-3", "Descent stage: 3 meters buffer; other hardware 1 meter"),
    "apollo-15-hadley-apennine": (0.003, "A3-3", "Descent stage: 3 meters buffer; other hardware 1 meter"),
    "apollo-16-descartes": (0.003, "A3-3", "Descent stage: 3 meters buffer; other hardware 1 meter"),
}
IMPACT_OBJECTS = ["Ranger6", "Ranger7", "Ranger8", "Ranger9", "A13_SIVB", "A14_SIVB", "A15_SIVB", "A16_SIVB", "A17_SIVB", "LCROSS"]
SCOPE_NOTE = "The NASA 2011 recommendations cover U.S. Government artifacts only. The One Small Step Act (Pub. L. 116-275) makes them a condition of NASA contracts; neither it nor the Artemis Accords sets distances."


def main():
    for p in (SEED / "protectionZones").glob("heritage-*.json"):
        p.unlink()
    n = 0
    for sid in DL_SITES:
        s = read_json(SEED / "sites" / f"{sid}.json")
        c = s["coordinates"]
        write_doc("protectionZones", f"heritage-dl-{sid}", {
            "kind": "heritage-buffer", "ruleId": "nasa2011-dl-boundary", "name": f"{s['name']}: 2.0 km descent/landing boundary",
            "siteId": sid, "geometry": {"type": "Circle", "center": {"latDeg": c["latDeg"], "lonDeg": c["lonDeg"]}, "radiusKm": 2.0},
            "rationale": "NASA 2011 §A1-3: a descent/landing boundary 'extending to a 2.0 km radial distance from the site where no overflight of a landed spacecraft may occur' (§A2-2). Touchdown targeting must stay at least 2.0 km or 3-sigma of the landing dispersion, whichever is greater (§A2-3). " + SCOPE_NOTE,
            "sources": [ref("nasa2011Heritage"), ref("oneSmallStep")], "needsData": False,
            "contextRings": [{"radiusKm": 1.5, "label": "Apollo LM rock-ejecta range: rocks 'impacted the lunar surface up to 1.5 km from the LM' (NASA 2011 §A2-3 rationale)"}],
        })
        n += 1
        if sid in ARTIFACT:
            r, sec, quote = ARTIFACT[sid]
            write_doc("protectionZones", f"heritage-artifact-{sid}", {
                "kind": "heritage-buffer", "ruleId": "nasa2011-artifact-boundary",
                "name": f"{s['name']}: artifact boundary ({r*1000:g} m)", "siteId": sid,
                "geometry": {"type": "Circle", "center": {"latDeg": c["latDeg"], "lonDeg": c["lonDeg"]}, "radiusKm": r},
                "rationale": f"NASA 2011 §{sec}: '{quote}'. Centred on the LM descent stage (LROC coordinates).",
                "sources": [ref("nasa2011Heritage"), ref("lroc2016")], "needsData": False,
            })
            n += 1

    rdr = shapefile.Reader(str(CACHE / "lroc/anthropogenic/ANTHROPOGENIC_OBJECTS_180.SHP"))
    objs = {r["OBJECT_ID"]: r.as_dict() for r in rdr.records()}
    for oid in IMPACT_OBJECTS:
        o = objs[oid]
        is_lcross = oid == "LCROSS"
        rationale = ("NASA 2011 §A1-3: impact sites have a descent/landing boundary 'extending to a 0.5 km radial distance from the center of the impact site'. "
                     + ("LCROSS is listed among the 0.5 km impact-site examples in NASA OTPS (2022). " if is_lcross else "The 2011 document names Ranger and S-IVB impact sites. ")
                     + f"Coordinates: LROC anthropogenic shapefile ({o['COORD_SRC']}, ±{o['UNCERTAIN']} m). " + SCOPE_NOTE)
        srcs = [ref("nasa2011Heritage"), ref("lrocShapefile")] + ([ref("nasaOtps2022")] if is_lcross else [])
        write_doc("protectionZones", f"heritage-impact-{oid.lower().replace('_', '-')}", {
            "kind": "heritage-buffer", "ruleId": "nasa2011-impact-boundary", "name": f"{o['SHORT_NAME']}: 0.5 km impact-site boundary",
            "siteId": None, "geometry": {"type": "Circle", "center": {"latDeg": float(o["LATITUDE"]), "lonDeg": float(o["LONGITUDE"])}, "radiusKm": 0.5},
            "rationale": rationale, "sources": srcs, "needsData": False,
        })
        n += 1
    log(f"50_zones: {n} heritage zones")


if __name__ == "__main__":
    main()
