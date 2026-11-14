# Methods

Plain-language equations, assumptions, error margins and validation for every number Shadowline stores. This file feeds the Science page. All values were computed offline by `scripts/data-pipeline/` (see its README) and are read from Firestore at runtime; the app makes no live Horizons or PDS calls. Generated numbers below come from `data/seed/_reports/*.json`.

## 1. Coordinates and frames

Frame: Mean Earth / polar axis of DE421 (`MOON_ME`), a sphere of radius R = 1737.4 km, longitude east-positive, azimuth 0 = north and increasing clockwise. Horizons, LOLA, PGDA, SLDEM2015 and LROC products all use this frame and sphere, so no frame conversion is applied anywhere. Site coordinates are the LROC values (Wagner et al. 2017; shapefile updated 2026-08-14), which supersede Apollo-era and Soviet-era published values by 6 m to 7.6 km; the old values are kept as `coordsAsPublished`.

Height datum: PGDA product 90 does not state its datum. Over 4,000 sample points the 240 m map differs from LOLA LDEM_64 (height above the 1737.4 km sphere) by a mean of -0.26 m (rms 11.9 m, driven by resolution), so heights are treated as above the 1737.4 km sphere.

## 2. Ephemeris and topocentric Sun/Earth direction

Stored data: one global series of the sub-solar point, the sub-Earth point, the Sun range r and the Earth range delta, from JPL Horizons (target Moon, observer geocentre, quantities 14, 15, 19, 20; `APPARENT=AIRLESS`), 1 h steps, UTC, 2026-01-01 to 2030-12-31 plus +-7 day windows around catalog landings from 1966. Horizons' ephemeris version (DE441) and the exact query string are stored on every document.

For a site at latitude phi, east longitude lambda and height h above the sphere, and a body at distance D whose sub-point on the Moon is (beta, L):

1. Site frame: up U = (cos phi cos lambda, cos phi sin lambda, sin phi); east E = (-sin lambda, cos lambda, 0); north N = (-sin phi cos lambda, -sin phi sin lambda, cos phi).
2. Body position from the Moon's centre: B = D (cos beta cos L, cos beta sin L, sin beta).
3. Line of sight (includes parallax): v = B - (1737.4 + h) U.
4. Elevation = asin(v.U / |v|). Azimuth = atan2(v.E, v.N), mapped to [0, 360).

Ignoring parallax (treating Earth as infinitely far) gives errors up to 0.27°; for the Sun it is 0.0007°. Between stored samples the Cartesian vectors are interpolated linearly (never raw longitudes: the sub-Earth longitude wraps through 0/360). Measured interpolation error at the 1 h step is about 0.0001°; a 6 h step would be 0.004° and a 24 h step 0.063°, which fails a 0.05° target.

Time scale: Horizons observer tables are UT (UTC after 1962, UT1 before); internal dynamics are TDB; future dates hold the last known leap second constant. Stored and displayed times are UTC. Elevation is relative to the plane perpendicular to the sphere normal; Horizons has no terrain, so terrain comes from the horizon mask.

Known small residuals: the Sun has a constant 0.00018° offset from the 1.28 s Moon-to-Earth down-leg light time (the geocentric table is time-tagged 1.28 s after the lunar instant); the Earth direction has about 0.006° from stellar aberration (Horizons applies the geocentre's velocity to the Earth-Moon line). Both are far below the 0.02° target.

### Client-math validation against direct Horizons (quantity 4)

Five sites x 30 daily epochs at :30 past the hour (2027-03-01 to 2027-03-30), so the stored hourly series must be interpolated. Worst error anywhere: **0.00598°** against a 0.02° target (**pass**). Stage `21_ephemeris_check.py` fails if any error exceeds 0.02°, and vitest re-checks the same fixture in `tests/ephemeris.test.ts`.

| Body | Site | max abs dEl (exact sub-points) | max abs dAz x cos el (exact) | max abs dEl (stored 1 h series, interpolated) | max abs dAz x cos el (interpolated) |
|---|---|---:|---:|---:|---:|
| sun | Apollo 11 (LROC) | 0.00019° | 0.00016° | 0.00019° | 0.00016° |
| earth | Apollo 11 (LROC) | 0.00589° | 0.00129° | 0.00595° | 0.00138° |
| sun | Shackleton rim | 0.00000° | 0.00019° | 0.00001° | 0.00019° |
| earth | Shackleton rim | 0.00048° | 0.00593° | 0.00056° | 0.00598° |
| sun | S-pole -84.8/33.0 | 0.00002° | 0.00019° | 0.00002° | 0.00019° |
| earth | S-pole -84.8/33.0 | 0.00058° | 0.00591° | 0.00052° | 0.00596° |
| sun | Chandrayaan-3 (LROC) | 0.00007° | 0.00019° | 0.00007° | 0.00019° |
| earth | Chandrayaan-3 (LROC) | 0.00147° | 0.00575° | 0.00146° | 0.00580° |
| sun | Chang'e-4 (LROC) | 0.00013° | 0.00018° | 0.00014° | 0.00018° |
| earth | Chang'e-4 (LROC) | 0.00094° | 0.00591° | 0.00088° | 0.00596° |

(Azimuth errors are weighted by cos elevation because azimuth is ill-conditioned near the zenith.)

## 3. Horizon masks (ray casting with curvature)

For each azimuth, walk outward along a **great circle** (not a straight line in the stereographic plane), sample terrain height h(d) from nested DEMs, and take the maximum elevation angle with exact spherical curvature:

    gamma = d / R,   r0 = R + h_obs + dz,   r1 = R + h(d)
    theta(d) = atan2(r1 cos(gamma) - r0, r1 sin(gamma)),   mask(az) = max over d of theta(d)

Curvature drops terrain by about 0.72 km at 50 km, 2.9 km at 100 km and 25.9 km at 300 km, so ignoring it would be badly wrong. Observer height dz is 1 m above the DEM surface (a parameter, so a mast can be added). Rays run to 310 km.

Per-site masks (`sites/<id>/terrain/v1`): 720 azimuths at 0.5° (Barker et al. 2021 §5, after Mazarico et al. 2011). Nested DEMs by regime:

| Regime | Near field | Mid field | Far field (to 310 km) |
|---|---|---|---|
| 5 m (inside a product-78 box with 5 km margin) | PGDA-78 5 m, 0-5 km | PGDA-90 80 m, 5-100 km | PGDA-90 240 m |
| polar (80-90°S) | PGDA-90 20 m COG window, 0-7 km | 80 m, 7-100 km | 240 m |
| 60-80°S | PGDA-90 60 m COG window, 0-20 km | | 240 m, LOLA LDEM_64 beyond it |
| within +-60° | SLDEM2015 512 ppd window, 0-20 km | | LOLA LDEM_64 window |
| north of 60°N | LOLA LDEM_512 window, 0-20 km | | LOLA LDEM_64 window |

Non-polar far field uses LOLA LDEM_64 (about 474 m pixels), which smooths distant peaks; its error is an assumed 20 m and barely affects the mask because far-field obstruction angles are small and errors scale with 1/distance.

**Error margin (derived).** For the obstruction that sets the maximum at slant distance s: sigma_theta = sqrt(sigma_z^2 + sigma_obs^2) cos(theta) / s, with sigma_z from the error raster (`*_toterr`, `LDEM_*_ERR`, or 3-4 m for SLDEM2015). `maskSigma` stores sigma per azimuth; `errorMarginDeg` is 2 x the 95th percentile of sigma. Near-field error dominates. The observer and obstruction errors are combined in quadrature although they are partly correlated, and the nearest sample can be as close as one pixel, so the margin is a **pessimistic upper bound**: it is smallest for 5 m and polar sites and can reach several degrees at SLDEM2015/LDEM_512 sites (largest: 13.5°). `maskP05`/`maskP95` (error-clone percentiles) are null: the 100 product-78 clones per site were not processed.

**Slope.** 80-90°S sites use PGDA's plane-fit slope over a 100 m baseline (`LDRM_80S_50MPP_ADJ_SLP_100M`); other sites use a least-squares plane over 3x3 pixels (about 120-180 m baseline, recorded in each document's notes). Hazard thresholds (NASA HLS update, 1 Aug 2024): landing slope below 10° over 100 m, EVA slope below 20° within 2 km.

## 4. Custom-coordinate terrain grid (`terrainGrid`)

Custom points in 80-90°S snap to the nearest precomputed cell; outside the grid the app uses a smooth-sphere horizon and must show `terrain: "none — smooth horizon"`. Cells are centred on multiples of the spacing in south polar stereographic metres (sphere 1,737,400 m; x = rho sin lambda, y = rho cos lambda): 2 km spacing poleward of 84°S and 5 km between 84°S and 80°S, in 16 x 16-cell tiles. 33,441 cells in 169 tiles were computed in 13.4 min on 8 processes. Each cell has 360 azimuth bins at 1° (int16 centidegrees), a 1-sigma error (uint8, 0.05° steps), slope, nearest-PSR and nearest-cold-trap distance and an inside-PSR flag.

**Coarsening decisions (recorded as the prompt allows).** The grid uses the local 40 m PGDA-90 map for the 0-15 km near field instead of the 20 m COG, because 33,000 20 m window reads were not practical (and the local 20 m map is 2.6 GB). It uses 80 m for 15-100 km and 240 m for 100-310 km. The 40 m product has no error raster, so the 80 m error raster is used for the near field (conservative). Snapping adds up to 1.41 km (2 km cells) or 3.54 km (5 km cells) of position error, reported as `distanceKm` by `snapToGrid`.

## 5. PSRs, cold traps and protection zones

PSR polygons: PGDA product 90 (Barker et al. 2023). The 1,531 PSRs larger than 1 km² in the source shapefile are reduced to 1,529 in `psrLayer` (simplified to 50 m, quadrant tiles under 500 KB): two source polygons are degenerate and contain no valid polygon area after geometry repair, so they are skipped. All 177,589 PSRs of at least 5 pixels (2,000 m²) are used for nearest-distance calculations; smaller ones are ignored because 1-pixel PSRs near 80°S can be about 50% false positives. Distances are Euclidean in the stereographic plane divided by the point scale factor k = 2 / (1 + cos colatitude).

**Cold trap, not ice.** `coldTrapFraction` is the share of a PSR's area (100 m lattice, nearest Diviner triangle centre) whose annual maximum temperature (`temp_max`, Diviner Polar Resource Product, Paige et al. 2010) is below 110 K, the threshold used by Li et al. (2018) and Fisher et al. (2017). A PSR over 1 km² counts as a cold trap at a fraction of at least 0.5. This says temperature allows surface ice; Li et al. found ice exposures in only about 3.5% of cold traps, so the app must never call a PSR "ice-bearing".

Heritage zones (`protectionZones`): NASA (2011, Rev A) recommendations for U.S. Government artifacts only: a 2.0 km descent/landing boundary at each U.S. lander site, 75 m (Apollo 11) and 225 m (Apollo 17) artifact boundaries, 3 m around the other Apollo descent stages, and 0.5 km impact-site boundaries for Ranger, S-IVB and LCROSS sites with LROC coordinates. Non-U.S. sites have no NASA-2011 zone. **PSR buffer:** no published distance supports one. The default of 2.0 km (secondary ring 1.5 km, the Apollo rock-ejecta range) is the NASA 2011 heritage landing stand-off applied by analogy, is a user parameter, and is never a PSR-protection standard. PSR zones are written for the 37 PSRs larger than 100 km² (the full set is in `psrLayer`).

## 6. Illumination, irradiance and power (used by the engine, a later phase)

A body is above the terrain when its elevation exceeds the mask at its azimuth (linear interpolation with wrap-around). The Sun is treated as a point at its disc centre for the lit test; its angular diameter (Horizons quantity 13 from the Moon, about 0.541° in January 2026) is stored per ephemeris chunk. Irradiance S = S0 (1 AU / r)^2 with S0 = 1360.8 +- 0.5 W/m² (Kopp & Lean 2011) and r the Sun range from the ephemeris (about +-3.4% over a year). Array power = S x A x eta x cos(incidence) x a packing/degradation factor; eta = 29.2% BOL (AZUR SPACE 3G30-Advanced, AM0, 28 °C) and the packing factor is a model assumption. The panel area in the teaching-lander preset (1.857 m²) is derived from Vikram's 738 W, not a real panel area. Battery capacity and loads have no published source; they are `null` with `basis: "assumption"` until the team chooses them.

**Profile weights** are the team's starting values, not derived from data: they emphasise what each profile's story chapter teaches (short landing: sunlight and Earth link at touchdown; one-lunar-day robotic: battery survival and sunlight; long-term base: cold-trap access and long continuous sunlight). They are stored in Firestore (`weightsBasis: "assumption"`) and can be tuned without a redeploy. `robotic-14-day` uses one lunar day = half a synodic month = 29.53 d / 2 = 354 h (NSSDC); the id keeps its name for URL stability.

## 7. Validation results

Apollo checks compare Shadowline's computed Sun elevation or azimuth (LROC coordinates, ALSJ landing times, the stored hourly series) with the ALSJ Earth/Sun table (Fjeld and Scotti). **The ALSJ values are computed reconstructions spot-checked against JPL Horizons (the two computations agree to within 0.5°), not in-situ measurements.** ALSJ used older site coordinates (for example Apollo 11 at 0.6875 N, 23.4333 E, 1.27 km from LROC); each check's note reports the value with those coordinates. The Apollo 11 planning check passes when the computed value lies in NASA SP-4029's acceptable range (5°-14°; planned value 10.8°, which is a launch-window design value, not the as-flown angle).

| Check | Site | UTC time | Computed | ALSJ / planning value | Delta | Status |
|---|---|---|---:|---:|---:|---|
| `val-apollo11-sun-elevation` | apollo-11-tranquility | 1969-07-20T20:17:39Z | 10.703° | 10.65 | 0.053 | pass |
| `val-apollo11-sun-azimuth` | apollo-11-tranquility | 1969-07-20T20:17:39Z | 88.805° | 88.81 | -0.005 | pass |
| `val-apollo11-planning-window` | apollo-11-tranquility | 1969-07-20T20:17:39Z | 10.703° | 5-14 range |  | pass |
| `val-apollo12-sun-elevation` | apollo-12-oceanus-procellarum | 1969-11-19T06:54:36Z | 5.148° | 5.19 | -0.042 | pass |
| `val-apollo14-sun-elevation` | apollo-14-fra-mauro | 1971-02-05T09:18:13Z | 10.349° | 10.36 | -0.011 | pass |
| `val-apollo15-sun-elevation` | apollo-15-hadley-apennine | 1971-07-30T22:16:29Z | 12.024° | 12.05 | -0.026 | pass |
| `val-apollo16-sun-elevation` | apollo-16-descartes | 1972-04-21T02:23:35Z | 14.761° | 14.76 | 0.001 | pass |
| `val-apollo17-sun-elevation` | apollo-17-taurus-littrow | 1972-12-11T19:54:58Z | 13.35° | 13.33 | 0.02 | pass |

**Lit-fraction cross-check** (report only). The fraction of hourly steps over the LROC WAC year (15 Feb 2010 - 5 Feb 2011) with the Sun above the mask is compared with the WAC percentage map (float32 PDS IMG; the 8-bit GeoTIFF is a display stretch and is not used). Across 2,869 grid cells poleward of 88°S: correlation **0.958**, mean computed 12.1% vs WAC 11.4% (mean difference +0.7 points), mean absolute difference 1.9 points, 95th percentile 7.7 points, 97% of cells within 10 points. The two catalog points inside 88°S (Slater Plain, de Gerlache Rim 2) are both 0% in the model and in WAC, which agrees but is not informative; the grid-wide statistic is the real test. Remaining differences come from the WAC map's conservative binary threshold and 100 m surface-level sampling versus a 1 m observer and a point-source Sun.

## 8. Limits to keep in the UI

Every Artemis coordinate is an approximate region reference, not a NASA coordinate. Costs are order-of-magnitude. Unsourced values are null and listed in `docs/MISSING_DATA.md`. Terrain masks are only as good as the DEM at the obstruction (see the error margins above), and ephemerides are available only for the stored time spans.
