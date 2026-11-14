#!/usr/bin/env python3
"""Stage 20: global Sun/Earth sub-point series from JPL Horizons -> ephemerisGlobal/*.json.

Query (prompt §5.2, confirmed in docs/research/ephemeris.md §1.2): target Moon (301), observer
geocentre (500@399), quantities 14,15,19,20 -> sub-Earth point, sub-solar point, Sun range r,
Earth range delta, in the MOON_ME frame. 1 h step, linear interpolation on Cartesian vectors in
the client. Main span 2026-01-01 .. 2030-12-31 (one request per year, sequential), split into
monthly documents. Historic windows: +-7 days around every catalog landing time (>= 1966).
Sun angular diameter: quantity 13 from a Moon-centred query (target Sun, centre 500@301), averaged
per document. A Feb 2010 - Feb 2011 series is also cached (not seeded) for the WAC lit-fraction
cross-check in 80_validate.py.
"""
import argparse
import calendar
import datetime as dt

import numpy as np

from pipeline.common import CACHE, SEED, b64, clear_collection, log, read_json, write_doc
from pipeline.horizons import COMMON, ephemeris_version, parse_time, query, table

LAYOUT = ["sunLatDeg", "sunLonDeg", "sunDistKm", "earthLatDeg", "earthLonDeg", "earthDistKm"]
FRAME = "MOON_ME (DE421)"
HIST_HALF_DAYS = 7


def fmt(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M")


def subpoint_series(start: dt.datetime, stop: dt.datetime, step="1 h", tag="subpts"):
    params = {**COMMON, "COMMAND": "'301'", "CENTER": "'500@399'", "START_TIME": f"'{fmt(start)}'",
              "STOP_TIME": f"'{fmt(stop)}'", "STEP_SIZE": f"'{step}'", "QUANTITIES": "'14,15,19,20'"}
    d, url = query(params, tag)
    hdr, rows = table(d)
    ix = {h: i for i, h in enumerate(hdr)}
    cols = [ix["SunSub-LAT"], ix["SunSub-LON"], ix["r"], ix["ObsSub-LAT"], ix["ObsSub-LON"], ix["delta"]]
    times = [parse_time(r[0]) for r in rows]
    data = np.array([[float(r[c]) for c in cols] for r in rows], dtype=np.float64)
    return times, data, url, d


def sun_diameter(start: dt.datetime, stop: dt.datetime, step="1 d"):
    """Sun angular diameter (deg) seen from the Moon's centre, quantity 13 (arcsec)."""
    params = {**COMMON, "COMMAND": "'10'", "CENTER": "'500@301'", "START_TIME": f"'{fmt(start)}'",
              "STOP_TIME": f"'{fmt(stop)}'", "STEP_SIZE": f"'{step}'", "QUANTITIES": "'13'"}
    d, url = query(params, "sundiam")
    hdr, rows = table(d)
    ix = {h: i for i, h in enumerate(hdr)}
    col = ix.get("Ang-diam") if "Ang-diam" in ix else len(hdr) - 1
    times = [parse_time(r[0]) for r in rows]
    vals = np.array([float(r[col]) for r in rows]) / 3600.0
    return times, vals, url



def chunk_doc(chunk_id, start: dt.datetime, data: np.ndarray, url: str, version: str, sun_diam_mean, retrieved: str, extra=None):
    doc = {
        "startUtc": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stepMinutes": 60,
        "count": int(data.shape[0]),
        "layout": LAYOUT,
        "data": b64(data.astype("<f4")),
        "sunAngularDiameterDegMean": None if sun_diam_mean is None else round(float(sun_diam_mean), 6),
        "frame": FRAME,
        "timeScale": "UTC",
        "source": "JPL Horizons API",
        "horizonsQuery": url,
        "ephemerisVersion": version,
        "retrievedAt": retrieved,
    }
    if extra:
        doc.update(extra)
    write_doc("ephemerisGlobal", chunk_id, doc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start-year", type=int, default=2026)
    ap.add_argument("--end-year", type=int, default=2030)
    ap.add_argument("--skip-hist", action="store_true")
    args = ap.parse_args()
    clear_collection("ephemerisGlobal")

    n_docs = 0
    for year in range(args.start_year, args.end_year + 1):
        start = dt.datetime(year, 1, 1)
        stop = dt.datetime(year, 12, 31, 23)
        times, data, url, d = subpoint_series(start, stop)
        n = int((stop - start).total_seconds() // 3600) + 1
        if len(times) != n:
            raise RuntimeError(f"{year}: expected {n} rows, got {len(times)}")
        version = ephemeris_version(d)
        dtimes, diam, _ = sun_diameter(start, dt.datetime(year + 1, 1, 1))
        diam_by_month = {}
        for t, v in zip(dtimes, diam):
            diam_by_month.setdefault(t[:7], []).append(v)
        for m in range(1, 13):
            ms = dt.datetime(year, m, 1)
            off = int((ms - start).total_seconds() // 3600)
            cnt = calendar.monthrange(year, m)[1] * 24
            cid = f"{year}-{m:02d}"
            chunk_doc(cid, ms, data[off:off + cnt], url, version, np.mean(diam_by_month.get(cid, [np.nan])), d["_retrievedAt"],
                      {"horizonsQuery": url, "rowsInQuery": len(times), "rowOffset": off})
            n_docs += 1
        log(f"  {year}: {len(times)} rows, ephemeris {version}")

    if not args.skip_hist:
        for p in sorted((SEED / "sites").glob("*.json")):
            s = read_json(p)
            t = s.get("landingTimeUtc")
            if not t or s.get("siteKind") == "region-reference":
                continue
            if len(t) == 10:  # date precision: centre on 12:00 UTC of that date
                centre = dt.datetime.fromisoformat(t + "T12:00:00")
            else:
                centre = dt.datetime.fromisoformat(t.replace("Z", ""))
            if centre.year < 1966:
                continue
            start = (centre - dt.timedelta(days=HIST_HALF_DAYS)).replace(minute=0, second=0, microsecond=0)
            stop = start + dt.timedelta(days=2 * HIST_HALF_DAYS)
            times, data, url, d = subpoint_series(start, stop, tag="hist")
            n = int((stop - start).total_seconds() // 3600) + 1
            if len(times) != n:
                raise RuntimeError(f"hist {p.stem}: expected {n} rows, got {len(times)}")
            _, diam, _ = sun_diameter(start, stop, "6 h")
            chunk_doc(f"hist-{p.stem}", start, data, url, ephemeris_version(d), float(np.mean(diam)), d["_retrievedAt"],
                      {"siteId": p.stem, "windowCentreUtc": t})
            n_docs += 1
            log(f"  hist-{p.stem}: {start} +{2*HIST_HALF_DAYS} d")

    # Pipeline-only: one lunar year matching the LROC WAC illumination maps (15 Feb 2010 - 5 Feb 2011).
    start, stop = dt.datetime(2010, 2, 15), dt.datetime(2011, 2, 5, 23)
    times, data, url, _ = subpoint_series(start, stop, tag="wac")
    np.savez_compressed(CACHE / "ephem-wac-2010.npz", data=data, start=start.isoformat(), url=url)
    log(f"20_ephemeris: {n_docs} ephemerisGlobal docs written; WAC-year series cached ({len(times)} rows)")


if __name__ == "__main__":
    main()
