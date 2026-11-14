"""Decode stored ephemerisGlobal docs and interpolate them exactly like lib/ephemeris (Cartesian lerp)."""
from __future__ import annotations

import base64
import datetime as dt

import numpy as np

from .common import SEED, read_json
from .geo import sph_to_cart, topo_azel, cart_to_sph


def load_chunk(chunk_id: str):
    d = read_json(SEED / "ephemerisGlobal" / f"{chunk_id}.json")
    raw = base64.b64decode(d["data"]["$bytes"])
    arr = np.frombuffer(raw, dtype="<f4").reshape(d["count"], 6).astype(np.float64)
    start = dt.datetime.fromisoformat(d["startUtc"].replace("Z", "+00:00"))
    return d, start, arr


def to_cart(arr):
    sun = sph_to_cart(arr[:, 0], arr[:, 1], arr[:, 2])
    earth = sph_to_cart(arr[:, 3], arr[:, 4], arr[:, 5])
    return sun, earth


class Series:
    """Hourly series assembled from one or more chunks (must be contiguous)."""

    def __init__(self, chunk_ids: list[str]):
        parts = [load_chunk(c) for c in chunk_ids]
        self.start = parts[0][1]
        arr = np.concatenate([p[2] for p in parts])
        self.sun, self.earth = to_cart(arr)
        self.n = arr.shape[0]

    def at(self, t: dt.datetime):
        h = (t - self.start).total_seconds() / 3600.0
        h = np.atleast_1d(h)
        i0 = np.clip(np.floor(h).astype(int), 0, self.n - 2)
        f = (h - i0)[:, None]
        if np.any(h < 0) or np.any(h > self.n - 1):
            raise ValueError("time outside series")
        sun = self.sun[i0] * (1 - f) + self.sun[i0 + 1] * f
        earth = self.earth[i0] * (1 - f) + self.earth[i0 + 1] * f
        return sun, earth

    def at_hours(self, h: np.ndarray):
        i0 = np.clip(np.floor(h).astype(int), 0, self.n - 2)
        f = (h - i0)[:, None]
        return self.sun[i0] * (1 - f) + self.sun[i0 + 1] * f, self.earth[i0] * (1 - f) + self.earth[i0 + 1] * f


def azel_from_cart(site_lat, site_lon, body_cart, h_km=0.0):
    lat, lon, r = cart_to_sph(body_cart)
    return topo_azel(site_lat, site_lon, lat, lon, r, h_km)
