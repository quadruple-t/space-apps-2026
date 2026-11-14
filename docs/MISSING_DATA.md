# Missing, unsourced and assumed data

Everything below is left `null` (or labelled `basis: "assumption"`) in the seed. Nothing here was filled from memory. Last reviewed 2026-11-14.

## Still unsourced (values are null)

### Landing times and facts
- **Apollo 11 Mission Report (MSC-00171)** as-flown Sun elevation, and the Apollo 12-17 mission-report values. Only the ALSJ computed reconstructions (Fjeld and Scotti) exist, and they are labelled `computed-reconstruction`.
- **Chandrayaan-3**: exact touchdown time from ISRO (secondary sources give 18:03 IST; ISRO's pre-landing estimate was "around 18:04"), Sun elevation at landing and local sunrise time. The site's `landingTimeUtc` is the bare date `2023-08-23`.
- **Chandrayaan-2** crash time; **Beresheet** impact time; **Luna 23** landing time (`null`); **Luna 9** verified location (not located by LROC; the stored coordinate is a Soviet-era NSSDCA value with `coordsVerified: false`).
- **Second-level times** for Chang'e-3/4/5/6, SLIM and IM-2. IM-2's time zone is assumed CST (NASA's release omits it), so its time is `approx`. HAKUTO-R M1's time is `approx` ("moments before" 12:40 EDT).
- **Artemis region centroids and boundaries.** NASA has never published coordinates. The nine `representativePoint`s are nearest-feature centres (Cabeus B, Mons Mouton, de Gerlache, Slater) or PGDA product-78 tile centres (Haworth, Malapert massif, Mons Mouton, Nobile Rim 1 and 2). None is a region centroid. de Gerlache Rim 2 is ambiguous between PGDA Site11 and SL2, so it uses the crater centre. Better options not obtained: digitising NASA's 2024 region map, or the Wueller et al. 2026 JGR region shapefile (doi:10.1029/2025JE009434, HTTP 403).

### Spacecraft and power
- Lander **battery capacity, bus voltage, base and comms load, and temperature limits** for Vikram (Chandrayaan-2 and -3), Nova-C, SLIM, Peregrine, Blue Ghost and Chang'e-3/4. Also Nova-C, SLIM and Peregrine array power. The Nova-C 200 W / 25 Ah / 28 V figures appear only on Wikipedia, so they are not used.
- **Apollo 11 LM descent battery count** from a primary Apollo 11 source. The Apollo LM preset is the J-mission (5-battery) configuration.
- **Teaching-lander defaults** (`landerPresets/teaching-lander`): array power, battery Wh/Ah, bus voltage, base load, comms load and design life are `null` with `basis: "assumption"`. The team must choose them. Only the cell efficiency (29.2%, sourced) and a panel area derived from Vikram's 738 W (labelled `derived`) are filled.

### Costs and quotes
- **HAKUTO-R Mission 1** and **Luna 25** costs.
- A NASA-authored "shots on goal" quote. The stored quote is from a House Science Committee hearing charter and is attributed that way.

### Protection zones
- **Any published PSR plume-buffer distance**: none exists. NASA OTPS (2022) says no distance can eliminate ejecta impacts. The 2.0 km default is the NASA 2011 heritage landing stand-off applied by analogy, with a 1.5 km secondary ring, and is labelled as such.
- **Impact zones not created**: Ranger 1-5 (no coordinates in the LROC shapefile) and Surveyor 2/4 impact sites. Ranger 6-9, S-IVB (Apollo 13-17) and LCROSS have 0.5 km zones from the LROC shapefile coordinates.
- **Non-US sites** (Luna, Chang'e, SLIM, Chandrayaan, commercial CLPS landers) have no NASA-2011 zone; the 2011 document covers U.S. Government artifacts only.

### Terrain and ice
- **Error-clone percentiles** (`maskP05`, `maskP95`): `null` everywhere. The 100 product-78 error clones per site were not processed (about 10 GB per site; decision recorded 2026-11-14). The mask error band uses the propagated 1-sigma (`maskSigma`, `errorMarginDeg`) instead.
- **Per-crater ice detections.** No downloadable, defensible product exists. The flag is a *cold trap* (annual maximum temperature below 110 K, Diviner). Li et al. (2018) supplementary coordinates were not found.
- **Mazarico et al. (2011)** exact horizon parameters (paywalled). Barker et al. (2021) §5 is used.
- **PSR and cold-trap distances** are `null` for sites north of 80°S (the PGDA-90 PSR map covers 80-90°S only).
- **Slope at 100 m** is a 3x3-pixel plane fit (about 120-180 m baseline) outside the 80-90°S band and for the custom-coordinate grid; only 80-90°S sites use PGDA's 100 m plane-fit product.
- **Chang'e/IM-1/IM-2-era sites inside product-78 boxes** use the 5 m near field only where the whole 5 km near field fits inside the tile.
- **Two degenerate PSR polygons**: 2 of the 1,531 polygons in `LPSR_80S_20MPP_ADJ_1km2.SHP` have no valid polygon area after repair and are not in `psrLayer`.
- **Hayne et al. (2015)** and **Sanin et al. (2017, LEND)** products: not located.

### Time coverage
- Ephemerides are stored for 2026-01-01 to 2030-12-31 plus +-7 d windows around catalog landings from 1966. Dates outside those spans are not available without a new pipeline run.
- No lunar landing attempt was found between 26 Oct and 14 Nov 2026 (The Space Review checked through 26 Oct; web search on 14 Nov found only slips to 2027). Re-check before any later seeding.

## Resolved during the build (no longer missing)
- **Sun angular diameter**: from Horizons quantity 13 (Moon-centred), stored per ephemeris chunk (`sunAngularDiameterDegMean`, about 0.541° in January 2026).
- **Product-90 vertical datum**: not stated by PGDA, but the 240 m map differs from LOLA LDEM_64 (height above the 1737.4 km sphere) by a mean of -0.26 m over 4,000 points (correlation 0.99996). See `data/seed/_reports/datum-check.json`.
- **`LDEM_60S_240MPP_ADJ_ERR` magnitude**: median 0.59 m, 5th-95th percentile 0.12-3.05 m, maximum 20.4 m (`LDEM_80S_80MPP_ADJ_ERR`: median 0.29 m).
- **Mons Mouton = "Leibnitz beta"**: NASA SVS 5074 (15 Feb 2023): "sometimes known informally as Leibnitz Beta"; USGS Gazetteer feature 16070, adopted 13 May 2022, centre -84.60, 31.00.
- **IM-1 and Chandrayaan-3 coordinates** now use the LROC shapefile (2026-08-14), which gives four decimals.
- **WAC illumination scaling**: the 8-bit GeoTIFF is a display stretch (maximum DN 255 against a true maximum of 71.6%). The float32 PDS IMG (percent) is used for the lit-fraction cross-check.
