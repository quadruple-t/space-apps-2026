# SHADOWLINE: FIRESTORE DATA LAYER + DATA PIPELINE

Agent prompt, revision 2 (2026-11-14). Give this whole file to your coding agent.

Revision 2 replaces the first Firestore prompt. It adds three things:

- **Everything in Firestore.** The app reads every displayed value from Cloud Firestore. It makes no runtime calls to Horizons, PDS or anything else.
- **Research results.** The source research is done, with citations, in `docs/research/`.
- **This repo's stack.** The repo is Next.js 16, not Vite.

Every number in this prompt traces to a source listed in `docs/research/*.md`. Each was retrieved on 2026-11-14 unless noted.

---

## 0. Your role and the goal

You are a senior full-stack engineer with scientific-computing experience. Build three things:

1. **An offline data pipeline.** Put it in `scripts/data-pipeline/` (Python). It downloads, precomputes and validates every dataset the app displays, and writes Firestore-ready JSON to `data/seed/`.
2. **The Firestore data layer.** That means the schema, security rules, indexes, an extended seed script, a typed client layer, Google auth and emulator config.
3. **The client-side ephemeris decoder.** Put it in `lib/ephemeris/`. It turns the stored global Sun/Earth sub-point series into local azimuth and elevation for any lunar coordinate. This is part of reading the data, so it belongs to this task.

This is a build task. Do the work, run the commands and verify the results. Stop to ask only when section 1 blocks you.

**Out of scope:** the UI, the 3D scene, and the simulation engine (illumination, power simulation, scoring). Another phase builds those on top of what you deliver.

---

## 1. Hard constraints (read first)

### 1.1 Account

Create everything under **taran.duba3@gmail.com** only.

- Run `firebase login:list`. If that account is missing, run `firebase login:add taran.duba3@gmail.com`, or `firebase login --reauth` if the session is stale. If you can't complete an interactive login, STOP and give the user the exact command to run.
- Pass `--account taran.duba3@gmail.com` on **every** firebase command.
- For gcloud and Application Default Credentials (used by the prod seed), run `gcloud auth list`. If needed, run `gcloud auth login taran.duba3@gmail.com` and then `gcloud auth application-default login` as that same account.
- After creating the project, confirm it appears in `firebase projects:list --account taran.duba3@gmail.com`.
- Never print or commit credentials, tokens or service-account keys.

The Firebase MCP tools may be available in your session. If you use them, confirm the active account is the one above first.

### 1.2 Project

- Create a NEW project: `firebase projects:create shadowline-<4 random chars> --display-name "Shadowline" --account taran.duba3@gmail.com`. Retry with new characters if the id is taken.
- Stay on the **Spark** plan and never enable billing.
- Create the Firestore `(default)` database in Native mode, location `us-east1`.

### 1.3 Versions

The Firebase CLI changes between versions. Run `firebase <cmd> --help` before any command you are unsure of. Use the modular Firebase JS SDK (v9+), never the compat SDK.

### 1.4 No fabricated science

- Every stored scientific value carries a source: URL, product or version, and retrieval date.
- Unsourced values stay `null` and are listed in `docs/MISSING_DATA.md`.
- Never fill a number from memory.
- Model assumptions, such as default battery size, are allowed only when stored with `basis: "assumption"` and a one-line rationale. The UI must be able to show "assumed".

### 1.5 Repo first

This repo is **Next.js 16.4 (App Router, Turbopack, `cacheComponents` and `partialPrefetching` on), React 19, TypeScript, Tailwind v4, three.js / R3F**.

- Read `CLAUDE.md`, `README.md`, `next.config.ts`, `lib/horizon.ts`, `data/*.ts` and `app/` before changing anything.
- There is **no `src/` directory**. Code lives in root-level `app/`, `lib/`, `data/`, `hooks/` and `components/`. Use the `@/` alias.
- There is **no test runner**. Add `vitest` for the rules tests and the ephemeris math tests.
- Verify with `npm run lint` and `npm run build`. Preserve every behaviour `CLAUDE.md` lists.
- `.gitignore` ignores `.env*`. Add `!.env.example` so the example file can be committed.

### 1.6 Do not commit raw DEMs or other multi-GB inputs

Download them into `scripts/data-pipeline/.cache/` (gitignored), process them, and commit only derived outputs.

Record every download in `scripts/data-pipeline/manifest.lock.json` with: URL, bytes, sha256, HTTP Last-Modified or ETag, and retrievedAt.

### 1.7 Horizons fair use

JPL asks for "only one API request at a time (no simultaneous requests)" and for clients to cache and reuse results. Make all Horizons calls sequential, cached on disk, with back-off.

The API returns input errors as HTTP 200, so check for `$$SOE` in every response. It caps output at **90,000 times per request** (measured).

---

## 2. Decisions already made

1. **All displayed data comes from Firestore at runtime.**
   - This includes ephemerides, horizon masks, PSR geometry, the Home demo series and the validation results.
   - The app makes no external API calls.
   - Static files are allowed only for code and design assets, never for data.
   - This replaces the first prompt's "heavy data ships as static JSON" rule.
2. **Stack:** Next.js (this repo).
   - Env vars are `NEXT_PUBLIC_FIREBASE_*` in `.env.local`, plus `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR`.
   - Firebase is client-only: initialise it in a module imported only from `"use client"` components or hooks.
   - With `cacheComponents` on, wrap data-driven client islands in `<Suspense>`.
3. **Custom coordinates (handoff §6.2 J): option (b).**
   - Store ONE global time series of the sub-solar point, the sub-Earth point and both distances. Compute topocentric azimuth and elevation in the browser.
   - Terrain masks for custom points come from a precomputed **south-polar grid**: snap to the nearest cell.
   - Outside the grid, the app uses a smooth-sphere horizon and must flag it: `terrain: "none — smooth horizon"`.
   - This approach was validated live against Horizons (section 5.2): **maximum error under 0.01°**.
4. **Firestore and auth.**
   - New project, Spark plan.
   - User state (story progress, saved sessions, saved report summaries) is tied to Google sign-in.
   - Signed-out visitors read all static content and keep progress in localStorage under the key `shadowline.progress.v1`. On first sign-in that progress merges into Firestore, so judges never hit a login wall.
5. **Research is done.** Use the values below and the files in `docs/research/`. Do not re-research a value unless a check fails or the file says UNSOURCED.

### 2.1 Facts from the research that change product copy (tell the user; don't silently rewrite UI)

- **Artemis III is no longer a landing.**
  - Per NASA's 27 Feb 2026 release, it is a 2027 crewed test flight in low Earth orbit.
  - **Artemis IV (early 2028) is the first crewed landing.**
  - NASA's Artemis IV page still names the **nine** south-pole candidate regions announced on 28 Oct 2024.
  - Rename the site family `artemis-iii-candidate` to `artemis-candidate`. Write Chapter 3 copy as "Artemis-era candidate regions (Artemis IV, first crewed landing)".
- **The Home tagline is not accurate.**
  - The current line is "Landing on the Moon fails when the site and date are wrong. Chandrayaan-2, IM-1 and SLIM all show it."
  - None of those three failed because of the site or date. Chandrayaan-2's lander slowed more than designed in descent (ISRO). IM-1's laser rangefinders had a safety switch left on. SLIM lost an engine nozzle about 50 m up and still landed about 55 m from target.
  - Defensible replacement: *"Where and when you land decides whether your lander gets power, warmth and a link home."* The supporting examples are SLIM, IM-2, Chandrayaan-3 and Apollo. See `docs/research/power-costs-outcomes.md` §7.
- **"One failed landing costs $100M+" is true only as an order of magnitude.**
  - Use: *"A single lunar landing attempt typically costs on the order of $100 million."*
  - Examples: Beresheet about $100M, Peregrine $107.9M and IM-1 $122.0M. The last two are NASA task-order values, not full mission costs.
- **Ice: say "cold trap", not "ice-bearing".**
  - No downloadable, defensible per-crater ice detection product exists.
  - The flag is a *cold trap*: annual maximum temperature below 110 K (Diviner). UI wording: "Cold trap (Tmax < 110 K, Diviner)".

---

## 3. Product context (summary)

**Story Mode** has 3 chapters:

| Chapter | Concept | Unlocks |
|---|---|---|
| Ch1 First Landing (Apollo era) | Sun angle and lighting | `horizon-dial` |
| Ch2 Robotic Explorer (commercial landers) | Solar power, batteries, Earth comms | `power-simulator` |
| Ch3 Lunar Base (Artemis era) | Ice, long sunlight, survival | `base-scoring` |

Finishing all three opens Mission Control. Experts can skip ahead from Home, which sets `expertMode` to true.

**Mission Control:**
- Pick a site from the library or enter custom lat/lon.
- Set a date window and scrub time.
- Choose a mission profile.
- Compare 2–3 sites.
- Panels: horizon dial, sun elevation, battery state of charge, Earth visibility windows, time to sunset/Earthset.
- Export PDF or CSV.

**Other pages:** Site Library, Science & Methods (sources, equations, validation), Impact & Responsibility (costs, protection zones, social).

The existing routes are `/`, `/mission`, `/explore`, `/compare` and `/science`. Add `/sites`, `/impact` and `/control` when the UI phase needs them. That is not part of this task.

---

## 4. Data flow

```
OFFLINE (scripts/data-pipeline, Python, run by a human)
  JPL Horizons API ──► global sub-Sun / sub-Earth series (1 h) ──┐
  LOLA DEMs (PGDA 90/78, SLDEM2015) ──► per-site horizon masks,   │
                       slope, roughness; south-polar mask grid ───┤
  LOLA PSR shapefile + Diviner PRP ──► PSR polygons, cold-trap ───┤──► data/seed/*.json ──► seed script ──► Firestore
  NASA 2011 heritage doc ──► heritage-buffer circles ─────────────┤      (validated,        (Admin SDK,
  Curated + cited JSON (sites, presets, facts, story) ────────────┘       size-checked)      emulator, then prod)

RUNTIME (browser, Next.js client components)
  Firestore (public read) ──► sites, profiles, story, zones, presets, facts, validation, demo
  Firestore ephemerisGlobal/{YYYY-MM} ──► lib/ephemeris (decode → interpolate → topocentric az/el) ──┐
  Firestore sites/{id}/terrain/v1 or terrainGrid/{tile} ──► horizon mask ──────────────────────────────┼─► ENGINE (later phase)
  Firestore psrLayer + protectionZones ──► zone flags ──────────────────────────────────────────────────┘
  Firestore users/{uid}/... ◄─► progress, named sessions, report summaries (owner-only)
  URL params ◄─► live Mission Control session; localStorage ◄─► signed-out progress
```

The narrated flow is unchanged from the handoff (Home demo, story order, expert skip, Mission Control inputs, the three engine stages, results store, export, Science validation, Impact zones). Two things differ:

- Ephemeris, masks, PSR/ice data and the demo series now come from Firestore.
- The Science page reads a validation value that the **pipeline has already computed**. Nothing is computed at page load.

---

## 5. Research results to build on (the agent's reference)

The full tables with URLs are in `docs/research/`:

| File | Contents |
|---|---|
| `sites.md` | Site catalog, coordinate frames, Artemis regions, Apollo sun angles |
| `ephemeris.md` | Horizons parameters, spot checks, client math, storage, Spark quotas |
| `terrain-psr-zones.md` | DEM products, horizon recipe, PSR/ice, NASA 2011 zones, slope thresholds |
| `power-costs-outcomes.md` | Lander power, solar constants, debrief numbers, costs, landing record |
| `horizons-spot-check/` | Runnable spike scripts (stdlib Python) plus `results/` |

### 5.1 Coordinate system and frames

- **Frame:** Mean Earth / polar axis of DE421 (`MOON_ME`), on a sphere with R = 1737.4 km, longitude east-positive.
  - Horizons uses this frame for lunar sites. The principal-axis frame is not available in Horizons.
  - All LOLA/PGDA products use the same frame and sphere, so **no frame conversion is needed anywhere**.
- **Site coordinates:** use the LROC values (Wagner et al. 2017, *Icarus* 283:92–103; LROC 2016 coordinates table), which are in the ME frame.
  - Apollo-era and Soviet-era published coordinates are off by 6 m to 7.6 km.
  - Keep the old values only as `coordsAsPublished` metadata.
- **Optional cross-check:** LROC's anthropogenic-objects shapefile was updated 2026-08-14. It is at `https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_ANTHROPOGENIC_OBJECTS` (1.5 MB ZIP).
  - The research did not download it. Download it in `00_fetch` and cross-check every site.
  - If it gives more decimals for IM-1 or Chandrayaan-3, use them and record the change.

### 5.2 Ephemeris (confirmed live on 2026-11-14)

**Global sub-point series.** One request returns both sub-points and both ranges:

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&CENTER='500@399'
  &OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&TIME_TYPE='UT'&APPARENT='AIRLESS'
  &CSV_FORMAT='YES'&EXTRA_PREC='YES'&RANGE_UNITS='KM'
  &START_TIME='2026-01-01 00:00'&STOP_TIME='2027-01-01 00:00'&STEP_SIZE='1 h'
  &QUANTITIES='14,15,19,20'
```

- Columns: `ObsSub-LON, ObsSub-LAT` (sub-Earth point on the Moon), `SunSub-LON, SunSub-LAT` (sub-solar point), `r` (Sun range), `delta` (Earth range).
- Do **not** use `CENTER='500@301'` with the Sun as target. That returns the sub-point **on the Sun**.
- Optionally add quantity `21` and subtract the down-leg light time (about 1.28 s) from the time tags. That removes a constant 0.00018° Sun residual.

**Direct topocentric query** (validation only):

```
COMMAND='10' (Sun) or '399' (Earth), CENTER='coord@301', COORD_TYPE='GEODETIC',
SITE_COORD='<E-lon>,<lat>,<alt km>', QUANTITIES='4', APPARENT='AIRLESS', TIME_TYPE='UT'
```

- Azimuth is 0 = north, increasing clockwise. Elevation is measured against the plane perpendicular to the sphere normal.
- **Horizons has no terrain.** Terrain must come from the horizon mask.

**Time scale.**
- Output is UT: UTC after 1962, UT1 before. Store and display UTC.
- Internal computation is TDB. Future dates hold the last known leap second constant.

**Client topocentric math** (implement in `lib/ephemeris/topocentric.ts`):

1. Build the site frame for latitude φ, east longitude λ:
   - up `U = (cosφcosλ, cosφsinλ, sinφ)`
   - east `E = (−sinλ, cosλ, 0)`
   - north `N = (−sinφcosλ, −sinφsinλ, cosφ)`
2. Body vector from the sub-point: `B = D·(cosβcosL, cosβsinL, sinβ)`.
3. Line of sight: `v = B − (1737.4 + h_km)·U`. This includes parallax, which matters for Earth: leaving it out gives errors up to 0.27°.
4. Elevation: `el = asin(v·U/|v|)`.
5. Azimuth: `az = atan2(v·E, v·N)`, mapped to [0, 360).

**Interpolation:** interpolate Cartesian vectors linearly, never raw longitudes. The sub-Earth longitude wraps through 0/360.

**Measured accuracy** (5 sites × 145 epochs, Mar 2027, against direct Horizons quantity 4):

| | Max elevation error | Max azimuth error |
|---|---|---|
| Sun | 0.0002° | 0.005° (0.0002° when weighted by cos el) |
| Earth | 0.006° | 0.008° |

The Earth residual is mostly a stellar-aberration term of about 20″.

**Step size** (linear interpolation, worst Earth error):

| Step | Worst Earth error |
|---|---|
| 1 h | 0.0001° |
| 6 h | 0.004° |
| 24 h | 0.063° (fails a 0.05° target) |

**Use 1 h.**

**Apollo 11 spot check** (1969-07-20 20:17:40 UTC; LROC site 0.67416 N, 23.47314 E; alt 0):
- Sun: az 88.8055°, **el 10.7033°**
- Earth: az 272.1952°, el 59.2242°
- Client math from the global series: Sun el 10.70296°.

**Libration** (Mar–Apr 2027 sample): the sub-Earth point moved over about ±5.6° in longitude and ±6.7° in latitude. Earth–Moon distance ranged 366,461–405,183 km. Polar Earth visibility therefore comes and goes monthly, so the series must be time-resolved.

### 5.3 Terrain, masks, PSR and ice

**South polar DEMs: PGDA product 90** (Barker et al. 2023, *PSJ* 4:183, doi:10.3847/PSJ/acf3e1; data DOI 10.60903/gsfcpgda-lola-spole).

- Files are at `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/`. All TIFs are **Cloud-Optimized GeoTIFFs**; the server supports byte ranges.
- Grid: south polar stereographic on a sphere of 1,737,400 m, with the central meridian at 0.
- `LDEM_80S_20MPP_ADJ.TIF`: 30400² pixels, ±304 km, float32, 2.6 GB. Range-read windows of it.
- Also available:
  - Height error: `_ERR`
  - Slope and slope error: `LDSM_80S_20MPP_ADJ`
  - Roughness: `LDRM_80S_50MPP_ADJ_ROUGH_100M` etc.
  - `LDEM_83S_10MPP_ADJ` (10 m)
  - `LDEM_80S_80MPP_ADJ` (181 MB)
  - `LDEM_60S_240MPP_ADJ` (210 MB, ±931 km), which is needed for far-field rays from sites near 84°S
- Vertical datum: the page doesn't state one. It is inferred to be height above 1737.4 km, which is the PDS convention. Verify against the PDS LDEM label before relying on absolute heights.

**5 m site DEMs: PGDA product 78** (Barker et al. 2021, *PSS* 203:105119).

- Path: `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/<Site>/<Site>_final_adj_5mpp_surf.tif`, plus `_toterr`, `_slp`, `_slperr` and `Clones/` (100 error clones).
- These are plain GeoTIFFs, not COGs, at 41–142 MB each.
- Box centres for each site are in `terrain-psr-zones.md` §A2.

**Non-polar DEM: SLDEM2015** (Barker et al. 2016, *Icarus* 273:346–355).

- Tiles are at `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/`.
- 512 ppd (59.2 m), ±60°. Each tile is raw float32 in km with offset 1737.4 and about 1.4 GB.
- Range-read windows with offset `(line × samples + sample) × 4`, where `samples` comes from the tile's `.LBL` (15,360 for a 30° × 45° tile).
- Typical vertical accuracy is about 3–4 m. No COG version exists.
- Above ±60°, use the LOLA `LDEM_512` / `LDEM_1024` tiles from `imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/`.

**Horizon method** (Barker 2021 §5, after Mazarico et al. 2011):

- 720 sight lines at 0.5° spacing.
- Nested grids: 5 m within 5 km, 80 m out to 100 km, 240 m beyond. Barker 2023 runs rays to 310 km.
- Walk each ray along a **great circle**, not a straight line in the stereographic plane.
- Account for curvature exactly: `θ = atan2(r₁cosγ − r₀, r₁sinγ)`, where `γ = d/R`, `r₀ = R + h_obs + Δz` and `r₁ = R + h(d)`. Curvature drops terrain about 6.5 km at 150 km.
- Observer heights: Δz = 1 m and 5 m (Barker). Allow a parameter for a mast.

**Mask error band** (derived):
- σθ ≈ σz·cosθ / s, where s is the distance to the obstruction that sets the maximum.
- Near-field error dominates.
- Where 5 m clones exist, recompute the mask on all 100 and store the 5th and 95th percentiles per azimuth. The band is asymmetric: clones tend to raise the horizon.

**PSRs:**
- `LPSR_80S_20MPP_ADJ.SHP` (all 506,349 PSRs) and `LPSR_80S_20MPP_ADJ_1km2.SHP` (1,531 PSRs larger than 1 km²), both from product 90.
- PSRs under 1 km² hold 15 ± 5% of PSR area, and 1-pixel PSRs near 80°S can be about 50% false positives. Use a minimum of 5 pixels (2,000 m²) for distance calculations.

**Cold-trap flag:** Diviner Polar Resource Product (Paige et al. 2010, *Science*, doi:10.1126/science.1187726).
- File: `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab`, 605 MB ASCII.
- It has 2.88 M triangles with `temp_max`. Stream-parse it and keep rows with `tri_clat < −80`.
- Per PSR, store `coldTrapFraction` = the area fraction with `temp_max < 110 K`.
- 110 K is the threshold used by Li et al. 2018 (PNAS) and Fisher et al. 2017. Li et al. found surface ice exposures in only about 3.5% of cold traps, so never call a PSR "ice-bearing".

**Lit-fraction cross-check:** LROC WAC polar illumination maps (Speyerer & Robinson 2013).
- Products: `WAC_POLE_ILL_PCT_SOUTH_100M` and `_TWI_`, at 100 m, 88–90°S, covering 15 Feb 2010 – 5 Feb 2011.
- Recompute lit fraction over the same year for sites inside 88°S and compare. Expect agreement to within tens of percent; this is a sanity check.
- For a multi-year check, use PGDA product 69 `AVGVISIB_85S_60M_201608` (COG).

**Slope and hazard thresholds** (NASA "Artemis HLS Update", Dwyer Cianciolo, 1 Aug 2024, NTRS 20240009596):
- Landing slope below 10° over 100 m.
- EVA slope below 20° within 2 km.
- Land within 100 m of target.

Compute slope by fitting a plane over a 100 m window, not per pixel. Flag cells where slope + 2σ crosses a threshold. Keep the 8° contour too; it appears on NASA's map.

### 5.4 Protection zones

Source: NASA (2011, Rev A 28 Oct 2011), *Recommendations to Space-Faring Entities: How to Protect and Preserve the Historic and Scientific Value of U.S. Government Lunar Artifacts*, https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf

| Rule | Distance | Applies to | Section |
|---|---|---|---|
| Descent/landing boundary, no overflight | **2.0 km** radius (lander sites) | Apollo 11, 12, 14, 15, 16, 17; Surveyor 1, 3, 5, 6, 7 | A1-3, A2-2 |
| Touchdown targeting | ≥ 2.0 km or 3σ of landing dispersion, whichever is greater | US heritage landers | A2-3 |
| Impact sites | **0.5 km** | Ranger, S-IVB, LCROSS (NASA 2022 OTPS) | A1-3 |
| Artifact boundary (no visits) | **75 m** (Apollo 11), **225 m** (Apollo 17) from the LM descent stage | Apollo 11, 17 | A3-1/A3-2 |
| Other Apollo sites | 3 m from descent stage; 1 m from other hardware | Apollo 12, 14, 15, 16 | A3-3 |
| Rock-ejecta range (context ring) | Ejecta "up to 1.5 km from the LM" | rationale text | A2-3 |

- The **One Small Step Act** (Pub. L. 116-275, 2020) makes these binding in NASA contracts. Neither it nor the Artemis Accords (§9, §11.7) sets distances.
- The 2011 document covers **U.S. Government artifacts only**. Show Luna, Chang'e, SLIM and other non-US sites as heritage *without* a NASA-2011 zone, and say so in the UI.
- Ranger, S-IVB and LCROSS impact coordinates were **not researched**. Add them only from a cited source (LROC 2016 table or LROC posts); otherwise list them as missing.
- **PSR buffer:** no published distance supports one. NASA's 2022 OTPS report says no distance can eliminate ejecta impacts entirely.
  - Make the buffer a user parameter, defaulting to **2.0 km**, labelled *"NASA 2011 heritage landing stand-off, applied by analogy"*.
  - Show 1.5 km as a secondary ring.
  - Never present either as a PSR-protection standard.

### 5.5 Power and physical constants

| Value | Number | Source |
|---|---|---|
| Total solar irradiance at 1 AU | 1360.8 ± 0.5 W/m² | Kopp & Lean 2011, *GRL* 38 L01706 |
| NASA fact-sheet solar irradiance | 1361.0 W/m² | NSSDC Moon fact sheet |
| Irradiance scaling | S = S₀·(1 AU / r)², with r the Sun range from the ephemeris (≈ ±3.4% over a year) | |
| Triple-junction cell efficiency | 29.2% BOL at 1367 W/m², AM0, 28 °C | AZUR SPACE 3G30-Advanced datasheet |
| Synodic month | 29.53 d | NSSDC; lunar night ≈ 14.77 d is derived |
| Equatorial surface temperature | about 387–397 K max, about 95 K before sunrise | Diviner, Williams et al. 2017, *Icarus* 283 |
| Polar cold trap | about 38 K | Paige et al. 2010 |
| Sun angular diameter | **Not sourced.** | Get it from Horizons quantity 13 (target angular diameter) in the pipeline and store it per ephemeris chunk. |

**Lander presets.** Store only these sourced values; everything else is `null`:

| Preset | Values |
|---|---|
| Chandrayaan-3 Vikram | 738 W; mission life one lunar day (~14 Earth days); talks to IDSN and the Ch-2 orbiter (ISRO) |
| Pragyan rover | 50 W (ISRO); battery 10 Ah (secondary source: The Week) |
| Chandrayaan-2 Vikram | 650 W; one lunar day (ISRO) |
| Blue Ghost M1 | up to 400 W; 346 h of daylight operations plus about 5 h into night (Firefly) |
| IM-1 / IM-2 Nova-C | planned about 10 days of surface operations; IM-1 achieved about 7 days (NASA press kits). Power and battery: **null** (the 200 W / 25 Ah figures exist only on Wikipedia) |
| SLIM | thin-film solar cell and "SUS laminated battery"; not designed for the lunar night (JAXA, Dec 2024 briefing). Numbers null |
| Apollo LM | descent 5 × 415 Ah, ascent 2 × 296 Ah, 28 V nominal, silver-zinc (Grumman *Apollo News Reference*, J-mission configuration). The Apollo 11 battery count is unsourced |

The simulator's defaults for battery capacity, base load and comms load have **no published source**.
- Store them in a `teaching-lander` preset with `basis: "assumption"` and a rationale.
- The team picks the values. You may derive a panel area from 738 W with the formula, but label it "derived".

### 5.6 Apollo sun-angle validation values

Source: ALSJ "Earth and Sun Altitude/Azimuth" table, https://www.apollojournals.org/alsj/alsj-EarthSun_AltAz.html

These are *computed reconstructions* by Fjeld and Scotti, spot-checked against JPL Horizons, with the two computations agreeing to within 0.5°. They are not in-situ measurements. Label them that way.

| Mission | Time (ALSJ table, UTC) | Sun elevation | Sun azimuth |
|---|---|---|---|
| Apollo 11 | 1969-07-20 20:17:39 | **10.65°** | 88.81° |
| Apollo 12 | 1969-11-19 06:54:36 | 5.19° | 91.16° |
| Apollo 14 | 1971-02-05 09:18:13 | 10.36° | 89.54° |
| Apollo 15 | 1971-07-30 22:16:29 | 12.05° | 95.73° |
| Apollo 16 | 1972-04-21 02:23:35 | 14.76° | 86.01° |
| Apollo 17 | 1972-12-11 19:54:58 | 13.33° | 95.83° |

Supporting context for Ch1, NASA SP-4029 Apollo 11 summary:
- The planned elevation was **10.8°**, a launch-window planning value.
- The acceptable range was **5°–14°**.
- The sun-angle restriction gave "a 16-hour period, which occurred every 29.5 days", when landing at a given site could be attempted.
- Armstrong, about 27 minutes after landing: "about 10 degrees Sun angle" (ALSJ).

The Mission Report (MSC-00171) value is unsourced: the PDF was too large or scanned. Keep it in MISSING_DATA.

The pipeline recomputes every row with its own client math, using LROC coordinates and the ALSJ time. The Apollo 11 spot check gives 10.703°, a delta of +0.05°, which is a **pass** at a 0.5° tolerance. ALSJ used older coordinates (0.6875, 23.4333), 1.27 km from LROC, which shifts the Sun elevation by well under 0.1°. Report that.

---

## 6. Firestore schema

- Use camelCase.
- Timestamps: `Timestamp` with `serverTimestamp()` on user writes. Convert to and from ISO strings in converters.
- **Binary series** use the Firestore **Bytes** type. In the Admin SDK, write a Node `Buffer`; the client SDK reads a `Bytes` object, then calls `.toUint8Array()` and copies into an aligned `ArrayBuffer`.
- All binary data is **little-endian**.
- **Exempt every Bytes and large array field from indexing** (section 8). Firestore allows 40,000 index entries per document and truncates indexed values over 1,500 bytes.
- Target **≤ 500 KB per document**; the hard limit is 1 MiB.

### 6.1 Static content (public read, no client writes; seeded with the Admin SDK)

```
sites/{siteId}
  name, family, siteKind, country, agency, mission (string|null),
  landingTimeUtc (string|null, ISO), landingTimePrecision ("second"|"minute"|"approx"|"date"|null),
  outcome, outcomeDetail {summary, causeClass, sources[]} | null,
  coordinates {latDeg, lonDeg, elevationM?} | null, latDeg, lonDeg (flat helpers, null if none),
  coordsVerified, coordsFrame ("MOON_ME"|"unknown"), coordsUncertaintyM (number|null),
  coordsAsPublished {latDeg, lonDeg, source} | null,
  representativePoint {latDeg, lonDeg, method, sources[]} | null   // Artemis regions only
  chapterId, blurb, sources [{label, url, retrievedAt}],
  terrainSummary {hasMask, slope100mDeg, nearestPsrKm, nearestColdTrapKm, insidePsr} | null,
  updatedAt

sites/{siteId}/terrain/v1                                      // ~9 KB
  binDeg 0.5, bins 720, mask (Bytes: float32[720] deg), maskP05, maskP95 (Bytes, same layout; null if no clones),
  distAtMaxKm (Bytes float32[720]), errorMarginDeg (scalar summary), observerHeightM,
  rayLengthKm, demProducts [string], slope100mDeg, slope100mErrDeg, roughness100mM,
  nearestPsrKm, nearestColdTrapPsrKm, insidePsr, litFractionCheck {computed, lrocWac, window} | null,
  sources[], computedAt, pipelineVersion

ephemerisGlobal/{chunkId}            // "2026-01" … "2030-12", plus "hist-<siteId>" windows
  startUtc, stepMinutes 60, count, layout ["sunLatDeg","sunLonDeg","sunDistKm","earthLatDeg","earthLonDeg","earthDistKm"],
  data (Bytes: float32 count×6, row-major), sunAngularDiameterDegMean,
  frame "MOON_ME (DE421)", timeScale "UTC", source "JPL Horizons API", horizonsQuery (string), ephemerisVersion (from header, e.g. "DE441"),
  retrievedAt
  // ~24 KB per month. Historic windows: ±7 days around each landing with landingTimeUtc ≥ 1966.

terrainGrid/{tileId}                 // custom-coordinate masks, south pole
  gridSpacingKm, tileOriginXY {xM, yM}, cellsPerSide 16, binDeg 1, bins 360,
  masks (Bytes: int16 centidegrees, cells×360; −32768 = no data),
  maskErr (Bytes: uint8, 0.05° steps, cells×360),
  cellStats (Bytes: per cell int16 slope100m centideg, uint16 nearestPsr in 10 m, uint16 nearestColdTrap in 10 m, uint8 insidePsr),
  demProducts[], rayLengthKm, observerHeightM, computedAt

psrLayer/south-1km2                  // one doc if ≤500 KB, else psrLayer/{tileId}
  count, encoding "int32 stereographic metres, delta-coded rings", polygons (Bytes), index (Bytes: per-PSR offset, areaKm2×100, coldTrapFraction×1000),
  names [{i, name}], simplifyToleranceM, sources[]

protectionZones/{zoneId}
  kind "heritage-buffer" | "psr-ice", ruleId ("nasa2011-dl-boundary" | "nasa2011-artifact-boundary" | "nasa2011-impact-boundary" | "psr-buffer-by-analogy"),
  name, siteId|null, geometry {type:"Circle", center{latDeg,lonDeg}, radiusKm} | {type:"Polygon", rings:[{points:[{latDeg,lonDeg}]}]},
  rationale, sources[], needsData (bool)

landerPresets/{presetId}
  label, agency, mission, fields: { arrayPowerW, panelAreaM2, cellEfficiency, batteryWh, batteryAh, busV,
    baseLoadW, commsLoadW, designLifeHours, ... } where each = {value:number|null, unit, basis:"sourced"|"derived"|"assumption",
    sourceIdx:number|null, note}, sources[]

storyChapters/{chapterId}            // as before + cited keyNumbers (section 11)
missionProfiles/{profileId}          // as before + hazardThresholds {landingSlopeMaxDeg:10, evaSlopeMaxDeg:20, sources[]}
validationChecks/{checkId}           // section 11.4
facts/{factId}                       // "impact-costs", "landing-record-2019-2026", "lunar-constants", "artemis-status"
  title, rows [ {label, value, unit, currency?, approxUsd?, quote, source{label,url,retrievedAt}, tier "A"|"B"|"C", note} ], updatedAt
dataSources/{sourceId}               // every dataset (section 7.2): label, kind, version, citation, doi, url, retrievedAt, license, usedFor[]
demo/home                            // Home demo: one lunar day at one site
  siteId, startUtc, stepMinutes 60, count, series (Bytes float32 count×4: sunAz, sunEl, earthAz, earthEl), mask (Bytes float32[720])
catalog/siteIndex                    // one read for the Site Library: [{id,name,family,country,agency,outcome,latDeg,lonDeg,landingTimeUtc,chapterId}]
catalog/meta                         // datasetVersion, generatedAt, pipelineGitSha, counts per collection (lets the client cache-bust)
```

### 6.2 User data (owner only: `request.auth.uid == uid`)

These are unchanged from the first prompt:
- `users/{uid}`
- `users/{uid}/progress/state`
- `users/{uid}/sessions/{id}`
- `users/{uid}/reports/{id}`

**Size rule:** a saved report stores the summary only, never time series.

### 6.3 Enums (validate in rules, TypeScript and the seed validator)

- `family`: `apollo | surveyor | luna | change | chandrayaan | slim | clps | commercial | artemis-candidate | custom`
- `siteKind`: `landing | impact | rover-final | region-reference`
- `outcome`: `success | partial | failure | planned | n/a`
- `toolId`, `chapterId`, `missionProfileId`: unchanged.

---

## 7. Data pipeline (`scripts/data-pipeline/`)

### 7.1 Setup

- Python 3.11+, with `requirements.txt` pinned: numpy, rasterio (GDAL), shapely, pyproj, requests, tqdm.
- Use `.venv/` and `.cache/`, both gitignored.
- Write a `README.md` covering: how to rerun everything, the expected runtime, disk use, and how to rerun one stage.
- Stages are idempotent and cache to `.cache/`. Each writes `data/seed/<collection>/*.json`.

For Bytes fields in the JSON, use `{"$bytes": "<base64>"}`. The seed script converts these to `Buffer`.

### 7.2 Stages

| Stage | Output | Notes |
|---|---|---|
| `00_fetch.py` | `.cache/`, `manifest.lock.json` | Downloads whole files: PGDA `LDEM_60S_240MPP_ADJ` and `_ERR`, `LDEM_80S_80MPP_ADJ` and `_ERR`, the LPSR shapefiles, product-78 `surf`/`toterr`/`slp`/`slperr` for sites inside a 5 m box, the LROC anthropogenic shapefile, Diviner PRP and the WAC illumination maps. Records range-read sources (COG windows, SLDEM tiles) as URLs only. |
| `10_sites.py` | `sites/*.json`, `catalog/siteIndex.json` | Builds from `curated/sites.json` (section 11.1; every row cited). Cross-checks against the LROC shapefile and **fails if any verified site moves more than 50 m** without an explicit override. |
| `20_ephemeris.py` | `ephemerisGlobal/*.json` | Global 1 h series, 2026-01-01 to 2030-12-31: one request per year, sequential. Historic ±7 d windows per landed site. Adds quantity 13 for the Sun's angular diameter (Moon-centred query). Stores the exact query string and the ephemeris version from the header. |
| `21_ephemeris_check.py` | `data/seed/fixtures/topocentric-check.json`, numbers in `METHODS.md` | Direct Horizons quantity-4 queries for 5 sites × about 30 epochs (reuse `docs/research/horizons-spot-check/compare.py`). The fixture holds sub-point inputs and Horizons az/el for vitest. **Fail if the client math is off by more than 0.02°.** |
| `30_site_terrain.py` | `sites/*/terrain/v1.json` | 720-bin masks per curated site with real coordinates (method in section 5.3). Clone percentiles where product 78 covers the site. Slope and roughness at 100 m; PSR and cold-trap distances. Non-polar sites use an SLDEM2015 window. |
| `31_terrain_grid.py` | `terrainGrid/*.json` | South-polar grid: **2 km spacing poleward of 84°S** (about 26,000 cells) and **5 km for 80–84°S** (about 7,400 cells). 360 bins at 1°, near field from the 20 m DEM, far field from 80 and 240 m, rays to 310 km. Tiles of 16×16 cells. If runtime is impractical, coarsen (for example 4 km) and record the choice in `METHODS.md`. Never fabricate cells. |
| `40_psr.py` | `psrLayer/*.json`, `protectionZones/psr-*.json` | PSR polygons with at least 5 pixels, simplified (start at a 50 m tolerance; record it). Diviner cold-trap fraction per PSR. Named large PSRs also become `protectionZones` docs. |
| `50_zones.py` | `protectionZones/*.json` | Heritage circles from section 5.4 for every US lander site in the catalog: a 2.0 km D/L zone, plus 75 m / 225 m artifact zones for Apollo 11 and 17. Impact-site zones only where a cited coordinate exists. |
| `60_curated.py` | presets, facts, story, profiles, validation, dataSources | Validates the curated JSON (sections 5.5 and 11) and emits it. |
| `70_demo.py` | `demo/home.json` | One synodic month at a south-pole demo site. **Recommendation:** use a site inside a product-78 box (for example the Malapert massif or Mons Mouton region) and say which one. |
| `80_validate.py` | `docs/DATA_SIZE_REPORT.md` | Recomputes `validationChecks.computed`, `deltaDeg` and `status`. Checks enums, the ≤ 500 KB document size, weights summing to 1, and that every number has a source or `basis`. Writes the size and quota report. |

### 7.3 Docs to write

- `docs/SOURCES.md`: every dataset, paper and page, with URL, version or DOI and retrieval date. Start from `docs/research/*.md`.
- `docs/MISSING_DATA.md`: everything left null. Seed it with section 12.
- `docs/METHODS.md`: plain-language equations (topocentric, horizon ray-cast with curvature, mask error, lit test, irradiance), assumptions, error margins, the client-math validation table and the validation results. It feeds the Science page.

---

## 8. Security rules and indexes

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function publicRead() { return true; }
    match /sites/{id}                   { allow read: if publicRead(); allow write: if false;
      match /terrain/{doc}              { allow read: if publicRead(); allow write: if false; } }
    match /storyChapters/{id}           { allow read: if true; allow write: if false; }
    match /missionProfiles/{id}         { allow read: if true; allow write: if false; }
    match /protectionZones/{id}         { allow read: if true; allow write: if false; }
    match /dataSources/{id}             { allow read: if true; allow write: if false; }
    match /validationChecks/{id}        { allow read: if true; allow write: if false; }
    match /landerPresets/{id}           { allow read: if true; allow write: if false; }
    match /facts/{id}                   { allow read: if true; allow write: if false; }
    match /ephemerisGlobal/{id}         { allow read: if true; allow write: if false; }
    match /terrainGrid/{id}             { allow read: if true; allow write: if false; }
    match /psrLayer/{id}                { allow read: if true; allow write: if false; }
    match /demo/{id}                    { allow read: if true; allow write: if false; }
    match /catalog/{id}                 { allow read: if true; allow write: if false; }

    // users/{uid}/**: identical to the first prompt (ownership + shape checks for
    // users doc, progress/state, sessions (1–3 selections, valid profileId),
    // reports (1–3 summaries, format pdf|csv, no update)).

    match /{document=**} { allow read, write: if false; }
  }
}
```

**`firestore.indexes.json`:**
- Keep the first prompt's composite indexes: sites by family+name, country+name and chapterId+name; storyChapters by order.
- Add `fieldOverrides` with `"indexes": []` to exempt these fields:
  - `ephemerisGlobal.data`
  - `terrain.mask`, `terrain.maskP05`, `terrain.maskP95`, `terrain.distAtMaxKm` (collection group `terrain`)
  - `terrainGrid.masks`, `terrainGrid.maskErr`, `terrainGrid.cellStats`
  - `psrLayer.polygons`, `psrLayer.index`
  - `demo.series`, `demo.mask`
  - `catalog.sites`

Rules tests use `@firebase/rules-unit-testing` with vitest:
- Keep every case from the first prompt.
- Add: signed-out users can read each new collection, and nobody can write to them.

---

## 9. Client layer (Next.js)

| Path | Contents |
|---|---|
| `lib/firebase/client.ts` | `initializeApp` from `NEXT_PUBLIC_FIREBASE_*`. Firestore with `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`, so repeat visits cost no reads. Connect the emulators when `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === "true"`. Import only from client components. |
| `lib/model/types.ts` | Section 10. |
| `lib/firestore/converters.ts` | Typed `withConverter` for every document. Timestamp ↔ ISO conversion. Bytes → typed arrays. Polygon rings ↔ GeoJSON. |
| `lib/firestore/*Service.ts` | sites (index plus detail), story, profiles, zones, presets, facts, validation, sources, terrain, terrainGrid, psr, demo, progress, session, report. Each caches in memory and fetches each document once. |
| `lib/ephemeris/` | `decode.ts` (Bytes → Float32Array rows), `series.ts` (fetch the month chunks covering a window, convert to Cartesian, linear interpolation), `topocentric.ts` (section 5.2). Tests read `data/seed/fixtures/topocentric-check.json`, max error 0.02°. |
| `lib/terrain/` | `maskAt(mask, binDeg, az)` with wrap-around interpolation. `snapToGrid(latDeg, lonDeg)` → `{tileId, cellIndex, distanceKm}` or `null` outside 80–90°S. An adapter that maps Firestore masks to the existing `HorizonModel` in `lib/horizon.ts`, which is the seam `CLAUDE.md` names. |
| `lib/auth/useAuth.ts`, `lib/auth/ensureUserDoc.ts` | Google sign-in, plus a localStorage → Firestore progress merge on first sign-in: the union of chapters and tools, and the later `updatedAt` wins for `stepAnswers`. |

**Progress, session and report services:** unchanged from the first prompt.
- `completeChapter` enforces order in a transaction.
- `enableExpertMode` and `isMissionControlUnlocked`.
- URL encode/decode for session state.
- Report summaries with time series stripped.

---

## 10. Types (`lib/model/types.ts`)

- Start from the first prompt's `types.ts`, including its §5.4 additions `UserDoc`, `SavedSession`, `SavedReportSummary` and `SavedReport`.
- Keep every convention: degrees, azimuth 0 = north and clockwise, east-positive longitude, ISO UTC, null over guessing.
- Then apply these changes.

```ts
export type SiteFamily = "apollo" | "surveyor" | "luna" | "change" | "chandrayaan" | "slim"
  | "clps" | "commercial" | "artemis-candidate" | "custom";
export type SiteKind = "landing" | "impact" | "rover-final" | "region-reference";
export type TimePrecision = "second" | "minute" | "approx" | "date";
export type Basis = "sourced" | "derived" | "assumption";

export interface SourceRef { label: string; url: string | null; retrievedAt: string | null; tier?: "A" | "B" | "C"; note?: string; }

export interface Site {
  id: SiteId; name: string; family: SiteFamily; siteKind: SiteKind;
  country: string; agency: string; mission: string | null;
  landingTimeUtc: string | null; landingTimePrecision: TimePrecision | null;
  outcome: Outcome; outcomeDetail: { summary: string; causeClass: string; sources: SourceRef[] } | null;
  coordinates: Coordinates | null; coordsVerified: boolean; coordsFrame: "MOON_ME" | "unknown";
  coordsUncertaintyM: number | null;
  coordsAsPublished: { latDeg: number; lonDeg: number; source: SourceRef } | null;
  representativePoint: { latDeg: number; lonDeg: number; method: string; sources: SourceRef[] } | null;
  chapterId: ChapterId | null; blurb: string; sources: SourceRef[];
  terrainSummary: { hasMask: boolean; slope100mDeg: number | null; nearestPsrKm: number | null;
    nearestColdTrapKm: number | null; insidePsr: boolean | null } | null;
}

export interface HorizonMask {
  source: "LOLA DEM" | "LOLA DEM grid" | "none";   // "none" = smooth-sphere horizon (outside grid)
  binDeg: number; maskElevationDeg: Float32Array | number[];
  maskP05Deg: Float32Array | null; maskP95Deg: Float32Array | null;
  errorMarginDeg: number; demProducts: string[]; rayLengthKm: number; observerHeightM: number;
}

export interface SiteTerrain { mask: HorizonMask; distAtMaxKm: Float32Array | null; slope100mDeg: number | null;
  slope100mErrDeg: number | null; roughness100mM: number | null; nearestPsrKm: number | null;
  nearestColdTrapPsrKm: number | null; insidePsr: boolean | null;
  litFractionCheck: { computed: number; lrocWac: number; window: TimeWindow } | null; sources: SourceRef[]; }

export interface EphemerisChunk { id: string; startUtc: string; stepMinutes: number; count: number;
  layout: readonly ["sunLatDeg","sunLonDeg","sunDistKm","earthLatDeg","earthLonDeg","earthDistKm"];
  data: Float32Array; sunAngularDiameterDegMean: number | null; frame: string; timeScale: "UTC";
  source: "JPL Horizons API"; horizonsQuery: string; ephemerisVersion: string | null; retrievedAt: string; }

export interface EphemerisSeries {
  source: "JPL Horizons (global sub-point series, client topocentric)" | "bundled sample";
  samples: EphemerisSample[];
}

export interface ProtectionZone {
  id: string; kind: "psr-ice" | "heritage-buffer";
  ruleId: "nasa2011-dl-boundary" | "nasa2011-artifact-boundary" | "nasa2011-impact-boundary" | "psr-buffer-by-analogy";
  name: string; siteId: SiteId | null;
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "Circle"; center: Coordinates; radiusKm: number };
  rationale: string; sources: SourceRef[]; needsData: boolean;
}

export interface PresetField { value: number | null; unit: string; basis: Basis; sourceIdx: number | null; note: string; }
export interface LanderPreset { id: string; label: string; agency: string; mission: string | null;
  fields: Record<"arrayPowerW" | "panelAreaM2" | "cellEfficiency" | "batteryWh" | "batteryAh" | "busV"
    | "baseLoadW" | "commsLoadW" | "designLifeHours", PresetField>; sources: SourceRef[]; }

export interface MissionProfile { /* as before */ hazardThresholds: { landingSlopeMaxDeg: number;
  evaSlopeMaxDeg: number; sources: SourceRef[] }; }

export interface ValidationCheck {
  id: string; siteId: SiteId; time: string;
  quantity: "sun-elevation-deg" | "sun-azimuth-deg" | "earth-elevation-deg" | "lit-fraction";
  computed: number | null; computedBy: string | null;            // e.g. "pipeline 80_validate.py @ <git sha>"
  historical: number | null; historicalKind: "measured" | "computed-reconstruction" | "planning-value" | null;
  historicalSource: SourceRef | null; toleranceDeg: number; deltaDeg: number | null;
  status: "pass" | "fail" | "pending"; note: string;
}

export interface FactRow { label: string; value: string | number; unit: string | null; currency?: string;
  approxUsd?: number | null; quote: string; source: SourceRef; note?: string; }
export interface FactSheet { id: string; title: string; rows: FactRow[]; updatedAt: string; }

export interface DataSourceManifest { id: string; label: string; kind: "api" | "dem" | "map" | "paper" | "document" | "catalog";
  version: string | null; citation: string | null; doi: string | null; url: string | null;
  retrievedAt: string | null; license: string | null; usedFor: string[]; }
```

`EngineInput` and `EngineResult` are unchanged, except that `horizonMask` is now `HorizonMask` (the new shape) and `ephemeris` is built by `lib/ephemeris`.

---

## 11. Seed content (curated, cited)

These values go into `scripts/data-pipeline/curated/*.json`. Sources for each row are in `docs/research/sites.md`; copy the URLs into each document's `sources`.

### 11.1 Sites

- **Frame:** ME/LROC unless noted.
- `coordsVerified` is **true** only where the source column is primary (LROC, NASA or NSSDCA).
- Times are UTC.

| id | family | kind | lat | lon | landing UTC (precision) | outcome | ± m | ch | source |
|---|---|---|---|---|---|---|---|---|---|
| apollo-11-tranquility | apollo | landing | 0.67416 | 23.47314 | 1969-07-20T20:17:40Z (s) | success | 0.3 | ch1 | LROC 2016, NSSDCA |
| apollo-12-oceanus-procellarum | apollo | landing | −3.0128 | −23.4219 | 1969-11-19T06:54:35Z (s) | success | 2.2 | | LROC 2016, NSSDCA |
| apollo-14-fra-mauro | apollo | landing | −3.64589 | −17.47194 | 1971-02-05T09:18:11Z (s) | success | 0.4 | | LROC 2016 |
| apollo-15-hadley-apennine | apollo | landing | 26.13239 | 3.63330 | 1971-07-30T22:16:29Z (s) | success | 1.0 | | LROC 2016 |
| apollo-16-descartes | apollo | landing | −8.9734 | 15.5011 | 1972-04-21T02:23:35Z (s) | success | 3.0 | | LROC 2016 |
| apollo-17-taurus-littrow | apollo | landing | 20.1911 | 30.7723 | 1972-12-11T19:54:57Z (s) | success | 3.5 | ch1 | LROC 2016, NSSDCA |
| surveyor-1 | surveyor | landing | −2.4745 | −43.3398 | 1966-06-02T06:17:36Z (s) | success | 5.6 | | LROC 2016 |
| surveyor-3 | surveyor | landing | −3.0162 | −23.4180 | 1967-04-20T00:04:53Z (s) | success | 2.6 | | LROC 2016 |
| surveyor-5 | surveyor | landing | 1.4551 | 23.1943 | 1967-09-11T00:46:44Z (s) | success | 11.9 | | LROC 2016 |
| surveyor-6 | surveyor | landing | 0.4742 | −1.4275 | 1967-11-10T01:01:06Z (s) | success | 6.7 | | LROC 2016 |
| surveyor-7 | surveyor | landing | −40.9812 | −11.5127 | 1968-01-10T01:05:36Z (s) | success | 3.5 | | LROC 2016 |
| luna-9 | luna | landing | 7.08 | −64.37 | 1966-02-03T18:44:52Z (s) | success | — | | NSSDCA (Soviet-era, **unverified**, not located by LROC) |
| luna-16 | luna | landing | −0.5137 | 56.3638 | 1970-09-20T05:18Z (min) | success | 3.7 | | LROC 2016 |
| luna-17-lunokhod-1 | luna | landing | 38.23764 | −35.00163 | 1970-11-17T03:47Z (min) | success | 0.5 | | LROC 2016 |
| lunokhod-1-final | luna | rover-final | 38.3150 | −35.0081 | — | success | 3.8 | | LROC 2016 |
| luna-20 | luna | landing | 3.7863 | 56.6242 | 1972-02-21T19:19Z (min) | success | 4.3 | | LROC 2016 |
| luna-21-lunokhod-2 | luna | landing | 25.9994 | 30.4076 | 1973-01-15T23:35Z (min) | success | 13.4 | | LROC 2016 |
| lunokhod-2-final | luna | rover-final | 25.8323 | 30.9222 | — | success | 7.5 | | LROC 2016 |
| luna-23 | luna | landing | 12.6667 | 62.1511 | null | partial | 3.0 | | LROC 2016 (landed damaged, no sample) |
| luna-24-mare-crisium | luna | landing | 12.7142 | 62.2129 | 1976-08-18T02:00Z (min) | success | 3.7 | | LROC 2016 |
| luna-25-impact | luna | impact | −57.865 | 61.360 | 2023-08-19T11:58Z (min) | failure | <40 | | LROC images/1311 ("likely") |
| change-3 | change | landing | 44.1214 | −19.5117 | 2013-12-14 ~13:11Z (approx) | success | 9.1 | | LROC 2016; time from Xinhua |
| change-4-von-karman | change | landing | −45.4561 | 177.5885 | 2019-01-03T02:26Z (min) | success | ~3 | ch2 | LROC images/1100 |
| change-5 | change | landing | 43.0576 | −51.9161 | 2020-12-01T15:11Z (min) | success | 20 | | LROC images/1172 |
| change-6-apollo-basin | change | landing | −41.6385 | −153.9852 | 2024-06-01T22:23Z (min) | success | 30 | | LROC images/1374 |
| beresheet-impact | commercial | impact | 32.5956 | 19.3496 | 2019-04-11 (date) | failure | ~20 | | LROC images/1101 |
| chandrayaan-2-vikram | chandrayaan | impact | −70.8810 | 22.7840 | 2019-09-06 (date; 7 Sep IST) | failure | — | ch2 | NASA/LROC images/1131 |
| chandrayaan-3-shiv-shakti | chandrayaan | landing | −69.3741 | 32.32 | 2023-08-23 (date) | success | ~50 | ch2 | LROC images/1314 |
| hakuto-r-m1-impact | commercial | impact | 47.581 | 44.094 | 2023-04-25T16:40Z (approx) | failure | — | | LROC images/1302 |
| slim-shioli | slim | landing | −13.3160 | 25.2510 | 2024-01-19T15:20Z (min) | partial | — | ch2 | LROC images/1358 |
| im-1-odysseus | clps | landing | −80.13 | 1.44 | 2024-02-22T23:24Z (min) | partial | ~150 (2 dp) | ch2 | NASA LRO release |
| blue-ghost-m1 | clps | landing | 18.5623 | 61.8103 | 2025-03-02T08:34Z (min) | success | — | | LROC images/1407 |
| im-2-athena | clps | landing | −84.7906 | 29.1957 | 2025-03-06 ~17:30Z (approx) | partial | — | ch2 | LROC images/1408 |
| hakuto-r-m2-resilience-impact | commercial | impact | 60.4445 | −4.5880 | 2025-06-05T18:13Z (min) | failure | — | | LROC images/1456 |

Store these as `coordsAsPublished` where they apply:
- Apollo 11: 0.67408, 23.47297 (SP-4029)
- Luna 24: 12.75, 62.20 (NSSDCA; 1.15 km off)
- Luna 16: −0.68, 56.30 (5.4 km off)
- Luna 20: 3.57, 56.50 (7.6 km off)
- Surveyor 1: −2.45, −43.21 (4.0 km off)
- Chandrayaan-3: ISRO's planned site −69.367621, 32.348126, which is 359 m from where it actually landed

Optional extra: luna-13 (18.87, −62.05; Soviet-era, unverified).

No lunar landing attempt happened in 2026 through 26 Oct 2026 (The Space Review). **Re-check 26 Oct – today** before seeding.

Write `outcomeDetail` from `power-costs-outcomes.md` §4 and §6. For example, IM-2: "landed on its side in a shadowed crater; ended in under 13 h". Use the cause classes from that file, and never claim a site/date cause the source doesn't give.

**Artemis candidate regions** (`artemis-candidate`, `region-reference`, `outcome: planned`, `coordinates: null`, `coordsVerified: false`, `chapterId: ch3-lunar-base`):

- **Regions**, in no priority order (NASA, 28 Oct 2024): Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain.
- NASA has **never published coordinates** for them. Each region is about 15 × 15 km, within 6° of the pole (NASA 2022).
- **`representativePoint` method:** use the centre of the PGDA product-78 5 m DEM tile whose PGDA name matches the region (`terrain-psr-zones.md` §A2, derived from the GeoTIFF header):

| Region | Tile | Point |
|---|---|---|
| Haworth | Haworth tile | −86.764, −22.78 |
| Malapert Massif | Site23 | −85.995, −0.24 |
| Nobile Rim 1 | Site06 | −85.438, 37.37 |
| Nobile Rim 2 | DM2 | −83.954, 58.82 |
| Mons Mouton | Site20 "Leibnitz beta plateau" | −85.427, 31.74 |

- The Mons Mouton row relies on the Leibnitz-β → Mons Mouton renaming, which is **unverified**. Confirm it in the USGS Gazetteer first.
- de Gerlache Rim 2 is ambiguous between Site11 and SL2. Leave it null unless a source resolves it.
- For the rest (Peak near Cabeus B, Mons Mouton Plateau, Slater Plain, and de Gerlache Rim 2 if unresolved), store the USGS Gazetteer named-feature centre as `representativePoint` with `method: "nearest named feature centre (NOT a region centroid)"`. The values are in `sites.md` §3.
- **Better, optional:** digitise NASA's 2024 region map image onto the stereographic grid and take centroids (about ±1–2 km). Or use a published region shapefile if one can be obtained (Wueller et al. 2026 JGR, doi:10.1029/2025JE009434).
- The UI must label every Artemis point "approximate region reference".

### 11.2 Story chapters

These are the first prompt's chapters with these changes:

**Ch1 First Landing**
- `featuredSiteIds`: apollo-11-tranquility, apollo-17-taurus-littrow, apollo-12-oceanus-procellarum (the lowest sun, at 5.19°).
- `keyNumbers`:
  - Sun elevation at Apollo 11 touchdown: 10.65° (ALSJ Fjeld/Scotti, computed reconstruction). Show the pipeline's value beside it.
  - Planned acceptable range: 5°–14° (NASA SP-4029).
  - Landing opportunity at a given site: a 16-hour period every 29.5 days (SP-4029).
- Replaces the TODO.

**Ch2 Robotic Explorer**
- `featuredSiteIds`: chandrayaan-3-shiv-shakti, slim-shioli, im-1-odysseus, im-2-athena, chandrayaan-2-vikram (as a contrast).
- `keyNumbers`:
  - Chandrayaan-3 lander power: 738 W; mission life one lunar day, about 14 Earth days (ISRO). It went to sleep and was never revived (ISRO via PTI).
  - SLIM: landed about 55 m from target; solar cells facing west, so no power until the Sun moved; survived 3 lunar nights (JAXA).
  - IM-2: landed in a shadowed crater; operations ended in under 13 h (NASA, SpaceNews).
  - IM-1: about 7 Earth days of operations, cut short when the Sun left its one illuminated panel (NASA).
- **Debrief honesty rule:** Chandrayaan-2 is a *descent-guidance* failure. The ISRO cause is that the reduction in velocity was more than designed. Do not present it as a lighting or site failure.

**Ch3 Lunar Base**
- `featuredSiteIds`: the Artemis-candidate ids.
- `realMission`: "Artemis IV candidate regions (first crewed landing, planned 2028)".
- `keyNumbers`:
  - Regions have continuous sunlight over a 6.5-day period, and each is about 15 × 15 km (NASA 2022).
  - Nine current regions (NASA 2024).
  - Landing slope below 10° over 100 m (NASA HLS update 2024).
  - Cold traps: annual maximum below 110 K; surface ice seen in only about 3.5% of cold traps (Li et al. 2018).

### 11.3 Mission profiles

- **Weights:** unchanged (starting values; justify them in `METHODS.md`).
- Add `hazardThresholds` (10° / 20°, NASA 2024) to all three profiles.
- **`long-term-base` disqualifier:** inside a PSR polygon, inside the PSR buffer, or inside any NASA-2011 heritage zone.
- **Open decision:** `robotic-14-day` has `durationHours: 336`. One lunar day is about 354 h (29.53 d / 2). Ask the user whether to switch.

### 11.4 Validation checks

| id | site | time | quantity | historical (kind) | tolerance | initial status |
|---|---|---|---|---|---|---|
| val-apollo11-sun-elevation | apollo-11-tranquility | 1969-07-20T20:17:39Z | sun-elevation-deg | 10.65 (computed-reconstruction, ALSJ) | 0.5 | pending, then pass if \|Δ\| ≤ 0.5 (spot check gave 10.703, Δ +0.05) |
| val-apollo11-sun-azimuth | same | same | sun-azimuth-deg | 88.81 (ALSJ) | 0.5 | pending |
| val-apollo11-planning-window | same | same | sun-elevation-deg | 5–14 range (planning-value, SP-4029; store `historical: null` with the range in `note`) | — | pass if inside the range |
| val-apollo12…17-sun-elevation | each Apollo site | ALSJ time | sun-elevation-deg | 5.19 / 10.36 / 12.05 / 14.76 / 13.33 | 0.5 | pending |
| val-lit-fraction-<site> | south-pole sites inside 88°S | Feb 2010 – Feb 2011 | lit-fraction | LROC WAC PCT value | report only | pending |

`computed` is written **only by `80_validate.py`**, never by hand.

### 11.5 Facts

Copy each row with its quote and URL from `power-costs-outcomes.md`.

**`facts/impact-costs`:**

| Mission | Cost | Source |
|---|---|---|
| Beresheet | about $100M | AP, tier C |
| Chandrayaan-2 | ₹603 crore project + ₹367 crore launch | PIB |
| Chandrayaan-3 | ₹250 crore, excluding launch | PIB |
| SLIM | ¥14.9 B total development | JAXA |
| Peregrine | $107.9M task order | NASA OIG IG-24-013 |
| IM-1 | $122.0M | NASA OIG IG-24-013 |
| IM-2 (PRIME-1) | $50.0M | NASA OIG IG-24-013 |
| Blue Ghost M1 | $101.5M | NASA OIG IG-24-013 |
| CLPS contract cap | $2.6 B through 2028 | NASA |

- Convert currencies with the FRED annual averages: INR 2019 = 70.3777, INR 2023 = 82.5708, JPY 2023 = 140.5001, JPY 2024 = 151.4551. Label converted amounts "approx."
- "Shots on goal" is quoted from a 2025 House Science Committee hearing charter, not a NASA document. Attribute it that way.

**`facts/landing-record-2019-2026`:** 14 attempts.
- 5 clean landings
- 3 landed in an unplanned attitude (SLIM, IM-1, IM-2)
- 5 crashes (Beresheet, Chandrayaan-2, HAKUTO-R M1, Luna 25, ispace M2)
- 1 never reached the Moon (Peregrine)

Include the cause class for each.

**`facts/lunar-constants`:** the values in section 5.5.

**`facts/artemis-status`:**
- Artemis III is a low-Earth-orbit test flight in 2027 (NASA, 27 Feb 2026; restated 23 Oct 2026).
- Artemis IV is the first crewed landing, in early 2028.

---

## 12. MISSING_DATA.md (start with these; leave values null)

- Apollo 11 Mission Report (MSC-00171) as-flown sun elevation, and Apollo 12–17 mission-report values. Only the ALSJ computed values exist.
- Chandrayaan-3 exact touchdown time from ISRO. Secondary sources give 18:03 IST; ISRO's pre-landing estimate was "around 18:04". Also its sun elevation at landing and local sunrise time.
- Chandrayaan-2 crash time; Beresheet impact time; Luna 23 landing time; Luna 9 verified location.
- Second-level times for Chang'e-3/4/5/6, SLIM and IM-2. IM-2's time zone is assumed CST.
- Artemis region centroids and boundaries. The Mons Mouton gazetteer centre returned an error, and the Leibnitz-β renaming is unverified.
- Lander battery capacity, bus voltage, base and comms load, and temperature limits for Vikram (Ch-2 and Ch-3), Nova-C, SLIM, Peregrine, Blue Ghost and Chang'e-3/4. Also Nova-C, SLIM and Peregrine array power.
- Apollo 11 LM descent battery count from an Apollo 11 primary source.
- HAKUTO-R M1 and Luna 25 costs; a NASA-authored "shots on goal" quote.
- Ranger, S-IVB and LCROSS impact coordinates for 0.5 km zones (look in the LROC 2016 table).
- Any published PSR plume-buffer distance (none found).
- The product-90 vertical datum statement (inferred as a 1737.4 km sphere).
- The Mazarico 2011 exact horizon parameters (paywalled; Barker 2021's description is used).
- The magnitude of the `LDEM_60S_240MPP_ADJ_ERR` error: read it from the file.
- Any lunar landing between 26 Oct 2026 and the seeding date.

---

## 13. Size and quota estimate

All figures are against Spark limits. Firestore quotas page, updated 2026-11-12: 1 GiB stored, 50K reads/day, 20K writes/day, 20K deletes/day, 10 GiB/month egress, one free database. Quotas reset around midnight Pacific.

| Data | Docs | Size |
|---|---|---|
| `ephemerisGlobal`, 2026–2030 at 1 h | 60 | ~1.1 MB as Bytes |
| `ephemerisGlobal`, ~35 historic ±7 d windows | ~35 | ~0.3 MB |
| `sites` + `terrain/v1` | ~45 + ~40 | ~0.5 MB |
| `terrainGrid` (~33,000 cells × ~1.1 KB, 16×16 tiles) | ~140–180 | ~36 MB |
| `psrLayer` | 1 (or a few tiles) | ≤ 0.5 MB |
| Everything else | ~100 | < 1 MB |
| **Total** | **≈ 450 docs** | **≈ 40 MB (about 4% of 1 GiB)** |

A full seed costs about 450 writes, so you can re-seed about 40 times a day.

**Reads for a cold Mission Control session:**

| Item | Reads |
|---|---|
| `catalog/siteIndex` + `catalog/meta` | 2 |
| Profiles | 3 |
| Presets | ~8 |
| Protection zones | ~15 |
| `psrLayer` | 1 |
| Per selected site (doc + terrain), 3 sites | 6 |
| Ephemeris months: 1–2 for a 14-day window, 12–13 for the year-long base profile; shared across sites because the series is global | up to 13 |
| Custom point grid tile | +1 |
| **Total** | **~30–50** |

So 50K reads/day supports **1,000+ cold sessions/day**. Repeat visits cost about 0 reads thanks to the persistent cache.

**Egress per cold session:** about 0.3–1 MB, mostly ephemeris months and `psrLayer`. Load `psrLayer` only when the zone overlay is on. 10 GiB/month allows roughly 10,000 or more cold sessions.

`80_validate.py` must recompute these numbers from the real seed and write `docs/DATA_SIZE_REPORT.md`.

---

## 14. Step-by-step plan

1. **Inspect the repo** (section 1.5) and report what you find.
2. **Accounts** (section 1.1). Don't continue until the correct account is active for both firebase and gcloud.
3. **Create the project** (section 1.2) and register the web app:
   - `firebase apps:create WEB "Shadowline Web" …`
   - Write the `apps:sdkconfig` output to `.env.local` as `NEXT_PUBLIC_FIREBASE_*`.
   - Commit `.env.example` with empty values.
4. **Create the Firestore database** (`us-east1`). Enable the Google provider; if the CLI can't, give the user the console path: Build › Authentication › Sign-in method › Google, support email taran.duba3@gmail.com.
5. **Pipeline.** Build `scripts/data-pipeline/` (section 7). Run the stages in order:
   - Run `00` → `21` first. The ephemeris and its check are quick and catch frame mistakes early.
   - Then run `30`, `40`, `50`, `60` and `70`.
   - Run `31` last; it is the long one. Report its runtime.
6. **Validate:** run `80_validate.py`. Every check is green or explicitly pending with a reason, and every document is under 500 KB.
7. **Seed script.** Extend `scripts/seed-firestore.ts`:
   - It writes every collection in section 6 from `data/seed/`, converting `{"$bytes"}` to `Buffer`.
   - It is idempotent, uses batched writes (≤ 500 per batch) and takes `--emulator` or `--prod`.
   - It prints counts per collection and never writes `users/*`.
   - Validation runs before any write (enums, weights, chapter-tool order, featured ids exist, sizes).
   - Run it with `npx tsx`.
   - Add npm scripts: `seed:emulator`, `seed:prod`, `emulators`, `test`.
8. **Client layer** (section 9). Add vitest tests:
   - Ephemeris math against the fixture (≤ 0.02°).
   - Mask interpolation wrap-around.
   - Bytes decode round-trip.
   - Grid snap.
9. **Emulators and rules tests:** auth on 9099, firestore on 8080, UI on 4000. All tests pass.
10. **Local smoke test** against the emulator:
    - Seed, then load the Apollo 11 site and its terrain, plus the ephemeris chunk for July 1969.
    - Run the client math at the landing instant and get 10.70 ± 0.02° Sun elevation.
    - Snap a custom point at −89.45, −137.31 to a grid cell.
    - Complete the chapters in order and confirm out-of-order is rejected.
    - Save and list a session.
    - Save a report summary and confirm it has no series.
    - `npm run lint` and `npm run build` pass.
11. **Deploy** the rules and indexes, run `seed:prod`, and verify the counts with the Admin SDK. Confirm nothing exists under `users/`.
12. **Report back** with:
    - The project id, region and account.
    - What was created and seeded, with counts and sizes from `DATA_SIZE_REPORT.md`.
    - Test results.
    - The validation table with computed values.
    - Pipeline runtimes.
    - Anything the user must do by hand.
    - The open decisions: profile duration (section 11.3), product copy changes (section 2.1), and the Artemis representative-point method.

---

## 15. Definition of done

- [ ] All resources are under taran.duba3@gmail.com, on the Spark plan, with Firestore `(default)` in `us-east1`.
- [ ] The pipeline reruns from a clean checkout using its README. `manifest.lock.json` lists every download.
- [ ] No raw DEMs are committed.
- [ ] Every stored number has a source or a `basis`. Unsourced values are null and listed in `MISSING_DATA.md`.
- [ ] `SOURCES.md`, `METHODS.md`, `MISSING_DATA.md` and `DATA_SIZE_REPORT.md` are written in `docs/`.
- [ ] The client math matches direct Horizons within 0.02° on the fixture, and the Apollo 11 check passes.
- [ ] Every document is ≤ 500 KB, and blob fields are exempt from indexing.
- [ ] Rules and indexes are deployed. Rules tests and vitest suites pass.
- [ ] `npm run lint` and `npm run build` pass, and the `CLAUDE.md` behaviours are preserved.
- [ ] Signed-out reads work with no login wall. localStorage progress merges on sign-in.
- [ ] The final report is delivered (step 12).

**Do not:**
- build UI, the 3D scene or the engine;
- call any external API from the browser;
- use another Google account or enable billing;
- fabricate any coordinate, time, sun angle, power figure or cost;
- describe a PSR as ice-bearing;
- present the PSR buffer as a standard;
- use the compat SDK.
