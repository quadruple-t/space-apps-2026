#!/usr/bin/env python3
"""Stage 60: validate the curated JSON (prompt §5.5, §11) and emit landerPresets, facts,
storyChapters, missionProfiles, validationChecks (computed fields pending) and dataSources.

Validation (any failure aborts):
  - every preset field is {value: number|null, unit, basis in sourced|derived|assumption, sourceIdx, note};
    a non-null value needs basis + (sourceIdx or basis == assumption); sourceIdx in range
  - profile weights sum to 1 (±0.001); hazard thresholds present
  - chapter order 1/2/3 with tools horizon-dial / power-simulator / base-scoring
  - featuredSiteIds and validationChecks.siteId exist in data/seed/sites
  - every source key resolves in refs.json
"""
import sys

from pipeline.common import SEED, clear_collection, curated, log, manifest_entry, now_iso, read_json, ref, refs, write_doc

PRESET_FIELDS = ["arrayPowerW", "panelAreaM2", "cellEfficiency", "batteryWh", "batteryAh", "busV", "baseLoadW", "commsLoadW", "designLifeHours"]
UNITS = {"arrayPowerW": "W", "panelAreaM2": "m2", "cellEfficiency": "fraction", "batteryWh": "Wh", "batteryAh": "Ah", "busV": "V",
         "baseLoadW": "W", "commsLoadW": "W", "designLifeHours": "h"}
BASIS = {"sourced", "derived", "assumption"}
CHAPTER_TOOL = {"ch1-first-landing": "horizon-dial", "ch2-robotic-explorer": "power-simulator", "ch3-lunar-base": "base-scoring"}
FOCUS = {"sun-elevation", "horizon-mask", "earth-visibility", "battery-soc", "ice-access", "score"}
EXPECTS = {"none", "choice", "slider", "date-pick"}
WEIGHT_KEYS = ["sunlight", "earthComms", "thermalMargin", "batterySurvival", "iceAccess", "longSunlight", "hazardMargin"]

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def site_ids() -> set[str]:
    return {p.stem for p in (SEED / "sites").glob("*.json")}


def presets() -> int:
    clear_collection("landerPresets")
    n = 0
    for p in curated("presets.json")["presets"]:
        srcs = refs(p["sources"])
        fields = {}
        for k in PRESET_FIELDS:
            f = p["fields"].get(k)
            if f is None:
                f = {"value": None, "unit": UNITS[k], "basis": "sourced", "sourceIdx": None, "note": "unsourced (see docs/MISSING_DATA.md)"}
            if f["basis"] not in BASIS:
                err(f"preset {p['id']}.{k}: bad basis {f['basis']}")
            if f["value"] is not None and f["basis"] != "assumption" and f["sourceIdx"] is None:
                err(f"preset {p['id']}.{k}: value without a source")
            if f["sourceIdx"] is not None and not (0 <= f["sourceIdx"] < len(srcs)):
                err(f"preset {p['id']}.{k}: sourceIdx out of range")
            if f.get("unit") != UNITS[k]:
                err(f"preset {p['id']}.{k}: unit {f.get('unit')} != {UNITS[k]}")
            fields[k] = {"value": f["value"], "unit": f["unit"], "basis": f["basis"], "sourceIdx": f["sourceIdx"], "note": f.get("note", "")}
        for extra in set(p["fields"]) - set(PRESET_FIELDS):
            err(f"preset {p['id']}: unknown field {extra}")
        for fact in p.get("facts", []):
            if fact["sourceIdx"] is not None and not (0 <= fact["sourceIdx"] < len(srcs)):
                err(f"preset {p['id']}: fact sourceIdx out of range")
        write_doc("landerPresets", p["id"], {"label": p["label"], "agency": p["agency"], "mission": p["mission"],
                                             "fields": fields, "facts": p.get("facts", []), "sources": srcs})
        n += 1
    return n


def facts() -> int:
    clear_collection("facts")
    cur = curated("facts.json")
    fx = cur["fxRates"]
    stamp = now_iso()
    for sheet in cur["sheets"]:
        rows = []
        for r in sheet["rows"]:
            row = {"label": r["label"], "value": r["value"], "unit": r.get("unit"), "quote": r["quote"], "source": ref(r["source"])}
            for k in ("currency", "approxUsd", "tier", "note"):
                if k in r:
                    row[k] = r[k]
            if "fx" in r:
                f = r["fx"]
                rate = fx[f["currency"]][f["year"]]
                row["approxUsd"] = round(f["amount"] / rate, -5)
                conv = f"approx. ${row['approxUsd']/1e6:,.1f}M at the FRED {f['year']} annual average ({rate} {f['currency']}/USD)"
                row["note"] = (r.get("note", "") + " " + conv).strip()
                row["fxSource"] = ref(fx[f["currency"]]["source"])
            rows.append(row)
        write_doc("facts", sheet["id"], {"title": sheet["title"], "rows": rows, "updatedAt": stamp})
    return len(cur["sheets"])


def story(sites: set[str]) -> int:
    clear_collection("storyChapters")
    chapters = curated("story.json")["chapters"]
    orders = sorted(c["order"] for c in chapters)
    if orders != [1, 2, 3]:
        err(f"chapter orders {orders} != [1,2,3]")
    for c in chapters:
        if CHAPTER_TOOL.get(c["id"]) != c["unlocksTool"]:
            err(f"{c['id']} unlocks {c['unlocksTool']}, expected {CHAPTER_TOOL.get(c['id'])}")
        for s in c["featuredSiteIds"]:
            if s not in sites:
                err(f"{c['id']}: featured site {s} not in sites")
        for st in c["steps"]:
            if st["focus"] not in FOCUS or st["expects"] not in EXPECTS:
                err(f"{c['id']}/{st['id']}: bad focus/expects")
        deb = dict(c["debrief"])
        deb["keyNumbers"] = [{**{k: v for k, v in kn.items() if k != "sources"}, "sources": refs(kn.get("sources", []))} for kn in deb["keyNumbers"]]
        doc = {k: v for k, v in c.items() if k not in ("id", "debrief")}
        doc["debrief"] = deb
        write_doc("storyChapters", c["id"], doc)
    return len(chapters)


def profiles() -> int:
    clear_collection("missionProfiles")
    profs = curated("profiles.json")["profiles"]
    for p in profs:
        w = p["weights"]
        if set(w) != set(WEIGHT_KEYS):
            err(f"{p['id']}: weight keys {sorted(w)}")
        if abs(sum(w.values()) - 1.0) > 1e-3:
            err(f"{p['id']}: weights sum to {sum(w.values())}")
        ht = p["hazardThresholds"]
        doc = {k: v for k, v in p.items() if k not in ("id", "hazardThresholds", "durationSources")}
        doc["hazardThresholds"] = {"landingSlopeMaxDeg": ht["landingSlopeMaxDeg"], "evaSlopeMaxDeg": ht["evaSlopeMaxDeg"], "sources": refs(ht["sources"])}
        doc["weightsBasis"] = "assumption"
        doc["weightsNote"] = "Starting values chosen by the team; justified in docs/METHODS.md and tunable in Firestore without a redeploy."
        if p.get("durationSources"):
            doc["durationSources"] = refs(p["durationSources"])
        write_doc("missionProfiles", p["id"], doc)
    return len(profs)


def validation(sites: set[str]) -> int:
    """Emit checks with computed fields pending; 80_validate.py fills computed/deltaDeg/status."""
    clear_collection("validationChecks")
    cur = curated("validation.json")
    for c in cur["checks"]:
        if c["siteId"] not in sites:
            err(f"{c['id']}: site {c['siteId']} missing")
        doc = {"siteId": c["siteId"], "time": c["time"], "quantity": c["quantity"],
               "computed": None, "computedBy": None, "historical": c["historical"], "historicalKind": c["historicalKind"],
               "historicalSource": ref(c["historicalSource"]) if c.get("historicalSource") else None,
               "toleranceDeg": c["toleranceDeg"], "deltaDeg": None, "status": "pending",
               "note": c.get("note", "") or "Pending: computed by 80_validate.py.", "range": c.get("range")}
        write_doc("validationChecks", c["id"], doc)
    return len(cur["checks"])


def data_sources() -> int:
    clear_collection("dataSources")
    for s in curated("dataSources.json")["sources"]:
        retrieved = None
        key = s.get("manifestKey")
        if key == "horizons":
            retrieved = "2026-11-14"
        elif key:
            e = manifest_entry(key)
            retrieved = e["retrievedAt"] if e else None
        doc = {k: v for k, v in s.items() if k not in ("id", "manifestKey")}
        doc["retrievedAt"] = retrieved or "2026-11-14"
        write_doc("dataSources", s["id"], doc)
    return len(curated("dataSources.json")["sources"])


def main():
    sites = site_ids()
    if not sites:
        sys.exit("run 10_sites.py first")
    counts = {"landerPresets": presets(), "facts": facts(), "storyChapters": story(sites), "missionProfiles": profiles(),
              "validationChecks": validation(sites), "dataSources": data_sources()}
    if errors:
        log("60_curated FAILED:\n  " + "\n  ".join(errors))
        sys.exit(1)
    log("60_curated: " + ", ".join(f"{k} {v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
