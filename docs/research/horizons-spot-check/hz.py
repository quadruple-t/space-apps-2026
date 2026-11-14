"""Minimal JPL Horizons API helper (stdlib only). Caches raw responses to disk."""
import hashlib, json, os, time, urllib.parse, urllib.request

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "responses")
os.makedirs(CACHE, exist_ok=True)


def query(params, tag="q"):
    p = {"format": "json", **params}
    qs = urllib.parse.urlencode(p, quote_via=urllib.parse.quote, safe="'@,:")
    url = API + "?" + qs
    key = hashlib.sha1(url.encode()).hexdigest()[:12]
    path = os.path.join(CACHE, f"{tag}-{key}.json")
    if os.path.exists(path):
        with open(path) as f:
            d = json.load(f)
    else:
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=120) as r:
                    d = json.load(r)
                break
            except Exception as e:  # 503 etc.
                if attempt == 3:
                    raise
                time.sleep(3 * (attempt + 1))
        d["_url"] = url
        with open(path, "w") as f:
            json.dump(d, f)
        time.sleep(0.5)  # be polite: sequential requests only
    return d, url


def table(d):
    """Return list of CSV rows between $$SOE/$$EOE plus the header line."""
    res = d["result"]
    if "$$SOE" not in res:
        raise RuntimeError(res[-3000:])
    pre, rest = res.split("$$SOE", 1)
    body = rest.split("$$EOE", 1)[0]
    hdr_lines = [l for l in pre.splitlines() if l.strip().startswith("Date")]
    hdr = [h.strip() for h in hdr_lines[-1].split(",")] if hdr_lines else None
    rows = [[c.strip() for c in l.split(",")] for l in body.strip().splitlines() if l.strip()]
    return hdr, rows, body.strip().splitlines()
