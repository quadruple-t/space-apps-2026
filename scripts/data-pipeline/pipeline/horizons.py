"""JPL Horizons API client: sequential, disk-cached, with back-off (fair-use policy).

Horizons returns input errors as HTTP 200, so every response is checked for $$SOE.
Output is capped at 90,000 times per request (measured), so callers split long spans.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.parse

import requests

from .common import CACHE, USER_AGENT, log
from .sources import HORIZONS_API

HZ_CACHE = CACHE / "horizons"
HZ_CACHE.mkdir(parents=True, exist_ok=True)

COMMON = {
    "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'", "TIME_TYPE": "'UT'",
    "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'", "RANGE_UNITS": "'KM'",
}

_last_call = 0.0


def build_url(params: dict) -> str:
    p = {"format": "json", **params}
    return HORIZONS_API + "?" + urllib.parse.urlencode(p, quote_via=urllib.parse.quote, safe="'@,:")


def query(params: dict, tag: str = "q") -> tuple[dict, str]:
    """Run one Horizons query (or return the cached response). Strictly one request at a time."""
    global _last_call
    url = build_url(params)
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    path = HZ_CACHE / f"{tag}-{key}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f), url
    delay = 5.0
    for attempt in range(6):
        wait = 1.0 - (time.time() - _last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            _last_call = time.time()
            r = requests.get(url, timeout=300, headers={"User-Agent": USER_AGENT})
            if r.status_code == 503:
                raise RuntimeError("HTTP 503 (overloaded/maintenance)")
            r.raise_for_status()
            d = r.json()
            if "$$SOE" not in d.get("result", ""):
                raise ValueError("Horizons input error: " + d.get("result", "")[-1500:])
            break
        except ValueError:
            raise
        except Exception as e:
            if attempt == 5:
                raise
            log(f"  horizons retry {attempt+1}: {e}; sleeping {delay:.0f}s")
            time.sleep(delay)
            delay *= 2
    d["_url"] = url
    d["_retrievedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(path, "w") as f:
        json.dump(d, f)
    return d, url


def table(d: dict) -> tuple[list[str] | None, list[list[str]]]:
    res = d["result"]
    if "$$SOE" not in res:
        raise RuntimeError(res[-3000:])
    pre, rest = res.split("$$SOE", 1)
    body = rest.split("$$EOE", 1)[0]
    hdr_lines = [l for l in pre.splitlines() if l.strip().startswith("Date")]
    hdr = [h.strip() for h in hdr_lines[-1].split(",")] if hdr_lines else None
    rows = [[c.strip() for c in l.split(",")] for l in body.strip().splitlines() if l.strip()]
    return hdr, rows


def ephemeris_version(d: dict) -> str | None:
    """Ephemeris source from the header, e.g. 'DE441'."""
    m = re.search(r"\{source:\s*([A-Za-z0-9_\-]+)\}", d["result"])
    return m.group(1) if m else None


def header_value(d: dict, label: str) -> str | None:
    m = re.search(re.escape(label) + r"\s*:\s*(.+)", d["result"])
    return m.group(1).strip() if m else None


MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def parse_time(s: str) -> str:
    """'2027-Mar-01 00:00' or '1969-Jul-20 20:17:40.000' -> ISO UTC string."""
    s = s.strip()
    date, _, clock = s.partition(" ")
    y, mon, day = date.split("-")
    parts = clock.split(":")
    hh, mm = int(parts[0]), int(parts[1])
    ss = float(parts[2]) if len(parts) > 2 else 0.0
    return f"{int(y):04d}-{MONTHS[mon]:02d}-{int(day):02d}T{hh:02d}:{mm:02d}:{ss:06.3f}Z".replace(".000Z", "Z")
