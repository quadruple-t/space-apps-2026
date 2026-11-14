"""Horizon-mask ray casting (Barker et al. 2021 §5, after Mazarico et al. 2011).

For each azimuth, walk outward along a GREAT CIRCLE (not a straight line in the stereographic
plane), sample terrain height h(d) from nested DEMs, and take the maximum elevation angle with the
exact spherical-curvature formula (terrain-psr-zones.md §A6):

    gamma = d / R,  r0 = R + h_obs + dz,  r1 = R + h(d)
    theta(d) = atan2(r1 cos(gamma) - r0, r1 sin(gamma)),   mask(az) = max_d theta(d)

Error band (terrain-psr-zones.md §A7, derived): sigma_theta ~ sigma_z cos(theta) / s, with s the slant
distance to the obstruction that sets the maximum and sigma_z the DEM height error there, combined
in quadrature with the observer-height error. Near-field error dominates.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .geo import R_M, destination, ll_to_xy


@dataclass
class Band:
    """Distances (d_min, d_max] km sampled every step_km from `sources` (first non-NaN wins);
    `errors` supply sigma_z (m) at the obstruction (raster or constant)."""
    d_min_km: float
    d_max_km: float
    step_km: float
    sources: list
    errors: list = field(default_factory=list)
    label: str = ""

    def distances(self) -> np.ndarray:
        n = int(np.floor((self.d_max_km - self.d_min_km) / self.step_km + 1e-9))
        return self.d_min_km + self.step_km * np.arange(1, n + 1)


def _sample(sources, lat, lon, x, y):
    out = np.full(np.shape(lat), np.nan, dtype=np.float64)
    for s in sources:
        need = np.isnan(out)
        if not need.any():
            break
        v = s.sample(lat[need], lon[need], None if x is None else x[need], None if y is None else y[need])
        out[need] = v
    return out


def _sigma(errors, lat, lon, x, y):
    out = np.full(np.shape(lat), np.nan, dtype=np.float64)
    for e in errors:
        need = np.isnan(out)
        if not need.any():
            break
        if isinstance(e, (int, float)):
            out[need] = float(e)
        else:  # an error raster (e.g. *_ERR.TIF, *_toterr.tif)
            out[need] = e.sample(lat[need], lon[need], None if x is None else x[need], None if y is None else y[need])
    return out


@dataclass
class MaskResult:
    az_deg: np.ndarray
    mask_deg: np.ndarray          # NaN where no terrain sample existed along the ray
    dist_at_max_km: np.ndarray
    sigma_deg: np.ndarray         # 1-sigma error of the mask value
    h_obs_m: float
    sigma_obs_m: float


def horizon_mask(lat0: float, lon0: float, bands: list[Band], n_az: int, dz_m: float,
                 h_obs_m: float | None = None, sigma_obs_m: float | None = None, need_xy: bool = True) -> MaskResult:
    az = np.arange(n_az) * (360.0 / n_az)
    d = np.concatenate([b.distances() for b in bands])
    band_of = np.concatenate([np.full(len(b.distances()), i) for i, b in enumerate(bands)])

    lat, lon = destination(lat0, lon0, az[:, None], d[None, :])
    if need_xy:
        x, y = ll_to_xy(lat, lon)
    else:
        x = y = None
    h = np.full(lat.shape, np.nan)
    for i, b in enumerate(bands):
        cols = band_of == i
        sl = (slice(None), cols)
        h[sl] = _sample(b.sources, lat[sl], lon[sl], None if x is None else x[sl], None if y is None else y[sl])

    if h_obs_m is None or sigma_obs_m is None:
        la0, lo0 = np.array([lat0]), np.array([lon0])
        x0, y0 = ll_to_xy(la0, lo0)
        if h_obs_m is None:
            h_obs_m = float(_sample(bands[0].sources, la0, lo0, x0, y0)[0])
        if sigma_obs_m is None:
            sigma_obs_m = float(_sigma(bands[0].errors, la0, lo0, x0, y0)[0]) if bands[0].errors else 0.0
        if not np.isfinite(sigma_obs_m):
            sigma_obs_m = 0.0
    if not np.isfinite(h_obs_m):
        raise ValueError(f"no DEM height at observer ({lat0}, {lon0})")

    gamma = d * 1000.0 / R_M
    r0 = R_M + h_obs_m + dz_m
    r1 = R_M + h
    cg, sg = np.cos(gamma)[None, :], np.sin(gamma)[None, :]
    theta = np.arctan2(r1 * cg - r0, r1 * sg)
    theta = np.where(np.isnan(theta), -np.inf, theta)
    k = np.argmax(theta, axis=1)
    rows = np.arange(n_az)
    tmax = theta[rows, k]
    valid = np.isfinite(tmax)
    mask = np.where(valid, np.degrees(tmax), np.nan)
    dist = d[k]

    # Error at the obstruction.
    lat_k, lon_k = lat[rows, k], lon[rows, k]
    x_k = None if x is None else x[rows, k]
    y_k = None if y is None else y[rows, k]
    sig_z = np.full(n_az, np.nan)
    for i, b in enumerate(bands):
        sel = band_of[k] == i
        if sel.any() and b.errors:
            sig_z[sel] = _sigma(b.errors, lat_k[sel], lon_k[sel], None if x_k is None else x_k[sel], None if y_k is None else y_k[sel])
    sig_z = np.where(np.isfinite(sig_z), sig_z, 0.0)
    r1k = r1[rows, k]
    s = np.sqrt(r0 ** 2 + r1k ** 2 - 2 * r0 * r1k * np.cos(gamma[k]))
    sig = np.degrees(np.sqrt(sig_z ** 2 + sigma_obs_m ** 2) * np.cos(tmax) / s)
    sig = np.where(valid, sig, np.nan)
    return MaskResult(az, mask, dist, sig, h_obs_m, sigma_obs_m)


def plane_fit_slope_deg(arr: np.ndarray, dx_m: float) -> float | None:
    """Slope (deg) of the least-squares plane through a small height window (rows = -y)."""
    if arr.size < 4 or np.isnan(arr).any():
        return None
    ny, nx = arr.shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    A = np.column_stack([xx.ravel() * dx_m, -yy.ravel() * dx_m, np.ones(arr.size)])
    (a, b, _), *_ = np.linalg.lstsq(A, arr.ravel().astype(np.float64), rcond=None)
    return float(np.degrees(np.arctan(np.hypot(a, b))))
