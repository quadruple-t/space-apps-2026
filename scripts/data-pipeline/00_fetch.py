#!/usr/bin/env python3
"""Stage 00: download every whole-file input into .cache/ and record it in manifest.lock.json.

Idempotent and resumable: files already present with a matching manifest entry are skipped,
partial downloads resume with HTTP Range. Range-read sources (COGs, SLDEM2015 tiles, Horizons)
are recorded as URLs only. Usage:
    python 00_fetch.py            # everything
    python 00_fetch.py --only lola,pgda78   # cache-path prefixes
"""
import argparse
import zipfile

from pipeline.common import CACHE, download, log, record_range_source
from pipeline.sources import RANGE_READ, WHOLE_FILES


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated cache-path prefixes to fetch")
    args = ap.parse_args()
    prefixes = [p for p in args.only.split(",") if p]

    for key, (url, note) in RANGE_READ.items():
        record_range_source(key, url, note)

    # Small files first so the quick stages can start while the big ones stream.
    todo = [(u, r) for u, r in WHOLE_FILES if not prefixes or any(r.startswith(p) for p in prefixes)]
    for url, rel in todo:
        log(f"fetch {rel}")
        download(url, rel)

    z = CACHE / "lroc/ANTHROPOGENIC_OBJECTS_180.ZIP"
    if z.exists():
        with zipfile.ZipFile(z) as zf:
            zf.extractall(CACHE / "lroc/anthropogenic")
    log("00_fetch complete")


if __name__ == "__main__":
    main()
