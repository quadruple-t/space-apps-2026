# Shadowline: terrain, PSR/ice, protection-zone and slope data research

Research date: 2026-11-14. Every fact below comes from a URL I opened in this session. Each source is listed beside its claim or at the end of its section. "Verified by header read" means I fetched only the first 4–128 KB of the file with an HTTP Range request and parsed the TIFF tags myself. Nothing larger than about 20 MB was downloaded. Statements marked **[derived]** are my own geometry or arithmetic, not taken from a source. Anything I could not verify is marked **UNSOURCED** and collected in section F.

---

## A. Terrain DEMs

### A1. PGDA product 90: "A New View of the Lunar South Pole from LOLA" (Barker et al. 2023), recommended primary polar DEM

Sources: https://pgda.gsfc.nasa.gov/products/90 and https://iopscience.iop.org/article/10.3847/PSJ/acf3e1

- **Citation:** Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W., Sun, X. (2023), *Planet. Sci. J.* 4:183, doi:10.3847/PSJ/acf3e1. **Data DOI:** 10.60903/gsfcpgda-lola-spole
- **Format:** The page says "All TIF files are cloud-optimized GeoTiffs". Coordinates are south polar stereographic X/Y in metres, in the MOON_ME frame of DE421. The download directory is https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/
- **Verified by header read** of `LDEM_80S_20MPP_ADJ.TIF`:
  - BigTIFF, float32, 512×512 internal tiles, DEFLATE with floating-point predictor, NaN nodata, with overviews at 15200² and 7600².
  - 30400×30400 pixels at 20 m, origin (−304000, +304000) m, so the extent is ±304 km.
  - GeoKeys: stereographic, centre latitude −90, sphere radius 1,737,400 m. The `.PRJ` of the PSR shapefile has the same definition (`Moon2000_spole`, `Stereographic_South_Pole`, sphere 1737400 m, central meridian 0, false easting and northing 0).
  - The server returns `Accept-Ranges: bytes` and Content-Length 2,696,082,051. HTTP range and `/vsicurl` windowed reads therefore work.
- **Heights:** The GDAL metadata z range is −7296.8 to +7027.2 m. This is consistent with height above a 1737.4 km sphere, which is the PDS LDEM convention. The page itself does not state the datum (see F).
- **Accuracy (paper):**
  - Remaining track geolocation error is about 1.00/1.00/0.15 m (along-track/cross-track/radial), down from roughly 7 m horizontal and 0.4 m radial.
  - Effective resolution is about 20 m/pixel over most of the Artemis zone (poleward of 84°S).
  - The LOLA footprint is about 5 m.
  - Gridding uses natural-neighbour interpolation.

| File (prefix_LAT_PIX) | Content | Size |
|---|---|---|
| LDEM_80S_20MPP_ADJ.TIF | height (m), 80–90°S | 2.6 G |
| LDEM_80S_20MPP_ADJ_ERR.TIF | height error (m) | 3.7 G |
| LDEM_80S_20MPP_ADJ_EFFRES.TIF | effective resolution (m) | 3.8 G |
| LDSM_80S_20MPP_ADJ.TIF / _ERR | slope (deg) / slope error | 3.6 G / 3.7 G |
| LDEC_80S_20MPP_ADJ.TIF | LOLA spots per pixel | 1.3 G |
| LDEM_80S_40MPP_ADJ.TIF | height, 40 m | 685 M |
| LDEM_80S_80MPP_ADJ.TIF (+_ERR) | height, 80 m | 181 M (244 M) |
| LDEM_83S_10MPP_ADJ.TIF (+_ERR) | height, 10 m, 83–90°S | 4.8 G (7.5 G) |
| LDEM_75S_30MPP_ADJ.TIF | height, 30 m, 75–90°S | 2.7 G |
| LDEM_60S_60/120/240MPP_ADJ.TIF | height, 60–90°S | 2.9 G / 785 M / 210 M |
| LDEM_60S_240MPP_ADJ_ERR.TIF | height error, 240 m | 255 M |
| LDRM_80S_{50,1000}MPP_ADJ_{ROUGH,SLP,RMSD}_{100..1600}M.TIF | roughness, plane-fit slope and RMS deviation at 100/200/400/800/1600 m baselines | 50 m: 509–616 M each; 1000 m: ~1.5 M each |
| LPSR_80S_20MPP_ADJ.{TIF,SHP,DBF,SHX,PRJ,CSV} | all PSRs (N=506,349) | TIF 148 M, SHP 154 M, CSV 209 M |
| LPSR_80S_20MPP_ADJ_1km2.{SHP,…,CSV} | PSRs larger than 1 km² (N=1,531) | SHP 20 M, CSV 28 M |
| LDEM_80S_ADJ.XYZI / LDEM_60S_ADJ.XYZI | point clouds | 13 G / 48 G (do not download) |

- **Horizon method in this paper:** "Horizon elevation was computed in all directions using nested maps, from 20 m/pixel out to 7 km and 480 m/pixel out to 310 km". This is my fetch-tool summary of the paper; the exact wording was not checked.
- **PSR method:** The Sun was placed at its minimum declination over the 18.6-yr precession cycle, using a fake SPICE kernel. That took 720 time steps instead of about 165,000.
- **PSR results:** Total PSR area poleward of 80°S is about 20,800 km². "PSRs with areas <1 km2 contain 15% ± 5% of the total PSR area". False-positive fractions reach about 50% for 1-pixel PSRs near 80°S.

### A2. PGDA product 78: "High-Resolution LOLA Topography for Lunar South Pole Sites" (5 m/pixel)

Sources: https://pgda.gsfc.nasa.gov/products/78 and https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README. The paper is Barker et al. 2021, read from the NTRS PDF https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf

- **Citation:** Barker, M.K., Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Head, J.W. (2021), "Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions," *Planet. Space Sci.* 203, 105119, doi:10.1016/j.pss.2020.105119.
- **Accuracy:**
  - Track geolocation uncertainty is about 10–20 cm horizontal and 2–4 cm vertical.
  - RMS height error is about 0.30–0.50 m and RMS slope error about 1.5–2.5°.
  - About 90% of 5 m pixels are interpolated.
- **Files per site** (`https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/<Site>/`):
  - `<Site>_final_adj_5mpp_surf.tif`: height (m)
  - `_toterr.tif`: RMS height error (m)
  - `_slp.tif` and `_slperr.tif`: slope and slope error (deg)
  - `_ldec.tif`: LOLA spot count
  - `<Site>_final_adj.xyzi`: point cloud
  - `Clones/<Site>_final_adj_5mpp_0001..0100_err.tif`: 100 error clones
  - `<Site>_ROIs.tgz`: ROI shapefiles, where available
- **Grid:** Stereographic, MOON_ME/DE421, GMT pixel-registered. The README describes `surf` as surface height Z in metres with empty pixels filled by interpolation.
- **Format (verified by header read):** Uncompressed float32 GeoTIFF with strips, not a COG. Site01 is 40,980,810 bytes. GeoKeys give a 1737400 m sphere with stereographic centre −90. These files are small enough to download whole.
- **Release history:** 2021/04/26 Site42, DM1, SL2; 2021/05/24 NPA, NPB; 2021/06/14 NPC, NPD; 2021/08/10 LM1–LM8; 2022/08/15 Site20v2.

**Site boxes, verified by header read of each `_surf.tif`.** Box-centre lat/lon is **[derived]** from the stereographic X/Y using R = 1737.4 km. It is the centre of the DEM box, not an official site coordinate.

| Site (name per PGDA) | Size (px @5 m) | X range (km) | Y range (km) | Box centre lat, lon (E) |
|---|---|---|---|---|
| Site01 Connecting ridge | 3200² | −19…−3 | −20…−4 | −89.463, 222.51 |
| Site04 Shackleton rim | 3200² | −9…7 | −15…1 | −89.767, 188.13 |
| Site06 Nobile rim 1 | 4000² | 74…94 | 100…120 | −85.438, 37.37 |
| Site07 Peak near Shackleton | 3200² | 22…38 | −28…−12 | −88.811, 123.69 |
| Site11 de Gerlache rim | 3200² | −45…−29 | 7…23 | −88.683, 292.07 |
| Site20 Leibnitz beta plateau | 3200² | 65…81 | 110…126 | −85.427, 31.74 |
| Site20v2 (extended) | 5200² | 60…86 | 105…131 | −85.427, 31.74 |
| Site23 Malapert massif | 4200² | −11…10 | 111…132 | −85.995, 359.76 |
| Site42 de Gerlache-Kocher massif | 4000² | −123.4…−103.4 | −66.1…−46.1 | −85.830, 243.68 |
| Haworth | 5960² | −52.9…−23.1 | 75.6…105.4 | −86.764, 337.22 |
| Shoemaker | 4000² | 66…86 | 29…49 | −87.184, 62.84 |
| DM1 Amundsen rim | 4000² | 154…174 | 51.5…71.5 | −84.229, 69.44 |
| DM2 Nobile rim 2 | 4000² | 147…167 | 85…105 | −83.954, 58.82 |
| SL2 de Gerlache rim | 4000² | −58.5…−38.5 | 13…33 | −88.230, 295.37 |
| SL3 Connecting ridge ext. | 4000² | −38.7…−18.7 | −16.1…3.9 | −89.032, 258.00 |
| NPA Cabeus exterior wall 1 | 4000² | −98.5…−78.5 | 19.5…39.5 | −86.924, 288.43 |
| NPB Amundsen 1 | 4000² | 175…195 | −8.5…11.5 | −83.905, 89.54 |
| NPC Idel'son L crater 1 | 4000² | 122.5…142.5 | −109.5…−89.5 | −84.540, 126.90 |
| NPD Malapert crater 1 | 4000² | 13…33 | 146…166 | −84.803, 8.39 |
| LM1 Shackleton Rim B | 4000² | 2…22 | −2…18 | −89.524, 56.31 |
| LM2–LM6, LM8 Shoemaker Rims A–F | 4000² | see headers | | −88.08 to −87.34 |
| LM7 Faustini Rim A | 4000² | 54…74 | −10…10 | −87.890, 90.00 |

Barker 2021 lists RoI centroids for Site01. For example X −11.58 km, Y −12.46 km, which places Site01 at roughly 89.46°S, 222.5°E **[derived]**. Sanity check: Barker 2021 says these are "16 × 16 km regions", which matches 3200 px × 5 m.

### A3. PDS LOLA GDR polar products (older, V2.0; superseded for the pole by A1)

Sources: https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/, the label https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_20M.LBL, the listing https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/, and https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRDEM.htm

- **LDEM_80S_20M label:**
  - PRODUCT_VERSION_ID "V2.0", created 2017-06-15.
  - POLAR STEREOGRAPHIC, A/B/C_AXIS_RADIUS 1737.4 km, CENTER_LATITUDE −90, CENTER_LONGITUDE 0, MAP_SCALE 20 m.
  - 30400×30400 pixels, LSB_INTEGER 16-bit, SCALING_FACTOR 0.5, OFFSET 1737400, LINE/SAMPLE_PROJECTION_OFFSET 15199.5.
  - Gridded with GMT blockmedian/surface.
- **Data set ID:** LRO-L-LOLA-4-GDR-V1.0. Polar products are "projected at a radius of 1,737,400 m, true at the pole" (ODE).

| Product (south) | Res | IMG size | JP2 size |
|---|---|---|---|
| LDEM_45S_100M / 200M / 400M | 100/200/400 m | 1583 / 396 / 99 MB | 303 / 112 / 39 MB |
| LDEM_60S_120M / 240M | 120/240 m | 460 / 115 MB | 106 / 38 MB |
| LDEM_75S_30M / 60M / 120M / 240M | | 1774 / 444 / 111 / 28 MB | 219 / 79 / 29 / 10 MB |
| LDEM_80S_20M / 40M / 80M | | 1763 / 441 / 111 MB | 194 / 69 / 25 MB |
| LDEM_85S_10M / 20M / 40M | | 1756 / 439 / 110 MB | 175 / 60 / 21 MB |
| LDEM_875S_5M / 10M / 20M | | 1756 / 439 / 110 MB | 163 / 56 / 20 MB |

Each product has a matching LDEC_* spot-count file. The same IMG directory also holds `LDSM_75S_120M`, `LDSM_75S_240M`, `LDSM_85S_40M` (slope), and `LDRM_40S_1000M(_NN)`, `LDRM_75S_240M`, `LDRM_85S_40M` (roughness). Those are described in D.

### A4. Global DEMs for non-polar sites (Apollo, Luna, Chang'e-4/6, SLIM)

| Product | URL | Res | Coverage | Size / format | Accuracy | Citation |
|---|---|---|---|---|---|---|
| **SLDEM2015** (LOLA + SELENE TC) | https://pgda.gsfc.nasa.gov/products/54; tiles at https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/ | 512 ppd = 59.2252938 m/px (label MAP_SCALE) | ±60° lat | 64 tile files (IMG + LBL), e.g. `SLDEM2015_512_00N_30N_000_045_FLOAT.IMG`: 30°×45° per tile, 15360×23040 px, PC_REAL 32-bit, UNIT km, OFFSET 1737.4, 1,415,577,600 bytes. Global 256/128 ppd: `SLDEM2015_256_60S_60N_000_360_FLOAT.IMG`, `…_128_…`. Also `SLDEM2015_DATA_QUALITY_FLOAT.IMG`. V2.0, 2015-09-15. Server supports byte ranges. | "typical vertical accuracy approx.3 to 4 m"; after co-registration about 90% of TC DEMs have <5 m RMS residual to LOLA (https://ntrs.nasa.gov/citations/20170002253) | Barker et al. (2016) *Icarus* 273, 346–355, doi:10.1016/j.icarus.2015.07.039 |
| LOLA LDEM cylindrical | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/ | LDEM_4/16/64/128 (237 m), 256 (118 m), 512 (59 m), 1024 (29.6 m) | global | 512 ppd as 16 tiles of 45°×90° (IMG and `_FLOAT.IMG`). 1024 ppd only as JP2 tiles of 15°×30°, e.g. `LDEM_1024_00N_15N_000_030.JP2` | PGDA: LOLA about 10 cm precision, about 1 m accuracy (https://pgda.gsfc.nasa.gov/products/54) | LRO-L-LOLA-4-GDR-V1.0 |
| USGS "Moon LRO LOLA DEM 118m" | https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif (302 → `asc-pds-services.s3.us-west-2.amazonaws.com`) | 118 m | global | 8,494,203,833 bytes. Verified header: BigTIFF, int16, 92160×46080, **one row per strip, uncompressed, not a COG**, nodata −32768. Range reads of rows still work. | — | USGS Astrogeology, 2014-03-11 (search-result listing) |
| USGS LOLA–Kaguya merge 60N60S 512 ppd | planetarymaps path `Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd.tif` | 59 m | ±60° | **The redirect target returned HTTP 404 on 2026-11-14.** The astrogeology catalogue page returned 403. | — | — |
| GMT `@moon_relief_xxx` | https://www.generic-mapping-tools.org/remote-datasets/moon-relief.html | 01d down to 14s (original 118 m). Resolutions 05m and finer are tiled. | global | Auto-downloaded tiles, int16 with a 0.5 m z step (the page warns about quantisation for slope work) | — | derived from the USGS 118 m LDEM |

**COG check:**
- PGDA product 90 polar files **are COGs** (verified). PGDA product 69 illumination maps are also offered as COG (https://pgda.gsfc.nasa.gov/products/69).
- The USGS Astrogeology STAC API (https://stac.astrogeology.usgs.gov/api/collections?limit=200) has 18 collections. The Moon ones are LOLA shot observations and Kaguya TC uncontrolled observations and USGS DTMs v2 (equi, northpolar, southpolar). **There is no SLDEM2015 or global LOLA LDEM COG collection.**
- I found no COG of SLDEM2015.
- SLDEM2015 PDS tiles are raw float32 with a fixed row stride, so any window can be fetched with HTTP Range reads computed from the label: offset = (line × 23040 + sample) × 4.

### A5. Published horizon / illumination methods

| Paper | Method facts (as read) | Source opened |
|---|---|---|
| Mazarico et al. 2011, *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030 | Abstract: "We determine the horizon elevation in a number of directions" based on 240 m polar DEMs reaching 75° latitude. Illumination to 80° is then computed "from those horizon longitudinal profiles". Validated against LROC WAC images. Exact azimuth count, ray length and accuracy are **not in the abstract** (see F). | https://ntrs.nasa.gov/citations/20120010094; product 69 page |
| Barker et al. 2021 (PSS 105119), §5 | Follows "the horizon method outlined in Mazarico et al. (2011)". Horizon elevation from every pixel "along 720 sight lines spaced 0.5° apart in azimuth". Nested grids: 5 m LDEM for <5 km, 80 m LDEM for 5–100 km, 240 m LDEM beyond. Computed in Cartesian coordinates at 1 h steps. The Sun is "a 2-dimensional extended source with limb darkening at 550 nm"; visible fraction comes from "horizontally dividing the disk at the horizon's elevation measured at the disk center's azimuth". The near-field horizon is about 100 m away (10s of m to about 1 km) and the far field about 50–200 km. Errors in the far-field DEM do not significantly matter "because the far-field horizon is ~3 orders of magnitude farther away". Clone perturbations "are more likely to raise than lower the horizon". Observer heights Δz = 1 m and 5 m. | NTRS PDF (text extracted) |
| Barker et al. 2023 (PSJ 4:183) | Nested maps: 20 m out to 7 km and 480 m out to 310 km. Sun at minimum declination for PSR mapping. | iopscience page |
| Gläser et al. 2014, *Icarus* 243, 79–90, doi:10.1016/j.icarus.2014.08.013 | 20 m/px adjusted LOLA DTM, 20×20 km study region. Sunlight "92.27% of the time at 2 m … 95.65% … at 10 m". | https://elib.dlr.de/94240 |
| Gläser et al. EPSC2017-693-3 | 400×400 km, 20 m/px DTMs used for central 50×50 km subsets "while taking into account the far-field topography". Horizon method with "the Sun as an extended source". 2 h time step. | EPSC PDF (text extracted) |
| Speyerer & Robinson 2013, *Icarus* 222, 122–136, doi:10.1016/j.icarus.2012.10.010 | Observational: 3,807 WAC images over one lunar year, each map-projected, binarised and stacked. See B4. | LROC pages |
| PGDA product 69 (Mazarico products) | Averages over hourly steps across the ~18.6 yr cycle. Polar stereographic at 1737.4 km. Earth visibility uses a resized and repositioned disc, counted visible if any part is unobscured. Sky visibility = unobscured solid angle. | https://pgda.gsfc.nasa.gov/products/69 |

### A6. Recommended recipe: per-site horizon mask

1. **Data, nested like Barker 2021/2023:**
   - Near field, d < 5 km: the PGDA 5 m site DEM when the site lies inside a product-78 box. Otherwise use a window of `LDEM_83S_10MPP_ADJ` (sites ≥83°S) or `LDEM_80S_20MPP_ADJ` (≥80°S). Read about ±8 km windows via COG range reads, for example `rasterio` with `/vsicurl/` (GDAL).
   - Mid field, 5–100 km: `LDEM_80S_80MPP_ADJ.TIF` (181 MB, download whole) or a 20/40 m window.
   - Far field, 100–310 km: `LDEM_60S_240MPP_ADJ.TIF` (210 MB). Its ±~931 km extent **[derived]**: ρ = 2R·tan(15°) covers every 310 km ray from any south-polar site. The 80S products only reach ±304 km, which is not enough for sites near 84°S.
   - Non-polar sites: SLDEM2015 512 ppd tile window (±60°), or LOLA LDEM_512 / LDEM_1024 beyond ±60°.
2. **Ray casting:**
   - Use 720 azimuths at 0.5° (Barker 2021) and march outward to 310 km (Barker 2023).
   - Use a step of about one pixel of the active nest level, for example 5 m → 20 m → 80 m → 240 m.
   - Interpolate bilinearly in the DEM's native stereographic grid. Walk the ray along a great circle: convert the start point to lat/lon, step by the central angle, then project back to X/Y. A straight line in polar stereographic is not a great circle **[derived]**.
3. **Curvature (exact on a sphere) [derived]:**
   - Observer radius r₀ = R + h_obs + Δz. Target radius r₁ = R + h(d). Central angle γ = d/R.
   - Elevation angle θ = atan2(r₁·cosγ − r₀, r₁·sinγ). The mask value is θ_max(az) = max over d.
   - Curvature drop ≈ d²/2R: about 0.72 km at 50 km, 2.9 km at 100 km, 6.5 km at 150 km and 25.9 km at 300 km. Ignoring curvature is therefore badly wrong at the pole.
   - Use R = 1737.4 km, the same sphere as all products above.
4. **Heights:** Use Δz = 1 m and 5 m to match Barker 2021. A lander or HLS mast can use a larger value; the 40 m HLS observer height is cited secondhand (D2).
5. **Output:** 720 floats per site. Optionally also store d_at_max(az) so the error margin below can be computed.

### A7. Error margin for the mask elevation

**[derived]** small-angle propagation. For the obstruction that sets θ_max at slant distance s:

- **Height error:** σθ ≈ (σz·cosθ)/s (radians), with σz from `_toterr.tif` (5 m), `LDEM_*_ERR.TIF` (product 90), or 3–4 m for SLDEM2015.
  - 0.4 m at 1 km → 0.023°.
  - 0.4 m at 100 m → 0.23°.
  - 5 m (240 m-grid error, not verified) at 150 km → 0.002°.
  - Near-field error dominates, which matches Barker 2021's statement that far-field DEM error does not matter.
- **Horizontal error:** about σxy·tan(local slope)/s. Use σxy ≈ 1 m for product 90 (paper) and 0.1–0.2 m for product 78.
- **Resolution bias:** Coarse cells smooth peaks and bias θ low. EFFRES gives the effective resolution.
- **Conservative band:** θ_max ± 2σθ, where σθ = sqrt(Σ components²).
- **Gold standard where 5 m clones exist:** Recompute the mask on all 100 `Clones/*_err.tif` and report the 5th–95th percentile per azimuth. Barker 2021 notes the clone distribution is skewed toward a higher horizon, so the uncertainty is asymmetric.

---

## B. PSRs and ice

### B1. PSR maps

| Product | Res | Coverage | Format | Source | Citation |
|---|---|---|---|---|---|
| **LPSR_80S_20MPP_ADJ** (+ `_1km2` subset) | 20 m | 80–90°S | TIF + shapefile (SHP/SHX/DBF/PRJ) + CSV. The CSV columns are `gid,WKT,area_km2,name` (verified by range read); WKT MULTIPOLYGON is in stereographic metres. | https://pgda.gsfc.nasa.gov/products/90 | Barker et al. 2023 |
| GDRPSR 2011 / 2014: `LPSR_nnp_240M` | 240 m | 2011: ±264 km (complete to ~81.3°). 2014: ±770 km (complete to 65°). | IMG/LBL/JP2, DN·SCALING+OFFSET | https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRPSR.htm | ODE gives no citation. PGDA product 69 asks users to cite Mazarico et al. 2011. |
| GDRPSR 2016: `LPSR_nnp_rrrM_201608` (e.g. `LPSR_85S_60M_201608`) | 240 m or 60 m | ±770 km (complete to 65°) or ±151 km (complete to 85°) | IMG/JP2, plus TIF/COG on PGDA product 69 | ODE GDRPSR and https://pgda.gsfc.nasa.gov/products/69 | Mazarico et al. 2011 |

**Recommendation:**
- Use `LPSR_80S_20MPP_ADJ_1km2.SHP` (20 MB) for named, sizeable PSRs.
- Use the full `LPSR_80S_20MPP_ADJ.SHP` (154 MB) when computing nearest-PSR distance, because small PSRs near rims matter for an EVA.
- The paper warns that small PSRs have high false-positive rates near 80°S. Consider a minimum area of 5 pixels (2,000 m²), which matches the paper's ≥5-pixel statistic.
- **Distance recipe [derived]:** Compute the Euclidean distance in the stereographic plane from the site to the nearest polygon edge, using shapely or GEOS. Then correct by the point scale factor k = 2/(1+cos(colat)), which is 1.0027 at 84°S, or use a great-circle distance to the nearest vertex.

### B2. Ice-evidence datasets

| Dataset | What | Downloadable? | Source opened |
|---|---|---|---|
| **Diviner Polar Resource Product (PRP)**, Paige et al. 2010, *Science*, doi:10.1126/science.1187726 | Per triangle: `temp_avg`, `temp_max` (annual maximum, K) and `ice_depth` (m) | **Yes.** `dlre_prp_south.tab` (604,800,210 bytes, ASCII, 2,880,000 rows × 210 bytes, 15 columns: triangle vertices x/y/z in km, `tri_clon`, `tri_clat`, `tri_calt`, `temp_avg`, `temp_max`, `ice_depth`). Square region to 80°, mesh built on a Kaguya-LALT polar DEM, fits to the first year of Diviner mapping. Data set LRO-L-DLRE-5-PRP-V2.0, created 2018-02-21. https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ | ODE PRP help page; PDS label |
| Diviner Polar Cumulative Products (PCP), Williams et al. 2019, *JGR* 124, 2505–2521, doi:10.1029/2019JE006028 | 240 m polar stereo bins poleward of 80°. Maximum summer and winter surface temperatures. Areas below 110 K. | PDS `data_derived_pcp/{diurnal,seasonal}/` (Aug 2022). UCLA raster mirror `luna1.diviner.ucla.edu/~jpierre/diviner/level4_polar/` **did not respond** on 2026-11-14. | https://www.diviner.ucla.edu/single-post/2020/07/20/new-diviner-seasonal-polar-data-products |
| Li et al. 2018 PNAS 115(36), doi:10.1073/pnas.1802345115 | M3 ~280×280 m pixels with simultaneous 1.3/1.5/2.0 µm absorptions and spectral angle <30° to frost, in shadow (incidence ≥90°). Filtered by LOLA albedo >0.35, LAMP off/on ratio >1.2 (south only) and Diviner Tmax <110 K. 93.2% of M3 detections meet the other criteria. About 3.5% of cold traps show exposures. | **No data-availability statement or download found.** The PMC page lists only an SI PDF of 19.3 MB, not opened. | https://pmc.ncbi.nlm.nih.gov/articles/6130389 |
| Fisher et al. 2017, *Icarus* 292, 74–85, doi:10.1016/j.icarus.2017.03.023 | South-polar 1064 nm LOLA reflectance "increases rapidly with decreasing temperature… near approximately 110K". Not seen in the north. | Dataset not located | https://ntrs.nasa.gov/citations/20170003782 |
| Hayne et al. 2015, *Icarus* 255, 58–69, doi:10.1016/j.icarus.2015.03.032 | LAMP UV albedo plus Diviner temperatures | Not located. The abstract was not opened (see F). | https://vivo.colorado.edu/display/pubid_233452 (citation only) |
| Sanin et al. 2017 (LEND), *Icarus* 283, 20–30, doi:10.1016/j.icarus.2016.06.002 | Water-equivalent hydrogen in the top ~1 m from collimated neutron counts | No PDS product found | https://ntrs.nasa.gov/citations/20170002485 |

**Recommendation for the per-PSR flag:**
- **Primary flag, "cold-trap / ice-stable":** the fraction of each PSR polygon's area covered by Diviner PRP triangles with `temp_max < 110 K`. Flag `ice_stable = fraction ≥ 0.5`, or show the fraction directly.
- **Why:**
  1. It is the only candidate verified as downloadable, gridded and documented.
  2. The 110 K threshold appears in both evidence papers I opened: Li 2018 (a filter) and Fisher 2017 (the reflectance transition).
  3. It is defensible to state as "temperature allows surface ice", without claiming ice was detected.
- **Optional second tier, "surface-ice evidence":** digitise Li 2018 detections only if the SI provides coordinates (not verified).
- **UI wording:** "Cold-trap (Tmax <110 K, Diviner)", not "ice-bearing". Li 2018 itself found ice exposures in only about 3.5% of cold traps.
- **Caveats:** The PRP is built on a Kaguya DEM from the first year of Diviner data. Its mesh is coarse compared with the 20 m PSRs. A rough triangle size of 0.13 km² **[derived]**: (608 km)² / 2.88 M, assuming a ±304 km square.

### B3. Illumination cross-check: LROC WAC polar illumination maps (Speyerer & Robinson 2013)

Sources: https://lroc.im-ldi.com/images/991, https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH, https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH

- **Products:**
  - `WAC_POLE_ILL_PCT_SOUTH_100M`: percentage-based.
  - `WAC_POLE_ILL_TWI_SOUTH_100M`: time-weighted. Images from sparse periods are weighted ×2, and missed observations are linearly interpolated.
- **Grid:** 100 m/pixel, 88°S to the pole, polar stereographic orthorectified on a 30 m LOLA DEM. Delivered as 8-bit GeoTIFF plus PNG browse.
- **Inputs:** 3,807 WAC images from 15 Feb 2010 to 5 Feb 2011 (one lunar year), plus 229 observations with near-identical lighting used to fill gaps.
- **Caveats:**
  - Some PSRs read close to but not exactly zero because of noise and scattered light.
  - There may be biases from uneven imaging, for example no WAC imaging on Mini-RF polar orbits.
- **How to cross-check [derived]:**
  1. Run the horizon mask through one lunar year (Feb 2010–Feb 2011) with JPL Horizons/SPICE Sun positions at hourly steps.
  2. Compute the lit fraction as the share of time steps with Sun-centre elevation above θ_max(az), to mimic a binary image.
  3. Compare with the PCT map value at the site pixel (value/255 or per the README).
  4. Expect agreement within a few tens of percent at 100 m scale. It is a sanity check only, because the WAC observes the surface (Δz = 0) at 100 m.
  5. For a multi-year cross-check use PGDA product 69 `AVGVISIB_85S_60M_201608` (also COG), which averages over 18.6 yr. Note that product 69 recommends further analysis for shorter periods and heights above the surface.

---

## C. Protection zones

### C1. NASA (2011) "NASA's Recommendations to Space-Faring Entities: How to Protect and Preserve the Historic and Scientific Value of U.S. Government Lunar Artifacts"

- **Official PDF:** https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf (93 pages, text extracted).
- **Releases:** baseline 07/20/2011; Rev A 10/28/2011, which added imagery and Appendix D.

| § | Boundary | Distance / rule (short quotes) | Applies to |
|---|---|---|---|
| A1-3 | Descent/Landing (D/L) boundary | Lander sites: "extending to a 2.0 km radial distance from the site where no overflight of a landed spacecraft may occur". Impact sites: "extending to a 0.5 km radial distance from the center of the impact site". | Heritage lander sites ("Apollo, Surveyor"); heritage impact sites ("Ranger, S-IVB") |
| A2-1 | Approach path | The 0.5 km exclusion radius applies to the D/L path for impact sites. The approach path is defined as intended path plus 3σ dispersion (A1-2). | |
| A2-2 | No overflight | "trajectory should remain tangential to the D/L boundary" | all USG heritage sites |
| A2-3 | Touchdown targeting | "no less than 2.0 km or three-sigma of the landing uncertainty (whichever is greater) from any USG heritage landers". Also "maximum dispersion ellipse maintains the no-closer-than 2.0 km distance". | heritage landers |
| A2-3 rationale | Plume ejecta | Rocks 1–10 cm "impacted the lunar surface up to 1.5 km from the LM"; "The lunar horizon is roughly 1.8 km from any given point"; Apollo 12 "landed 155 m from the Surveyor 3"; ejecta sheet at 1–3° elevation; 300–2000 m/s particles | |
| A2-4 | Braking-stage disposal | IP "greater than 2.0 km from the heritage site (0.5 km for impact sites)" | |
| A2-7 | Multi-engine landers | Orient the engine axes so plume "rooster tail" reflection planes point away from the site | |
| A3-1 / A3-2 | Apollo 11 and 17 artifact boundary | "the exclusion zone extends 75 m from the lunar module descent stage" (Apollo 11). "extends 225 meters" (Apollo 17). Visits to any part of these two sites are prohibited. | Apollo 11, 17 |
| A3-3 | Apollo 12, 14–16 | "Descent stage – 3 meters buffer"; LRV, ALSEP, sampling sites and all other artifacts "1 meter buffer". No restriction on footprints or tracks outside these zones. | Apollo 12, 14, 15, 16 |
| A3-3 B | LRRRs | Within "a 10 m radius zone" move only at speeds that do not propel regolith forward; "total exclusion zone of 1 m radius". | Apollo 11, 14, 15; Lunokhod 1/2 |
| A3-4 | Surveyor | "A 1 m buffer exclusion zone … around all Surveyor spacecraft hardware" | Surveyor sites |
| A3-5 | Impact craters | Rovers may drive to the rim; entering requires prior NASA coordination | Ranger, S-IVB |
| A3-9 | Hoppers | Must not land within the 2.0 km D/L radius | |
| A3-10 | Low-altitude fly-by | "minimum of 40 m altitude" | |
| A4-3 | Propellant | Within 200 m altitude, no exclusion zone may intersect the 45° half-angle cone about the engine axis | |

For the robotic sites Luna, Chang'e and SLIM: the 2011 document covers only **U.S. Government** artifacts. Non-US sites are not covered. The NASA 2022 OTPS report (C2) lists LCROSS among the 0.5 km "impact sites" examples, which is relevant to the south pole because LCROSS hit Cabeus.

### C2. Later instruments

- **One Small Step to Protect Human Heritage in Space Act**, Pub. L. 116-275, 31 Dec 2020 (https://www.govinfo.gov/content/pkg/PLAW-116publ275/html/PLAW-116publ275.htm):
  - Sec. 3(a): NASA must add the recommendations "as a condition or requirement to contracts, grants" etc. for lunar activities.
  - Sec. 3(b): defines the 2011 document (July 20 2011, "updated on October 28, 2011") and "any successor recommendations".
  - Sec. 3(c): waiver allowed with 30-day notice to Congress.
  - The Act itself specifies no distances.
- **Artemis Accords**, 13 Oct 2020 (https://www.nasa.gov/wp-content/uploads/2022/11/Artemis-Accords-signed-13Oct2020.pdf):
  - Section 9: signatories "intend to preserve outer space heritage", comprising "historically significant human or robotic landing sites, artifacts, spacecraft…".
  - Section 11.7: "safety zones" whose size and scope are "determined in a reasonable manner" and are "ultimately temporary". No distances are given.
  - The NASA page (https://www.nasa.gov/artemis-accords/) says Vietnam became the 78th signatory on 2026-10-28.
- **NASA OTPS "Lunar Landing and Operations Policy Analysis"**, 30 Sep 2022, Report ID 20220015973 (https://www.nasa.gov/wp-content/uploads/2022/10/lunar_landing_and_operations_policy_analysis_final_report_24oct2022_tagged_0.pdf):
  - Summarises the 2011 distances, citing LCROSS as an impact site.
  - Notes CLPS landing ellipse "100m in diameter" and HLS "landing radius of 100m for HLS A and 50m for Option B and SLD".
  - Quotes Wittal et al.: at 1 km "as many as 8 impacts per landing", 37% impact chance at 5 km and 10% at 10 km, for a 1 km² base and a 10 t lander.
  - States "there is no distance that can entirely avoid the possibility of any impacts".
  - Suggests future stand-off distances based on energy flux.
  - On PSRs: it makes "no recommendation" on reserving them for science.
- **A 2023 or 2024 NASA update of the 2011 recommendations:** none found (see F).

### C3. Plume-ejecta evidence and a PSR buffer

- **Apollo 12 / Surveyor III:** 155 m separation. Surveyor received "significant sandblasting and pitting" even though it sat below the main sheet (2011 doc §A2-3 rationale). Immer et al. 2011 (*Icarus* 211, 1089, doi:10.1016/j.icarus.2010.11.013) is cited in search results; I could not open it (ADS returned 405).
- **LROC blast zones:** Clegg et al. 2014, "Effects of rocket exhaust on lunar soil reflectance properties", *Icarus* 227, 176–194, doi:10.1016/j.icarus.2013.09.013. The DOI is from Crossref; the abstract was read via the mirror https://manuscript.isc.ac/Inventory/10/2380165.htm.
  - Average Apollo blast zone is about 29,000 m², roughly 175 ± 60 m × 200 ± 27 m. That is "10× larger than the average Luna BZ, and over 100× larger than the average Surveyor BZ".
  - Chang'e-3: diffuse blast zone extends about 40–50 m N–S and 10–15 m E–W beyond the primary zone (https://lroc.im-ldi.com/images/929; Clegg-Watkins et al. 2016, *Icarus* 273, 84–95, doi:10.1016/j.icarus.2015.12.010).
- **Usable PSR-ice buffer?** **No published number clearly supports a specific PSR buffer.**
  - The only defensible published distances are:
    - the 2011 document's 2.0 km landing stand-off and 1.5 km rock-ejecta range (Apollo LM scale);
    - the about 100–200 m visible blast-zone scale (Clegg 2014);
    - the Wittal probabilistic numbers (1/5/10 km).
  - NASA 2022 explicitly says a safe distance does not exist in principle.
  - **Recommendation:** Expose the buffer as a user parameter, defaulting to 2.0 km and labelled "NASA 2011 heritage-site landing stand-off, applied by analogy". Show the 1.5 km rock-ejecta range as a secondary ring. Do not present either as a PSR-protection standard.

---

## D. Slope and roughness

### D1. Products

| Product | Res / baseline | Notes | Source |
|---|---|---|---|
| `LDSM_80S_20MPP_ADJ.TIF` + `_ERR` | 20 m | slope in degrees, plus error; COG | PGDA product 90 |
| `<Site>_final_adj_5mpp_slp.tif` + `_slperr.tif` | 5 m | RMS slope error about 1.5–2.5° | PGDA product 78 / Barker 2021 |
| `LDRM_80S_50MPP_ADJ_{ROUGH,SLP,RMSD}_{100,200,400,800,1600}M.TIF`, `…_H.TIF` (Hurst), `…_CLASS.TIF` | 50 m grid, 100–1600 m baselines (also 1000 m grids) | Roughness is "the spread of height residuals of individual LOLA spots around a plane fit to the LDEM". The 50 m-baseline roughness comes from the PDS single-shot product. | PGDA product 90 |
| PDS `LDSM_85S_40M`, `LDSM_75S_120M/240M` | 40 m (baseline "may vary from 30 to 120 meters") | V2.0, 2012-06-15. BIDIRECTIONAL_SLOPE, SCALING 0.0015, OFFSET 45, degrees. | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDSM_85S_40M.LBL |
| PDS `LDRM_85S_40M`, `LDRM_75S_240M`, `LDRM_40S_1000M` | 40 m | ROUGHNESS in m, SCALING 0.001; built from successive 3-shot fits | `LDRM_85S_40M.LBL` |
| Rosenburg et al. 2011, *JGR* 116, E02001, doi:10.1029/2010JE003716, "Global surface slopes and roughness of the Moon from the LOLA" | — | Citation via Crossref API | api.crossref.org |

### D2. Hazard thresholds (sourced only)

- **Artemis III (NASA, Dwyer Cianciolo, "Artemis Human Landing System Update", 1 Aug 2024; https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf):**
  - "Land within 6 deg latitude of the South Pole"
  - "Surface slope for landing (100m): <10 deg"
  - "Surface slope limit for EVA (2km): <20 deg"
  - Direct-with-Earth comms; Earth visibility <25% reduces suitable area; solar visibility <5% is used as a lighting cut
  - "Land within 100 m of a target"
  - The slope map also shows white contours at 8°.
  - The briefing links PGDA product 78 for the terrain.
- **HLS-RQMT-001:** Peña-Asensio et al. 2024 (arXiv 2406.19863, *Acta Astronautica*) report "slope requirements with vertical orientations ranging between 0 and 5∘" and buffer pixels with slope <5°. They also cite 100 m landing precision, a 2 km explorable radius and a 40 m observer height. **This is a secondhand citation; the document itself was not found** (see F).
- **Artemis III 2024 down-select** (George et al., NTRS 20250011660, LPSC 2026): slope is assessed as "minimizing the degree of slope variability within a landing ellipse", with no numeric threshold. Surface stay is about 5.75–6.25 days.
- **CLPS:** The landing ellipse is "100m in diameter" (NASA 2022 OTPS). No CLPS slope threshold was found (see F).

**Recipe [derived]:**
1. Compute slope at the 100 m landing baseline by fitting a plane to the DEM over a 100 m window. Do not use the pixel-scale slope.
2. Classify landing as OK if slope is below 10° and also show the 8° contour. Classify EVA as OK if slope is below 20° within 2 km.
3. Propagate slope error. Use the 5 m `slperr` (about 1.5–2.5°), or `LDSM_*_ERR`, and flag pixels whose slope + 2σ crosses the threshold.
4. Use `LDRM_*_ROUGH_100M` as a secondary roughness hazard layer. No published threshold was found for it.

---

## E. Recommended data pull for Shadowline (small, range-read friendly)

1. **Download whole** (about 1.3 GB total):
   - `LDEM_60S_240MPP_ADJ.TIF` (210 M) + `_ERR` (255 M)
   - `LDEM_80S_80MPP_ADJ.TIF` (181 M) + `_ERR` (244 M)
   - `LPSR_80S_20MPP_ADJ_1km2.*` (about 48 M)
   - `LPSR_80S_20MPP_ADJ.SHP/SHX/DBF/PRJ` (about 275 M)
   - Product-78 site `_surf`, `_toterr` and `_slp` files for the chosen sites (41–142 MB each)
2. **Range-read windows** (COG, `/vsicurl/`) from:
   - `LDEM_80S_20MPP_ADJ.TIF`, `_ERR`, `LDSM_80S_20MPP_ADJ.TIF`
   - `LDEM_83S_10MPP_ADJ.TIF`
   - About ±8 km per site, so a few MB each.
3. **Diviner PRP:** `dlre_prp_south.tab` (605 MB ASCII). Stream-parse it, keep rows with `tri_clat < −80` and the `temp_max` column, then rasterise to a 240 m grid once.
4. **Non-polar sites:** SLDEM2015 512 ppd tile windows via HTTP Range on the raw `.IMG`, using offsets from the `.LBL`.
5. **Ship to the client:** precomputed JSON or binary only. That means 720-bin masks with error bands, slope stats, PSR distances and cold-trap fractions. Raw DEMs are not shipped.

---

## F. UNSOURCED / not verified

1. **Mazarico et al. 2011:** the exact azimuth count, ray length, DEM nesting and stated accuracy. The full text is paywalled (ScienceDirect returned 403). The 720 × 0.5° figure comes from Barker 2021's description of "the horizon method outlined in Mazarico et al. (2011)".
2. **Barker 2023:** the exact sentence on 20 m out to 7 km and 480 m out to 310 km. This is my fetch-tool summary of the iopscience page; the wording was not checked.
3. **Product 90 vertical datum:** the PGDA page does not state it. "Height above 1737.4 km sphere" is inferred from the PDS LDEM convention and the z range.
4. **Speyerer & Robinson 2013:** method details beyond what the LROC pages state. The paper itself was not opened.
5. **Gläser et al. 2018** (PSS): not opened.
6. **Hayne et al. 2015:** the "Tmax > ~110 K → no frost" and "0.1–2 wt%, up to ~10% area" statements came only from search-result snippets. The abstract was not opened.
7. **Li et al. 2018:** whether the SI (19.3 MB) or any archive provides per-pixel ice coordinates.
8. **LEND / Sanin 2017** and **Fisher 2017:** any downloadable gridded product.
9. **Diviner PCP rasters:** the UCLA mirror (`luna1.diviner.ucla.edu`) did not respond, so the PCP seasonal file names were not listed.
10. **USGS LOLA–Kaguya 512 ppd merge GeoTIFF:** returned 404 on 2026-11-14. The USGS catalogue page returned 403, so its size, URL and accuracy are not verified here. The "22 GB" figure seen in search results is UNSOURCED.
11. **Metzger / Lane & Metzger:** specific ejecta-distance numbers, and the Immer et al. 2011 abstract (ADS returned 405). Clegg 2014 numbers were read from a third-party abstract mirror, not the publisher.
12. **NASA 2023/2024 updates** to the 2011 heritage recommendations: none found.
13. **HLS-RQMT-001** (0–5° slope) is known only secondhand. **CLPS slope thresholds** were not found.
14. **Physical constants** used in recipes, for example the solar angular diameter of about 0.53°: not sourced in this session. The ephemeris research covers this.
15. **Official site coordinates** for Apollo, Luna, Chang'e-4/6 and SLIM: not researched here (sites-research scope).
16. **ERR magnitude for the 240 m product:** the 5 m example used in A7 is illustrative; read the actual value from `LDEM_60S_240MPP_ADJ_ERR.TIF`.
