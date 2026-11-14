#!/usr/bin/env python3
"""Stage 70: Home demo series -> demo/home.json.

One synodic month (29.53 d = 709 hourly steps, 2027-03-01 00:00 UTC) at a south-pole demo site:
the Malapert massif region reference point (PGDA product-78 box 'Site23', 5 m near field, -85.995, -0.24).
series = float32 count x 4 (sunAz, sunEl, earthAz, earthEl, degrees) from the stored global series (same
client math as lib/ephemeris); mask = the site's 720-bin horizon mask from sites/<id>/terrain/v1.
Pure display data: no user input, no Firestore writes from the client.
"""
import base64
import datetime as dt

import numpy as np

from pipeline.common import b64, log, now_iso, read_json, SEED, write_doc
from pipeline.ephem import Series, azel_from_cart

SITE = "artemis-malapert-massif"
START = dt.datetime(2027, 3, 1, tzinfo=dt.timezone.utc)
COUNT = int(round(29.53 * 24))  # 709


def main():
    site = read_json(SEED / "sites" / f"{SITE}.json")
    pt = site["representativePoint"]
    terrain = read_json(SEED / "sites" / SITE / "terrain" / "v1.json")
    series = Series(["2027-03", "2027-04"])
    h = (START - series.start).total_seconds() / 3600.0 + np.arange(COUNT)
    sun, earth = series.at_hours(h)
    saz, sel = azel_from_cart(pt["latDeg"], pt["lonDeg"], sun)
    eaz, eel = azel_from_cart(pt["latDeg"], pt["lonDeg"], earth)
    out = np.column_stack([saz, sel, eaz, eel]).astype("<f4")
    assert out.shape == (COUNT, 4) and np.isfinite(out).all()
    write_doc("demo", "home", {
        "siteId": SITE, "siteLabel": f"{site['name']} (approximate region reference)",
        "startUtc": START.strftime("%Y-%m-%dT%H:%M:%SZ"), "stepMinutes": 60, "count": COUNT,
        "series": b64(out), "mask": terrain["mask"], "maskBinDeg": terrain["binDeg"],
        "note": "One synodic month of computed Sun and Earth azimuth/elevation at the Malapert massif region reference point (not a NASA site coordinate), with its LOLA horizon mask. Computed offline from JPL Horizons sub-points; illustrative of a candidate region, not a landing prediction.",
        "sources": site["sources"][:1] + terrain["sources"], "computedAt": now_iso(),
    })
    log(f"70_demo: {COUNT} samples at {SITE}; Sun el {out[:,1].min():.2f}..{out[:,1].max():.2f}°, Earth el {out[:,3].min():.1f}..{out[:,3].max():.1f}°")


if __name__ == "__main__":
    main()
