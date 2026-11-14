# Shadowline: Sun/Earth ephemeris research (JPL Horizons, client-side az/el, Firestore sizing)

Date of research: 2026-11-14. Every API response used below is cached as JSON in
`horizons-spot-check/responses/` (regenerated on rerun; gitignored; summary outputs in `horizons-spot-check/results/`) (each file contains its `_url`). Scripts are in `horizons-spot-check/`
(`hz.py` helper, `a11.py`, `subtest.py`, `compare.py`, `steptest.py`, `sizes.py`, `libr.py`, `limit.py`).
Source pages were downloaded to a local scratch folder (not committed) and read there.

Sources opened:
- [H-API] Horizons API doc: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- [H-MAN] Horizons manual: https://ssd.jpl.nasa.gov/horizons/manual.html
- [H-FAIR] SSD/CNEOS API index (Fair Use Policy): https://ssd-api.jpl.nasa.gov/
- [FS-Q] Firestore quotas: https://firebase.google.com/docs/firestore/quotas (page "Last updated 2026-11-12 UTC")
- [FB-P] Firebase pricing: https://firebase.google.com/pricing
- [FS-SZ] Firestore storage size: https://firebase.google.com/docs/firestore/storage-size (last updated 2026-11-12)
- [FS-DT] Firestore data types: https://firebase.google.com/docs/firestore/manage-data/data-types (last updated 2026-11-12)
- [LOLA] LOLA RDR PDS catalog: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/rdr_ds.cat
  and polar map catalog `.../catalog/dsmap_polar.cat`

---

## 1. Confirmed Horizons parameter set

### 1.1 Topocentric site on the Moon

| Parameter | Value | Source / evidence |
|---|---|---|
| `CENTER` | `'coord@301'` | [H-API] "CENTER ... the string 'coord' (which tells the system to use coordinate information stored in parameters SITE_COORD and COORD_TYPE)"; [H-MAN] "coord @ 502" form. Worked in every query below. |
| `COORD_TYPE` | `'GEODETIC'` (default) or `'CYLINDRICAL'` | [H-API] parameter table |
| `SITE_COORD` | `'E-lon,lat,alt'` = degrees, degrees, km | [H-MAN]: GEODETIC triplet is "E-long ... (DEGREES), lat ... (DEGREES), h - Altitude above reference ellipsoid (km)" |
| Longitude sign | **East-positive** for the Moon | [H-MAN]: Earth, Moon and Sun are "prograde exceptions" requiring "+ east-longitude"; a negative value is accepted and converted to 360+value. Confirmed: our `SITE_COORD='-137.31,-89.45,0'` ran fine. Output header echoes `{E-lon(deg),Lat(deg),Alt(km)}`. |
| Altitude reference | Height above the reference surface, which for the Moon is a **sphere R = 1737.4 km** | Response header: `Center radii : 1737.4, 1737.4, 1737.4 km`. Not terrain. |
| Lunar frame | **Mean Earth / polar axis of DE421 (MOON_ME)**, valid 1550 to 2650 | [H-MAN]: "Horizons uses planetodetic/geodetic IAU coordinates (or mean Earth of DE421 for the Moon)"; "The lunar PA frame is not currently available in Horizons"; high-precision lunar model "available only over the timespan A.D. 1550 - 2650". Response header: `Center pole/equ : MEAN_ME (high precision)`. Ephemeris source in header: `{source: DE441}` ([H-MAN]: "currently DE440/441"). |
| `QUANTITIES` for az/el | `'4'` = apparent azimuth and elevation | [H-MAN] item 4: "Adjusted for light-time, the gravitational deflection of light, stellar aberration, precession and nutation ... Azimuth is measured clockwise from north: North(0) -> East(90) -> South(180) -> West(270). Elevation angle is with respect to plane perpendicular to local zenith direction. TOPOCENTRIC ONLY." |
| Refraction | `APPARENT='AIRLESS'` (default). `REFRACTED` is ignored off-Earth. | [H-API] "toggles refraction correction of apparent coordinates (Earth topocentric only)"; [H-MAN] "No refraction effects are modeled for non-Earth sites. Any request for refraction is ignored". Header: `Atmos refraction: NO (AIRLESS)`. |
| Time scale | Observer tables: input/output **UT** (default) or **TT** via `TIME_TYPE`. UT means UTC after 1962, UT1 before. Internally TDB. | [H-API] TIME_TYPE "observer tables: UT or TT"; [H-MAN] time-scale section; response text: "Times AFTER 1962 are in UTC"; "the last known leap-second is used as a constant over future intervals"; "Time tags refer to the UT time-scale conversion from TDB on Earth regardless of observer location". |
| Useful extras | `CSV_FORMAT='YES'`, `EXTRA_PREC='YES'`, `RANGE_UNITS='KM'`, `TIME_DIGITS='SECONDS'`, `OBJ_DATA='NO'` | [H-API] |

"Elevation" therefore means the geometric angle above the plane perpendicular to the sphere normal at the
site (the "astronomical horizon" of a smooth 1737.4 km sphere). Horizons has no terrain. Local horizon
masking must come from the DEM. The `alt` term in `SITE_COORD` only moves the observer radially.

### 1.2 Sub-solar and sub-Earth points (for the global series)

- Quantity **14** = "Observer sub-longitude & sub-latitude": the point on the **target** whose disc
  centre the **observer** sees. Quantity **15** = "Solar sub-longitude & sub-latitude" on the **target**,
  with "Light travel-time from Sun to target and from target to observer ... taken into account" [H-MAN].
  Quantity 19 = Sun range from target (`r`); 20 = target range from observer (`delta`) [H-MAN].
- **Do not use `CENTER='500@301'` with target Sun/Earth.** Tested: with the Moon centre as observer and
  the Sun as target, quantity 14 returned the sub-observer point **on the Sun** (header
  `Target pole/equ : IAU_SUN`), which is useless here (`subtest.py`, case A).
- **Working query (one request gives both sub-points + both ranges):** target = Moon, observer = geocentre.
  - Quantity 14 then gives the sub-Earth point on the Moon, 15 the sub-solar point on the Moon,
    19 the Sun–Moon distance, 20 the Earth–Moon distance.
  - Header confirms `Target pole/equ : MOON_ME {East-longitude positive}` and `Target radii : 1737.4, 1737.4, 1737.4 km`,
    so planetodetic = planetocentric latitude (sphere).

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&CENTER='500@399'
  &OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&TIME_TYPE='UT'&APPARENT='AIRLESS'
  &CSV_FORMAT='YES'&EXTRA_PREC='YES'&RANGE_UNITS='KM'
  &START_TIME='2027-03-01%2000:00'&STOP_TIME='2027-05-01%2000:00'&STEP_SIZE='10%20m'
  &QUANTITIES='14,15,19,20'
```
CSV columns: `Date, , , ObsSub-LON, ObsSub-LAT, SunSub-LON, SunSub-LAT, r, rdot, delta, deldot`.

- Alternative tested (case C): observer = Sun centre (`500@10`), target Moon, quantity 14. This gives a
  sub-solar longitude 0.077° different (102.858° vs 102.781° at the Apollo 11 instant), because the
  table is time-tagged at reception **at the Sun** (about 8.4 min later). Do not use it.

### 1.3 Limits and fair use
- **Row limit (measured):** a 2026-01-01..2036-12-31 @ 1 h request returned
  `Output length exceeded, 93204 times requested, max. is 90000`. So **≤ 90,000 output times per request**.
  2026–2030 @ 1 h is 43,824 rows, so one request fits, but one request per year is gentler.
- TLIST: "up to 10,000 discrete output times, though URL length limits may impose smaller limits" [H-API].
- Fair use [H-FAIR]: "You agree to submit only one API request at a time (no simultaneous requests)";
  cache and reuse results; back off on errors; "JPL may rate-limit, throttle, or block access". No numeric
  requests-per-second figure is published that I could find.
- HTTP 503 = "temporary overloading or maintenance"; input errors come back as HTTP 200 with the error in
  the payload, so check for `$$SOE` [H-API].

---

## 2. Spot checks

### 2.1 Apollo 11 landing instant, 1969-07-20 20:17:40 UTC (direct Horizons topocentric)

Query (Sun; Earth is the same with `COMMAND='399'`):
```
https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='10'&OBJ_DATA='NO'&MAKE_EPHEM='YES'
  &EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='23.47297,0.67408,0'
  &TLIST='1969-07-20%2020:17:40'&TLIST_TYPE='CAL'&TIME_TYPE='UT'&TIME_DIGITS='SECONDS'
  &QUANTITIES='4,20'&APPARENT='AIRLESS'&CSV_FORMAT='YES'&EXTRA_PREC='YES'&RANGE_UNITS='KM'
```

Raw result lines (`Date, sun-flag, interferer-flag, Az, El, delta km, deldot km/s`):

| Site | Target | Raw line |
|---|---|---|
| 23.47297 E, 0.67408 N, 0 km | Sun | `1969-Jul-20 20:17:40.000,*,i,   88.805478904,      10.703141363,  1.5187128779E+08,  0.7411974,` |
| same | Earth | `1969-Jul-20 20:17:40.000,*,i,  272.195384908,      59.224404709,  3.8793905939E+05, -0.0555986,` |
| 23.47314 E, 0.67416 N, 0 km | Sun | `1969-Jul-20 20:17:40.000,*,i,   88.805495353,      10.703312982,  1.5187128778E+08,  0.7411974,` |
| same | Earth | `1969-Jul-20 20:17:40.000,*,i,  272.195240985,      59.224237268,  3.8793906198E+05, -0.0555986,` |

Parsed values:
- Sun: **az 88.8055°, el 10.7031°** (or 10.7033° with the alternate coordinate).
- Earth: **az 272.1954°, el 59.2244°**, range 387,939 km.
- The two coordinate choices differ by less than 0.0002°.

Client math from the geocentric sub-point row at the same instant gives these values (raw:
`ObsSub-LON 352.840302, ObsSub-LAT 1.698770, SunSub-LON 102.781389, SunSub-LAT 1.298877,
r 1.518716093E+08, delta 3.8950412224E+05`):
- Sun: az 88.80548°, el **10.70296°** (Δel = 0.00018°).
- Earth: az 272.19535°, el 59.22657° (Δel = 0.0022°).

### 2.2 Client math vs direct Horizons topocentric: 5 sites × 145 epochs (2027-03-01 to 2027-03-31, every 5 h)

`compare.py`. It ran one sub-point query and 10 topocentric queries (5 sites × Sun/Earth), with
`SITE_COORD='lon,lat,0'`. Results are in `ephem-responses/compare-results.json`.

| Body | Site (lat, E-lon) | max abs dAz | max abs dAz·cos(el) | max abs dEl | mean abs dEl |
|---|---|---|---|---|---|
| Sun | Apollo 11 (0.674, 23.473) | 0.00490° * | 0.00015° | 0.00019° | 0.00018° |
| Sun | Shackleton rim (-89.45, -137.31) | 0.00019° | 0.00019° | 0.00000° | 0.00000° |
| Sun | (-84.8, 33.0) | 0.00019° | 0.00019° | 0.00002° | 0.00001° |
| Sun | (-69.37, 32.32) | 0.00020° | 0.00019° | 0.00007° | 0.00004° |
| Sun | (-45.46, 177.59) | 0.00026° | 0.00018° | 0.00013° | 0.00009° |
| Earth | Apollo 11 | 0.00394° | 0.00130° | 0.00589° | 0.00358° |
| Earth | Shackleton rim | 0.00594° | 0.00594° | 0.00048° | 0.00024° |
| Earth | (-84.8, 33.0) | 0.00596° | 0.00592° | 0.00058° | 0.00030° |
| Earth | (-69.37, 32.32) | 0.00610° | 0.00576° | 0.00147° | 0.00075° |
| Earth | (-45.46, 177.59) | 0.00832° | 0.00592° | 0.00095° | 0.00038° |

\* Sun near zenith at the equatorial site, where azimuth is ill-conditioned. The cos(el)-weighted error is 0.00015°.

**All sites, all epochs (n = 725 per body):**
- Sun: max |dAz| 0.0049°, mean 0.00017°; max |dEl| 0.00019°, mean 0.00006°.
- Earth: max |dAz| 0.0083°, mean 0.0035°; max |dEl| 0.0059°, mean 0.0011°.
- **Worst case for either body: under 0.01°.**

**Frame check:**
- The topocentric run reports `Center pole/equ : MEAN_ME (high precision)`. The sub-point run reports
  `Target pole/equ : MOON_ME`.
- Agreement to 0.0002° for the Sun shows these are the same body-fixed frame. There is no frame mismatch
  and no fix is needed.
- LOLA products use the same frame and sphere [LOLA]: rdr_ds.cat transforms to "the DE421 Moon
  Mean-Earth and Rotation Pole (MOON_ME) orientation model". dsmap_polar.cat: "The LOLA Team adopts a
  spherical geometry with a radius of 1737.4 km".

**Explained residuals:**
- Sun: a constant 0.00018° comes from the 1.28 s down-leg light time Moon→Earth. The geocentric table is
  time-tagged 1.28 s after the lunar instant, and the sub-solar point moves about 0.508°/h.
  - Optional fix: subtract quantity 21 (down-leg LT) from the time tags.
- Earth: about 0.006° comes from stellar aberration. Horizons applies the geocentre's SSB velocity to the
  Earth→Moon line, while a lunar observer would apply the Moon's. Since v_Earth ≈ v_Moon, reversing the
  line doubles rather than cancels the roughly 20" aberration term.
  - This is well under 0.05°. Leave it, or document it.

### 2.3 Time step for the global series

`steptest.py`:
- Truth is a 10-min series (2027-03-01 to 2027-05-01, 8,785 rows, two full libration cycles).
- The series was subsampled at each step, interpolated on Cartesian vectors (linear, and cubic
  Catmull–Rom), then converted back to lat/lon/dist.
- Errors were measured as direction angle and as az/el at the 5 sites. All values are max errors in degrees.

| Step | Method | Sun direction | Earth direction | Sun max dEl | Earth max dEl | Earth max dAz·cos el |
|---|---|---|---|---|---|---|
| 1 h | linear | 0.00002 | 0.00011 | 0.00002 | 0.00009 | 0.00010 |
| 2 h | linear | 0.00006 | 0.00044 | 0.00006 | 0.00034 | 0.00039 |
| 3 h | linear | 0.00014 | 0.00098 | 0.00014 | 0.00077 | 0.00087 |
| 6 h | linear | 0.00054 | 0.00393 | 0.00054 | 0.00306 | 0.00347 |
| 6 h | cubic | 0.00014 | 0.00003 | 0.00014 | 0.00003 | 0.00003 |
| 12 h | linear | 0.00218 | 0.01570 | 0.00217 | 0.01222 | 0.01386 |
| 12 h | cubic | 0.00111 | 0.00026 | 0.00111 | 0.00023 | 0.00025 |
| 24 h | linear | 0.01164 | **0.06280** | 0.01135 | 0.04892 | 0.05524 |
| 24 h | cubic | 0.00890 | 0.00210 | 0.00890 | 0.00181 | 0.00201 |

**Recommendation:**
- **1 h step with linear interpolation:** max interpolation error about 0.0001°, total about 0.01° with the
  method residual. Storage is trivial (section 3), and linear lerp is the simplest client code.
- A 6 h step with linear lerp still meets the 0.05° target (0.004°).
- 24 h linear is the first step that fails (0.063° for Earth).
- Interpolate unit vectors (or Cartesian vectors), never raw longitudes: the sub-Earth longitude wraps
  through 0/360.

---

## 3. Storage and Firestore

### 3.1 Payload per sample
Six values per sample: sub-Sun lat, lon, dist; sub-Earth lat, lon, dist. As Float32 that is 24 bytes.
Measured Float32 rounding error on real data:
- Longitudes: 1.5e-5°.
- Latitudes: under 3e-7°.
- Earth distance: 0.016 km.
- Sun distance: 8 km, which is irrelevant because Sun parallax is 0.0007° (`libr.py`).

Store the time implicitly as `t0 + i*step` (UTC).

### 3.2 Totals
Main span 2026-01-01 00:00 to 2030-12-31 23:00 UTC is 1,826 days.

**Historical landing windows are an assumption here, not a researched list.** I used 20 windows × 15 days
= 300 days. Scale linearly for the real list.

JSON size was measured on real data: values rounded to 4 dp deg, 0.1 km for Earth and 1 km for Sun gave
36,991 chars per 744 samples, about 49.7 B per sample.

| Step | Samples (main + hist) | Float32 raw | Base64 string | JSON number array (rounded) | Firestore number array, stored (8 B per double [FS-SZ]) |
|---|---|---|---|---|---|
| 1 h | 43,824 + 7,200 = 51,024 | 1.22 MB | **1.63 MB** | ~2.54 MB | 2.45 MB |
| 6 h | 7,304 + 1,200 = 8,504 | 204 KB | **272 KB** | ~423 KB | 408 KB |

**Per-month document at 1 h** (31 days, 744 samples):
- Float32: 17,856 B.
- Base64: 23,808 chars (Firestore string = UTF-8 bytes + 1 [FS-SZ]).
- Rounded JSON: 36,991 chars.
- Firestore number array: 35,712 B.

Each format is far below 500 KB, so **chunk per month: 60 docs for 2026–2030 + about 20 docs for the
historical windows ≈ 80 docs, each about 24 KB**. A per-year doc would also fit as base64 (280 KB).

Firestore notes, all from opened pages:
- Firestore has a native **Bytes** type. Its stored size is the "Byte length" [FS-SZ], and the value may be
  up to 1,048,487 bytes [FS-DT].
  - Bytes saves 25% over base64 strings. Either is fine at this size.
- **Avoid big number arrays unless the field is exempted from indexing.**
  - [FS-Q]: "Maximum number of index entries for each document: 40,000" and "Maximum size of a document:
    1 MiB (1,048,576 bytes)".
  - A monthly 1 h number array has 4,464 elements. Each gets an index entry unless exempted, which bloats
    storage and write cost.
  - A yearly array (52,560 values) would exceed 40,000.
  - Bytes/strings index only the first 1,500 bytes ("Field values over 1500 bytes are truncated" [FS-Q]),
    so a single blob field avoids this.

### 3.3 Spark (no-cost) quotas, cited
From [FS-Q] "Free quota" table (Standard edition), cross-checked on [FB-P]:

| Quota | Free amount |
|---|---|
| Stored data | 1 GiB (total) |
| Document reads | 50,000 per day |
| Document writes | 20,000 per day |
| Document deletes | 20,000 per day |
| Outbound data transfer (network egress) | 10 GiB per month |

Additional rules from [FS-Q]:
- "Quotas are applied daily and reset around midnight Pacific time."
- "Cloud Firestore allows exactly one free database per project."
- TTL deletes, PITR, backups, restore and clone operations "don't include free usage".
- 200 single-field index configurations without billing.

[FB-P] also lists Enterprise edition free amounts: 40K write units/day, 50K read units/day, and 1 GiB /
10 GiB the same.

**Usage at 1 h, monthly docs:**
- About 2 MB stored (0.2% of 1 GiB).
- About 80 one-time writes.
- 1 read per month viewed per client. With caching, the 50K reads/day cap allows tens of thousands of
  month-views per day.
- Egress: about 24 KB per doc, so 10 GiB/month ≈ 440K doc fetches.
- Spark is comfortably sufficient.

(Side note, not researched: at about 1.2–1.6 MB total, the series could also be shipped as a static asset
with zero Firestore reads.)

---

## 4. Client-math algorithm (browser)

Inputs:
- Site: latitude φ, east longitude λ (MOON_ME, degrees), height h (km above the 1737.4 km sphere; DEM height is fine).
- For time t: interpolated sub-point latitude β, east longitude L, distance D (km), for each of Sun and Earth.

Steps:
1. Site frame on the sphere (Moon-fixed ME Cartesian, x toward 0°E on the equator, z toward the north pole):
   - Up `U = (cosφ cosλ, cosφ sinλ, sinφ)`
   - East `E = (−sinλ, cosλ, 0)`
   - North `N = (−sinφ cosλ, −sinφ sinλ, cosφ)`
2. Body position from the Moon centre: `B = D·(cosβ cosL, cosβ sinL, sinβ)`.
3. Topocentric vector (includes parallax): `v = B − (1737.4 + h)·U`.
4. Elevation: `el = asin( (v·U) / |v| )`.
5. Azimuth: `az = atan2( v·E, v·N )`, mapped to [0, 360). 0 = north, 90 = east (clockwise), matching Horizons quantity 4.
6. Interpolation between stored samples (step Δ):
   - Convert each stored (β, L, D) to Cartesian B.
   - Lerp B between the bracketing samples (or Catmull–Rom), then use the result directly in step 3.
   - Precompute Cartesian per sample once on load.

Plain language: the Sun or Earth sits at distance D straight "above" the sub-point. Subtract the site's own
position vector to get the line of sight from the site. Its component along the local vertical gives
elevation. Its east and north components give azimuth.

Parallax matters for Earth: ignoring D (treating Earth as infinitely far) gives errors up to **0.27°**.
For the Sun the error is 0.0007°.

---

## 5. Facts for the METHODS doc

- **Time scale:**
  - Store and display UTC.
  - Horizons observer tables use UT (UTC after 1962, UT1 before) or TT. Internal dynamics are in TDB.
  - Future UTC uses the last known leap second as constant, so a future leap second would shift tags by
    1 s, which is negligible.
  - Time tags are Earth UT "regardless of observer location" [H-MAN].
  - EOP predictions in the header (`PREDICTS-> 2027-FEB-08`) affect Earth-surface sites only, not the
    geocentre/Moon geometry used here.
- **Apparent vs geometric:**
  - Quantity 4 is apparent: light-time, gravitational deflection, stellar aberration, precession and
    nutation are applied; no refraction (airless Moon).
  - The Sun is seen where it was about 8.3 min earlier.
  - Sub-points from quantities 14/15 are apparent and light-time corrected [H-MAN].
  - The aberration mismatch noted in section 2.2 accounts for about 0.006° in the Earth direction.
- **Libration:**
  - The Earth is not fixed in the lunar sky. In Mar–Apr 2027 the sub-Earth point ranged over longitude
    −5.6° to +5.4° and latitude −6.7° to +6.7° (`libr.py`, Horizons data).
  - Earth–Moon distance ranged 366,461–405,183 km.
  - At the south pole this moves Earth's elevation by several degrees around 0°. This is why Earth
    visibility from polar sites comes and goes on a monthly cycle, and why the series must be
    time-resolved, not a fixed direction.
  - The sub-solar latitude stayed within +0.57° to +1.55° (lunar obliquity to the ecliptic is small), which
    keeps the Sun grazing at the pole.
- **Sphere vs ellipsoid:**
  - Horizons itself models the Moon as a **sphere of 1737.4 km** (all three radii equal in every header),
    and LOLA uses the same sphere and MOON_ME frame [LOLA].
  - A sphere-based client therefore matches Horizons to **under 0.01°** (measured). The residual is
    aberration and time-tag effects, not shape.
  - Real terrain is not in Horizons. Elevation is relative to the plane normal to the sphere radius.
    Local slopes and horizon masks must come from the DEM.
  - Raising the site by h km changes Earth's direction by at most about h/D rad. For h = 5 km that is
    about 0.0008°.
- **Frame:**
  - MOON_ME (DE421 mean-Earth/polar axis), east-positive longitude, valid 1550–2650.
  - The principal-axis (PA) frame is not available in Horizons [H-MAN]. If any input data were in PA
    coordinates it would need the fixed PA→ME rotation. LOLA is already ME, so this is not needed.

## 6. Caveats

- Azimuth is ill-conditioned near el = ±90°. Compare errors as dAz·cos(el).
- Pre-1962 dates are UT1 in Horizons. The landing-window list was not researched here; I assumed
  20 × 15 days.
- Do not query Horizons from the browser. Precompute offline, one request at a time [H-FAIR].
- Whole-sky and terrain shadowing need a horizon mask from LOLA. Horizons elevation > 0 does not mean
  the site is sunlit.
