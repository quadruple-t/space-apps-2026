#!/usr/bin/env python3
"""Stage 45: Lunar Prospector GRS oxide abundances -> compositionGrid/lp-grs-2deg.json.

Source: LP-L-GRS-5-ELEM-ABUNDANCE-V1.0 (Prettyman et al. 2006, JGR 111 E12007), table
lpgrs_high1_elem_abundance_2deg.tab: one row per 2-degree equal-area pixel, weight fractions (g/g)
and the 9x9 error matrix (upper triangle). Fixed-width ASCII; columns are read from the PDS3 label.

Output (all little-endian):
  bounds  int16  [minLat, maxLat, minLon, maxLon] x count, degrees x 10 (longitude east, -180..180)
  values  uint16 [FeO, TiO2, Al2O3, CaO, MgO, SiO2] x count, wt% x 100
  sigma   uint16 same layout, 1-sigma from the error-matrix diagonal, wt% x 100
Negative unmixed abundances are clipped to 0 and counted.

The 5-degree label in this volume carries the 2-degree table name, so this stage checks the
pixel size it actually parsed instead of trusting the file name.
"""
import re

import numpy as np

from pipeline.common import CACHE, b64, log, now_iso, write_doc

LBL = CACHE / "lpgrs/lpgrs_high1_elem_abundance_2deg.lbl"
TAB = CACHE / "lpgrs/lpgrs_high1_elem_abundance_2deg.tab"
FMT = CACHE / "lpgrs/lpgrs_elem_abundance.fmt"  # ^STRUCTURE file holding the COLUMN objects
OXIDES = ["FeO", "TiO2", "Al2O3", "CaO", "MgO", "SiO2"]
# The .fmt names TiO2 "TIO2" while the label text says W_TIO2, so each oxide lists the names it may use.
COLUMN = {"FeO": ("W_FEO",), "TiO2": ("W_TIO2", "TIO2"), "Al2O3": ("W_AL2O3",), "CaO": ("W_CAO",), "MgO": ("W_MGO",), "SiO2": ("W_SIO2",)}
# Error-matrix index order in the label: 0 MgO, 1 Al2O3, 2 SiO2, 3 CaO, 4 TiO2, 5 FeO.
ERR_INDEX = {"MgO": 0, "Al2O3": 1, "SiO2": 2, "CaO": 3, "TiO2": 4, "FeO": 5}


def label_columns(text: str) -> dict[str, tuple[int, int]]:
    """NAME -> (start_byte 1-based, bytes) for every COLUMN object."""
    cols: dict[str, tuple[int, int]] = {}
    for block in re.findall(r"OBJECT\s*=\s*COLUMN(.*?)END_OBJECT\s*=\s*COLUMN", text, re.S):
        name = re.search(r"\bNAME\s*=\s*\"?([^\"\r\n]+?)\"?\s*$", block, re.M)
        start = re.search(r"\bSTART_BYTE\s*=\s*(\d+)", block)
        size = re.search(r"\bBYTES\s*=\s*(\d+)", block)
        if name and start and size:
            cols[name.group(1).strip()] = (int(start.group(1)), int(size.group(1)))
    return cols


def main() -> None:
    if not all(p.exists() for p in (LBL, TAB, FMT)):
        raise SystemExit("LP GRS files missing: run `python 00_fetch.py --only lpgrs` first")
    label = LBL.read_text(errors="replace")
    if "LPGRS_ELEM_ABUNDANCE.FMT" not in label.upper() or "2DEG.TAB" not in label.upper():
        raise SystemExit(f"{LBL.name}: label does not point at the 2-degree table and its .FMT structure")
    rows_match = re.search(r"\bROWS\s*=\s*(\d+)", label)
    if not rows_match:
        raise SystemExit(f"{LBL.name}: no ROWS in label")
    rows = int(rows_match.group(1))
    cols = label_columns(FMT.read_text(errors="replace"))
    oxide_col = {ox: next((n for n in names if n in cols), names[0]) for ox, names in COLUMN.items()}
    need = ["MIN_LAT", "MAX_LAT", "MIN_LON", "MAX_LON", *oxide_col.values(), *(f"E[{i},{i}]" for i in range(6))]
    missing = [c for c in need if c not in cols]
    if missing:
        raise SystemExit(f"label is missing columns {missing}; found {sorted(cols)[:12]}...")

    def field(line: str, name: str) -> float:
        start, size = cols[name]
        return float(line[start - 1:start - 1 + size])

    lines = [ln for ln in TAB.read_text().splitlines() if ln.strip()]
    if len(lines) != rows:
        raise SystemExit(f"{TAB.name}: {len(lines)} rows, label says {rows}")
    n = len(lines)
    bounds = np.zeros((n, 4), dtype=np.int16)
    values = np.zeros((n, 6), dtype=np.uint16)
    sigma = np.zeros((n, 6), dtype=np.uint16)
    clipped = 0
    for r, line in enumerate(lines):
        b = [field(line, k) for k in ("MIN_LAT", "MAX_LAT", "MIN_LON", "MAX_LON")]
        bounds[r] = np.round(np.array(b) * 10).astype(np.int16)
        for j, ox in enumerate(OXIDES):
            w = field(line, oxide_col[ox]) * 100  # g/g -> wt%
            if w < 0:
                clipped += 1
                w = 0.0
            var = field(line, f"E[{ERR_INDEX[ox]},{ERR_INDEX[ox]}]")
            values[r, j] = min(65535, round(w * 100))
            sigma[r, j] = min(65535, round(np.sqrt(max(var, 0.0)) * 100 * 100))

    lat_span = np.median((bounds[:, 1] - bounds[:, 0]) / 10)
    if not 1.5 <= lat_span <= 2.5:
        raise SystemExit(f"median pixel latitude span is {lat_span} deg; this is not the 2-degree product")
    if bounds[:, 0].min() > -890 or bounds[:, 1].max() < 890:
        raise SystemExit("pixels do not reach both poles")
    med_val, med_sig = np.median(values[:, 0]), np.median(sigma[:, 0])
    if not 0 < med_sig < med_val:
        raise SystemExit(f"FeO sigma median {med_sig / 100} wt% vs value median {med_val / 100} wt%: check error-matrix units")

    write_doc("compositionGrid", "lp-grs-2deg", {
        "count": n,
        "oxides": OXIDES,
        "encoding": "bounds int16 [minLat,maxLat,minLon,maxLon] deg x10 (lon east -180..180); values and sigma uint16 per oxide in 'oxides' order, wt% x100; little-endian, pixel-major",
        "bounds": b64(bounds.reshape(-1)),
        "values": b64(values.reshape(-1)),
        "sigma": b64(sigma.reshape(-1)),
        "pixelDeg": 2,
        "resolutionKm": 60,
        "clippedNegativeCount": clipped,
        "product": "LP-L-GRS-5-ELEM-ABUNDANCE-V1.0 lpgrs_high1_elem_abundance_2deg.tab",
        "sourceId": "lp-grs-elem-abundance",
        "citation": "Prettyman, T.H. et al. (2006), J. Geophys. Res. 111, E12007, doi:10.1029/2005JE002656",
        "caveats": [
            "Regional averages over 2-degree equal-area pixels (about 60 km), not site-scale values.",
            "Abundances come from gamma-ray spectral unmixing; GRS TiO2 is reported high in some regions (Elphic et al.).",
        ],
        "computedAt": now_iso(),
    })
    log(f"compositionGrid/lp-grs-2deg: {n} pixels, {clipped} negative values clipped")


if __name__ == "__main__":
    main()
