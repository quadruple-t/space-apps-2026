"""Lunar geometry on the 1737.4 km sphere (MOON_ME frame, east-positive longitude).

South polar stereographic convention matches the PGDA products (sphere 1,737,400 m,
centre latitude -90, central meridian 0, true at the pole):
    rho = 2 R tan(colat / 2),  x = rho sin(lon),  y = rho cos(lon)
verified against the PGDA product-78 box centres in docs/research/terrain-psr-zones.md §A2.
"""
from __future__ import annotations

import numpy as np

R_KM = 1737.4
R_M = 1737400.0


def ll_to_xy(lat_deg, lon_deg):
    """South polar stereographic x, y in metres."""
    lat = np.radians(np.asarray(lat_deg, dtype=np.float64))
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    rho = 2.0 * R_M * np.tan((np.pi / 2 + lat) / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy_to_ll(x, y):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    rho = np.hypot(x, y)
    lat = -np.pi / 2 + 2.0 * np.arctan(rho / (2.0 * R_M))
    lon = np.arctan2(x, y)
    return np.degrees(lat), np.degrees(lon)


def scale_factor(lat_deg):
    """Stereographic point scale k = 2 / (1 + cos(colat))."""
    colat = np.radians(90.0 + np.asarray(lat_deg, dtype=np.float64))
    return 2.0 / (1.0 + np.cos(colat))


def destination(lat_deg, lon_deg, az_deg, dist_km):
    """Great-circle destination(s). az is clockwise from north. Broadcasts."""
    p1 = np.radians(lat_deg)
    l1 = np.radians(lon_deg)
    th = np.radians(az_deg)
    d = np.asarray(dist_km, dtype=np.float64) / R_KM
    sp1, cp1 = np.sin(p1), np.cos(p1)
    sd, cd = np.sin(d), np.cos(d)
    sp2 = sp1 * cd + cp1 * sd * np.cos(th)
    p2 = np.arcsin(np.clip(sp2, -1.0, 1.0))
    l2 = l1 + np.arctan2(np.sin(th) * sd * cp1, cd - sp1 * sp2)
    lon2 = (np.degrees(l2) + 180.0) % 360.0 - 180.0
    return np.degrees(p2), lon2


def gc_distance_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def wrap_lon(lon):
    return (np.asarray(lon) + 180.0) % 360.0 - 180.0


def topo_azel(site_lat, site_lon, sub_lat, sub_lon, dist_km, h_km=0.0):
    """Topocentric azimuth (0 = N, clockwise) and elevation (deg) of a body at distance dist_km
    from the Moon's centre above sub-point (sub_lat, sub_lon), seen from a site at height h_km
    above the 1737.4 km sphere. Identical math to lib/ephemeris/topocentric.ts (prompt §5.2)."""
    la, lo = np.radians(site_lat), np.radians(site_lon)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la) * np.ones_like(lo)], axis=-1)
    east = np.stack([-np.sin(lo), np.cos(lo), np.zeros_like(lo)], axis=-1)
    north = np.stack([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la) * np.ones_like(lo)], axis=-1)
    b = sph_to_cart(sub_lat, sub_lon, dist_km)
    v = b - (R_KM + h_km) * up
    n = np.linalg.norm(v, axis=-1)
    el = np.degrees(np.arcsin(np.sum(v * up, axis=-1) / n))
    az = np.degrees(np.arctan2(np.sum(v * east, axis=-1), np.sum(v * north, axis=-1))) % 360.0
    return az, el


def sph_to_cart(lat_deg, lon_deg, r):
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    r = np.asarray(r, dtype=np.float64)
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], axis=-1)


def cart_to_sph(v):
    v = np.asarray(v, dtype=np.float64)
    r = np.linalg.norm(v, axis=-1)
    lat = np.degrees(np.arcsin(v[..., 2] / r))
    lon = np.degrees(np.arctan2(v[..., 1], v[..., 0]))
    return lat, lon, r
