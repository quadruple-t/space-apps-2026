"""DEM access for the horizon ray-caster.

Two raster kinds, both sampled bilinearly with NaN outside coverage / at nodata:
  StereoRaster - south polar stereographic GeoTIFFs (PGDA products 78 and 90), sampled at x, y (m)
  CylRaster    - simple-cylindrical PDS images (SLDEM2015 tiles, LOLA LDEM_64 / LDEM_512), sampled at lat, lon

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


from dataclasses import dataclass


@dataclass
class CylTile:
    url: str
    lat_lo: float
    lat_hi: float
    lon_lo: float
    lon_hi: float
    ppd: int
    dtype: str      # numpy dtype of the raw samples
    scale_m: float  # multiply DN by this to get metres above 1737.4 km


def _sldem_tiles():
    from .sources import SLDEM_TILES
    return [CylTile(f"{SLDEM_TILES}/{_sldem_tile_name(lo, hi, tl)}.IMG", lo, hi, tl, tl + 45, SLDEM_PPD, "<f4", 1000.0)
            for lo, hi in SLDEM_LAT_BANDS for tl in range(0, 360, 45)]


def _ldem64_tiles():
    # LDEM_64.LBL: LINES 11520, LINE_SAMPLES 23040, LSB_INTEGER 16-bit, SCALING_FACTOR 0.5, 64 ppd, 90S-90N, 0-360E
    from .sources import LOLA_CYL
    return [CylTile(f"{LOLA_CYL}/LDEM_64.IMG", -90, 90, 0, 360, 64, "<i2", 0.5)]


def _ldem512_north_tiles():
    # LDEM_512_45N_90N_*.LBL: LINES 23040, LINE_SAMPLES 46080, LSB_INTEGER 16-bit, SCALING_FACTOR 0.5, 512 ppd
    from .sources import LOLA_CYL
    return [CylTile(f"{LOLA_CYL}/LDEM_512_45N_90N_{a:03d}_{a + 90:03d}.IMG", 45, 90, a, a + 90, 512, "<i2", 0.5) for a in range(0, 360, 90)]


def cyl_window(tiles: list[CylTile], lat: float, lon: float, radius_km: float, name: str, range_key: str) -> CylRaster:
    """Window of a tiled simple-cylindrical PDS product centred on (lat, lon), +-radius_km, read with
    HTTP multi-range requests (one byte range per image row). Cached under .cache/windows/."""
    ppd = tiles[0].ppd
    dlat = radius_km / (1737.4 * np.pi / 180.0)
    dlon = min(dlat / max(np.cos(np.radians(min(abs(lat) + dlat, 89.0))), 0.05), 180.0)
    lat_hi = min(lat + dlat, max(t.lat_hi for t in tiles))
    lat_lo = max(lat - dlat, min(t.lat_lo for t in tiles))
    lon_c = lon % 360.0
    key = hashlib.sha1(f"{name}|{lat:.5f}|{lon:.5f}|{radius_km}".encode()).hexdigest()[:16]
    cp = WIN_CACHE / f"{name}-{key}.npz"
    if cp.exists():
        z = np.load(cp)
        return CylRaster(z["arr"], float(z["lat_top"]), float(z["lon_left"]), ppd, name)
    top = np.ceil(lat_hi * ppd) / ppd
    bot = np.floor(lat_lo * ppd) / ppd
    left = np.floor((lon_c - dlon) * ppd) / ppd
    right = np.ceil((lon_c + dlon) * ppd) / ppd
    nrow = int(round((top - bot) * ppd))
    ncol = int(round((right - left) * ppd))
    out = np.full((nrow, ncol), np.nan, dtype=np.float32)
    record_range_source(range_key, tiles[0].url.rsplit("/", 1)[0] + "/", f"{name}: row-wise HTTP multi-range reads")
    for t in tiles:
        if t.lat_hi <= bot or t.lat_lo >= top:
            continue
        samples = int(round((t.lon_hi - t.lon_lo) * ppd))
        item = np.dtype(t.dtype).itemsize
        for shift in (-360.0, 0.0, 360.0):
            t_left, t_right = t.lon_lo + shift, t.lon_hi + shift
            il, ir = max(left, t_left), min(right, t_right)
            it, ib = min(top, t.lat_hi), max(bot, t.lat_lo)
            if il >= ir or ib >= it:
                continue
            r0 = int(round((t.lat_hi - it) * ppd)); r1 = int(round((t.lat_hi - ib) * ppd))
            c0 = int(round((il - t_left) * ppd)); c1 = int(round((ir - t_left) * ppd))
            rows = list(range(r0, r1))
            data = []
            for k in range(0, len(rows), 200):
                batch = rows[k:k + 200]
                rngs = [((r * samples + c0) * item, (r * samples + c1) * item - 1) for r in batch]
                data += _multirange_get(t.url, rngs)
            block = np.frombuffer(b"".join(data), dtype=t.dtype).reshape(len(rows), c1 - c0).astype(np.float32) * t.scale_m
            orow = int(round((top - it) * ppd)); ocol = int(round((il - left) * ppd))
            out[orow:orow + block.shape[0], ocol:ocol + block.shape[1]] = block
            log(f"    {name} {t.url.rsplit('/', 1)[1]}: rows {r0}-{r1}, cols {c0}-{c1}")
    out[out < -20000] = np.nan
    np.savez_compressed(cp, arr=out, lat_top=top, lon_left=left)
    return CylRaster(out, top, left, ppd, name)


def sldem_window(lat: float, lon: float, radius_km: float) -> CylRaster:
    """SLDEM2015 512 ppd window (+-60° latitude)."""
    return cyl_window(_sldem_tiles(), lat, lon, radius_km, "SLDEM2015_512", "SLDEM2015_512_TILES")


def ldem64_window(lat: float, lon: float, radius_km: float = 315.0) -> CylRaster:
    """LOLA LDEM_64 (64 ppd, ~474 m at the equator) window for the far field of non-polar sites."""
    return cyl_window(_ldem64_tiles(), lat, lon, radius_km, "LDEM_64", "LDEM_64")


def ldem512_north_window(lat: float, lon: float, radius_km: float) -> CylRaster:
    """LOLA LDEM_512 (45-90°N tiles) window: near field north of SLDEM2015's 60°N limit."""
    return cyl_window(_ldem512_north_tiles(), lat, lon, radius_km, "LDEM_512", "LDEM_512_45N_90N")


def stereo_bbox(lat: float, lon: float, half_m: float):
    x, y = ll_to_xy(lat, lon)
    return (float(x) - half_m, float(y) - half_m, float(x) + half_m, float(y) + half_m)
