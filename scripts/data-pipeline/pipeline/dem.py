"""DEM access for the horizon ray-caster.

Two raster kinds, both sampled bilinearly with NaN outside coverage / at nodata:
  StereoRaster - south polar stereographic GeoTIFFs (PGDA products 78 and 90), sampled at x, y (m)
  CylRaster    - simple-cylindrical PDS images (SLDEM2015 tiles, LOLA LDEM_32), sampled at lat, lon

Heights are metres above the 1737.4 km sphere. Remote windows (COG via GDAL /vsicurl/, SLDEM2015
via HTTP multi-range requests computed from the PDS label) are cached under .cache/windows/ so
reruns do not touch the network.
"""
from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

import numpy as np
import requests

from .common import CACHE, USER_AGENT, cached, log, record_range_source
from .geo import ll_to_xy

WIN_CACHE = CACHE / "windows"
WIN_CACHE.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".TIF,.tif")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("VSI_CACHE", "TRUE")


def _bilinear(arr: np.ndarray, row: np.ndarray, col: np.ndarray) -> np.ndarray:
    """Bilinear interpolation at fractional (row, col) pixel-centre coordinates; NaN outside."""
    h, w = arr.shape
    r0 = np.floor(row).astype(np.int64)
    c0 = np.floor(col).astype(np.int64)
    fr = row - r0
    fc = col - c0
    ok = (r0 >= 0) & (c0 >= 0) & (r0 < h - 1) & (c0 < w - 1)
    r0c = np.where(ok, r0, 0)
    c0c = np.where(ok, c0, 0)
    a = arr[r0c, c0c]
    b = arr[r0c, c0c + 1]
    c = arr[r0c + 1, c0c]
    d = arr[r0c + 1, c0c + 1]
    out = (a * (1 - fc) + b * fc) * (1 - fr) + (c * (1 - fc) + d * fc) * fr
    return np.where(ok, out, np.nan)


class StereoRaster:
    """Polar stereographic raster: arr[row, col], top-left corner (x0, y0), square pixel dx (m)."""

    kind = "stereo"

    def __init__(self, arr: np.ndarray, x0: float, y0: float, dx: float, name: str, sigma_const: float | None = None):
        self.arr = arr.astype(np.float32, copy=False)
        self.x0, self.y0, self.dx, self.name = float(x0), float(y0), float(dx), name
        self.sigma_const = sigma_const

    def sample_xy(self, x, y):
        col = (np.asarray(x) - self.x0) / self.dx - 0.5
        row = (self.y0 - np.asarray(y)) / self.dx - 0.5
        return _bilinear(self.arr, row, col)

    def sample(self, lat, lon, x, y):
        return self.sample_xy(x, y)

    @property
    def extent(self):
        h, w = self.arr.shape
        return self.x0, self.x0 + w * self.dx, self.y0 - h * self.dx, self.y0

    @classmethod
    def from_file(cls, rel: str, name: str | None = None, bbox=None, sigma_const=None) -> "StereoRaster":
        import rasterio
        from rasterio.windows import from_bounds

        path = cached(rel)
        with rasterio.open(path) as src:
            t = src.transform
            if bbox is None:
                arr = src.read(1)
                x0, y0 = t.c, t.f
            else:
                win = from_bounds(*bbox, transform=t).round_offsets().round_lengths()
                arr = src.read(1, window=win, boundless=True, fill_value=np.nan)
                x0 = t.c + win.col_off * t.a
                y0 = t.f + win.row_off * t.e
            nd = src.nodata
        arr = arr.astype(np.float32)
        if nd is not None and not np.isnan(nd):
            arr[arr == nd] = np.nan
        return cls(arr, x0, y0, t.a, name or Path(rel).stem, sigma_const)

    @classmethod
    def from_cog(cls, key: str, url: str, bbox, name: str | None = None) -> "StereoRaster":
        """Windowed read of a remote COG (bbox = xmin, ymin, xmax, ymax in metres). Cached."""
        import rasterio
        from rasterio.windows import from_bounds

        h = hashlib.sha1(f"{url}|{[round(v, 1) for v in bbox]}".encode()).hexdigest()[:16]
        cp = WIN_CACHE / f"{key}-{h}.npz"
        if cp.exists():
            z = np.load(cp)
            return cls(z["arr"], float(z["x0"]), float(z["y0"]), float(z["dx"]), name or key)
        record_range_source(key, url, "COG window read via GDAL /vsicurl/")
        with rasterio.open("/vsicurl/" + url) as src:
            t = src.transform
            win = from_bounds(*bbox, transform=t).round_offsets().round_lengths()
            arr = src.read(1, window=win, boundless=True, fill_value=np.nan).astype(np.float32)
            x0 = t.c + win.col_off * t.a
            y0 = t.f + win.row_off * t.e
            nd = src.nodata
        if nd is not None and not np.isnan(nd):
            arr[arr == nd] = np.nan
        np.savez_compressed(cp, arr=arr, x0=x0, y0=y0, dx=t.a)
        return cls(arr, x0, y0, t.a, name or key)


class CylRaster:
    """Simple-cylindrical raster. Pixel (line, sample) centre: lat = lat_top - (line + 0.5)/ppd,
    lon = lon_left + (sample + 0.5)/ppd (lon east, may be unwrapped). global_lon wraps longitude."""

    kind = "cyl"

    def __init__(self, arr, lat_top, lon_left, ppd, name, global_lon=False, sigma_const=None):
        self.arr = arr.astype(np.float32, copy=False)
        self.lat_top, self.lon_left, self.ppd, self.name = float(lat_top), float(lon_left), float(ppd), name
        self.global_lon = global_lon
        self.sigma_const = sigma_const

    def sample(self, lat, lon, x=None, y=None):
        lon = np.asarray(lon, dtype=np.float64)
        lon_rel = (lon - self.lon_left) % 360.0
        row = (self.lat_top - np.asarray(lat)) * self.ppd - 0.5
        col = lon_rel * self.ppd - 0.5
        if self.global_lon:
            # wrap: pad one column on each side via modulo indexing
            w = self.arr.shape[1]
            colw = np.mod(col, w)
            return _bilinear_wrap(self.arr, row, colw)
        return _bilinear(self.arr, row, col)


def _bilinear_wrap(arr, row, col):
    h, w = arr.shape
    r0 = np.floor(row).astype(np.int64)
    c0 = np.floor(col).astype(np.int64)
    fr, fc = row - r0, col - c0
    ok = (r0 >= 0) & (r0 < h - 1)
    r0c = np.where(ok, r0, 0)
    c0 = np.mod(c0, w)
    c1 = np.mod(c0 + 1, w)
    out = (arr[r0c, c0] * (1 - fc) + arr[r0c, c1] * fc) * (1 - fr) + (arr[r0c + 1, c0] * (1 - fc) + arr[r0c + 1, c1] * fc) * fr
    return np.where(ok, out, np.nan)


# ---------------------------------------------------------------------------
# PDS label helpers
# ---------------------------------------------------------------------------

def parse_label(text: str) -> dict:
    out = {}
    for k in ["LINES", "LINE_SAMPLES", "SAMPLE_BITS", "SAMPLE_TYPE", "SCALING_FACTOR", "OFFSET", "MAP_RESOLUTION",
              "MAXIMUM_LATITUDE", "MINIMUM_LATITUDE", "WESTERNMOST_LONGITUDE", "EASTERNMOST_LONGITUDE",
              "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET", "CENTER_LONGITUDE", "RECORD_BYTES"]:
        m = re.search(rf"^\s*{k}\s*=\s*([^\s<]+)", text, flags=re.M)
        if m:
            v = m.group(1).strip('"')
            try:
                out[k] = float(v)
            except ValueError:
                out[k] = v
    return out


def load_ldem32() -> CylRaster:
    """LOLA LDEM_32 (global, 32 ppd, int16 x 0.5 m above 1737.4 km)."""
    lbl = parse_label(cached("lola/LDEM_32.LBL").read_text(errors="ignore"))
    lines, samples = int(lbl["LINES"]), int(lbl["LINE_SAMPLES"])
    raw = np.fromfile(cached("lola/LDEM_32.IMG"), dtype="<i2", count=lines * samples).reshape(lines, samples)
    arr = raw.astype(np.float32) * float(lbl.get("SCALING_FACTOR", 0.5))
    ppd = float(lbl["MAP_RESOLUTION"])
    lat_top = float(lbl.get("MAXIMUM_LATITUDE", 90.0))
    lon_left = float(lbl.get("WESTERNMOST_LONGITUDE", 0.0))
    # Sanity-check against the projection offsets (pixel-centre convention).
    if "LINE_PROJECTION_OFFSET" in lbl:
        assert abs((lat_top * ppd - 0.5) - lbl["LINE_PROJECTION_OFFSET"]) < 1.0, "unexpected LDEM line offset"
    return CylRaster(arr, lat_top, lon_left, ppd, "LDEM_32", global_lon=True, sigma_const=20.0)


# ---------------------------------------------------------------------------
# SLDEM2015 512 ppd tiles: row-wise multi-range reads
# ---------------------------------------------------------------------------

SLDEM_PPD = 512
SLDEM_LAT_BANDS = [(-60, -30), (-30, 0), (0, 30), (30, 60)]
SLDEM_SIGMA_M = 3.5  # "typical vertical accuracy approx. 3 to 4 m" (PGDA product 54)


def _sldem_tile_name(lat_lo, lat_hi, lon_lo):
    def ns(v):
        return f"{abs(v):02d}{'S' if v < 0 else 'N'}"
    return f"SLDEM2015_512_{ns(lat_lo)}_{ns(lat_hi)}_{lon_lo:03d}_{lon_lo + 45:03d}_FLOAT"


def _multirange_get(url: str, ranges: list[tuple[int, int]]) -> list[bytes]:
    """GET several byte ranges in one request (server returns multipart/byteranges)."""
    hdr = {"User-Agent": USER_AGENT, "Range": "bytes=" + ",".join(f"{a}-{b}" for a, b in ranges)}
    for attempt in range(6):
        try:
            r = requests.get(url, headers=hdr, timeout=300)
            if r.status_code != 206:
                raise RuntimeError(f"HTTP {r.status_code}")
            ctype = r.headers.get("Content-Type", "")
            if len(ranges) == 1 and "multipart" not in ctype:
                return [r.content]
            m = re.search(r"boundary=([^;]+)", ctype)
            boundary = m.group(1).strip('"').encode()
            parts = {}
            for chunk in r.content.split(b"--" + boundary):
                if b"Content-Range" not in chunk:
                    continue
                head, _, body = chunk.partition(b"\r\n\r\n")
                mm = re.search(rb"bytes (\d+)-(\d+)/", head)
                a, b = int(mm.group(1)), int(mm.group(2))
                parts[a] = body[: b - a + 1]
            return [parts[a] for a, _ in ranges]
        except Exception as e:
            if attempt == 5:
                raise
            log(f"  SLDEM range retry {attempt + 1}: {e}")
            import time
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def sldem_window(lat: float, lon: float, radius_km: float) -> CylRaster:
    """SLDEM2015 window centred on (lat, lon), +-radius_km. Heights in m above 1737.4 km."""
    from .sources import SLDEM_TILES

    dlat = radius_km / (1737.4 * np.pi / 180.0)
    dlon = dlat / max(np.cos(np.radians(lat)), 0.2)
    lat_hi = min(lat + dlat, 60.0)
    lat_lo = max(lat - dlat, -60.0)
    lon_c = lon % 360.0
    lon_lo, lon_hi = lon_c - dlon, lon_c + dlon
    key = hashlib.sha1(f"sldem|{lat:.5f}|{lon:.5f}|{radius_km}".encode()).hexdigest()[:16]
    cp = WIN_CACHE / f"SLDEM2015-{key}.npz"
    if cp.exists():
        z = np.load(cp)
        return CylRaster(z["arr"], float(z["lat_top"]), float(z["lon_left"]), SLDEM_PPD, "SLDEM2015_512", sigma_const=SLDEM_SIGMA_M)

    # Output grid aligned to the 512 ppd pixel lattice.
    top = np.ceil(lat_hi * SLDEM_PPD) / SLDEM_PPD
    bot = np.floor(lat_lo * SLDEM_PPD) / SLDEM_PPD
    left = np.floor(lon_lo * SLDEM_PPD) / SLDEM_PPD
    right = np.ceil(lon_hi * SLDEM_PPD) / SLDEM_PPD
    nrow = int(round((top - bot) * SLDEM_PPD))
    ncol = int(round((right - left) * SLDEM_PPD))
    out = np.full((nrow, ncol), np.nan, dtype=np.float32)
    record_range_source("SLDEM2015_512_TILES", SLDEM_TILES + "/", "raw float32 tiles; row-block multi-range reads")

    for blo, bhi in SLDEM_LAT_BANDS:
        if bhi <= bot or blo >= top:
            continue
        for tlon in range(0, 360, 45):
            for shift in (-360.0, 0.0, 360.0):
                t_left, t_right = tlon + shift, tlon + 45 + shift
                il, ir = max(left, t_left), min(right, t_right)
                it, ib = min(top, bhi), max(bot, blo)
                if il >= ir or ib >= it:
                    continue
                name = _sldem_tile_name(blo, bhi, tlon)
                samples = 45 * SLDEM_PPD
                r0 = int(round((bhi - it) * SLDEM_PPD))
                r1 = int(round((bhi - ib) * SLDEM_PPD))
                c0 = int(round((il - t_left) * SLDEM_PPD))
                c1 = int(round((ir - t_left) * SLDEM_PPD))
                url = f"{SLDEM_TILES}/{name}.IMG"
                rows = list(range(r0, r1))
                data = []
                for k in range(0, len(rows), 200):
                    batch = rows[k:k + 200]
                    rngs = [((r * samples + c0) * 4, (r * samples + c1) * 4 - 1) for r in batch]
                    data += _multirange_get(url, rngs)
                block = np.frombuffer(b"".join(data), dtype="<f4").reshape(len(rows), c1 - c0) * 1000.0  # km -> m
                orow = int(round((top - it) * SLDEM_PPD))
                ocol = int(round((il - left) * SLDEM_PPD))
                out[orow:orow + block.shape[0], ocol:ocol + block.shape[1]] = block
                log(f"    SLDEM {name}: rows {r0}-{r1}, cols {c0}-{c1}")
    out[out < -20000] = np.nan
    np.savez_compressed(cp, arr=out, lat_top=top, lon_left=left)
    return CylRaster(out, top, left, SLDEM_PPD, "SLDEM2015_512", sigma_const=SLDEM_SIGMA_M)


def stereo_bbox(lat: float, lon: float, half_m: float):
    x, y = ll_to_xy(lat, lon)
    return (float(x) - half_m, float(y) - half_m, float(x) + half_m, float(y) + half_m)
