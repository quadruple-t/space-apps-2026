# Data sources — verified free endpoints

Checked on **2026-11-14** with `curl` range requests. Every endpoint below is
US-Government public domain (NASA PDS / USGS / GSFC PGDA), needs **no API key**,
**no registration** and has **no request quota**. There is no SLA, but there is
no paywall or expiring trial either. `api.nasa.gov` keys are *not* required for
any of these.

`scripts/data-pipeline/pipeline/sources.py` implements this table; `dataSources.json`
is the curated catalogue that ships to Firestore.

---

## 1. Global elevation — replaces `SCAFFOLD_MOON_GRID`

LOLA GDR cylindrical grids, binary PDS IMG (signed int16) or float32, detached
`.LBL` label next to each `.IMG`. Range requests work, so single windows can be
fetched without downloading the whole file.

| Product | URL (base `https://imbrium.mit.edu`) | Grid | Size | Notes |
|---|---|---|---|---|
| `LDEM_4` | `/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_4.IMG` | 1440×720, 0.25° | 2.1 MB | `HEIGHT = DN * 0.5` m, sphere 1737.4 km |
| `LDEM_16` | `/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_16.IMG` | 5760×2880, 0.0625° | 33 MB | same encoding |
| `LDEM_64` | `/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_64.IMG` | 23040×11520, 0.015625° | 531 MB | already used by stage 30 for far-field |
| `LDEM_128` | `/DATA/LOLA_GDR/CYLINDRICAL/FLOAT_IMG/LDEM_128_FLOAT.IMG` | 128 ppd, float32 | — | shape map, m |
| `SLDEM2015` | `/DATA/SLDEM2015/TILES/FLOAT_IMG/` | 512 ppd tiles, ±60° | 1.4 GB/tile | km + offset 1737.4 |
| USGS 118 m | `https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif` | 256 ppd | 8.5 GB, BigTIFF int16 | strips, not a COG, row range reads work |

All global grids are simple cylindrical, planetocentric, east-positive,
**row 0 = 90°N**, sample 0 = 0°E, `LINE_PROJECTION_OFFSET = lines/2 − 0.5`.
No nodata sentinel in the polar-filled LDEMs.

Derived products:

- Global **slope** (degrees, float32, 0–75.18): `https://imbrium.mit.edu/DATA/SLDEM2015_SLOPE/GLOBAL/FLOAT_IMG/`
  - `SLDEM2015_64_SL_90S_90N_000_360.IMG` (1.06 GB; JP2 twin 393 MB)
  - 128 ppd and 256 ppd available in the same directory; 512 ppd only as tiles.
  - Covers 90°S–90°N: SLDEM2015 to ±60°, LOLA fill poleward.
  - Azimuth companion: `/DATA/SLDEM2015_AZIMUTH/`.
- Global **roughness** at 16 ppd is only delivered as visually encoded WMTS
  (`LRO_LOLA_ClrRoughness_Global_16ppd`); the numeric roughness products are polar
  only (PGDA 90/98).

**Cheapest fix for the readouts:** bake one static global grid once —
`LDEM_4` or a 0.5–1° downsample of `LDEM_16` for height, `SLDEM2015_64_SL` for
slope — and ship it as the `TerrainGrid` payload. At 0.25° that is 1440×720
samples ≈ a 2–4 MB JSON (far less as a packed int16/float32 base64 blob) and it
makes every MOON_REGIONS pin show a real elevation and slope with no runtime
network call, no mask requirement and no change to the picker UI.

## 2. Regional / polar high-resolution DEM and slope

PGDA products are **cloud-optimised GeoTIFFs**; GDAL `/vsicurl/` window reads are
supported (this is what `StereoRaster.from_cog` already does).

| Product | URL | Resolution | Used for |
|---|---|---|---|
| PGDA 90 | `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/` | 20/40/80/240 m, 60–90°S | `LDEM_*_ADJ`, `LDSM_*` slope, `LDRM_*` slope/roughness, `LPSR_*` PSR polygons |
| PGDA 78 | `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/` | 5 m, site boxes | near-field horizon masks, slope, error |
| PGDA 81 | `https://pgda.gsfc.nasa.gov/products/81` | 5 m, 87–90°S | `ldem_87s_5mpp`, `ldsm_87s_5mpp` |
| PGDA 98 | `https://pgda.gsfc.nasa.gov/products/98` | 10–60 m, north pole | same family for 80–90°N |
| PGDA 54 | `https://pgda.gsfc.nasa.gov/products/54` | 512/256/128 ppd | SLDEM2015 |

## 3. Precomputed illumination, Earth visibility and PSR

There is **no free hosted per-site horizon-mask API** anywhere. A horizon mask is
a derived product: 720 floats per site from the DEM. Stage 30 already computes it.
These rasters are the closest ready-made equivalents and are the right validation
targets:

| Product | URL | Grid | Meaning |
|---|---|---|---|
| LOLA illumination EXTRAS | `https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/` | 60/120/240 m polar stereo | `AVGVISIB_*` avg solar visibility, `AVGVISIB_*_EARTH`, `LPSR_*` PSR, `SKYV_*` sky visibility |
| PGDA 69 | `https://pgda.gsfc.nasa.gov/products/69` | same, as TIF/COG | Mazarico et al. 2011, 18.6-yr hourly average |
| LROC WAC PCT/TWI | `https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/BROWSE/WAC_POLE/` | 100 m, 88–90°S | Speyerer & Robinson 2013 observed lit fraction |

Note the averaging: `AVGVISIB` is a long-term mean, not a time series. It can
label a location ("92% average illumination") but cannot drive the per-date
`getCelestialState` path — that still needs the computed mask plus Horizons.

## 4. Ephemeris

| Product | URL | Notes |
|---|---|---|
| JPL Horizons API | `https://ssd.jpl.nasa.gov/api/horizons.api` | already used; free, no key |
| NAIF SPICE kernels | `https://naif.jpl.nasa.gov/pub/naif/` | free; used by the published illumination models |

## 5. Feature coordinates / site catalogue

| Source | URL | Format | Notes |
|---|---|---|---|
| OpenSpace GeoCode | `https://geocode.openspaceproject.com/1/list/moon` | JSON (1.9 MB) | free, no key; `/1/search/moon?query=Shackleton`; fuzzy match |
| USGS Gazetteer | `https://planetarynames.wr.usgs.gov/GIS_Downloads` | shapefile / KML | no JSON API; Moon control network = LOLA 2011 |
| LROC anthropogenic features | `https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/SHAPEFILE/ANTHROPOGENIC_OBJECTS/` | shapefile | already in `WHOLE_FILES`; spacecraft/lander coordinates + elevations |
| PDS ODE REST | `https://oderest.rsl.wustl.edu/live2/?query=products&target=moon&ihid=LRO&iid=LOLA&pt=GDRDEM&results=cm&output=json` | JSON | product discovery + direct archive URLs; free |
| USGS Astrogeology STAC | `https://stac.astrogeology.usgs.gov/api/collections` | STAC | LOLA shots, Kaguya DTMs; **no** global LOLA/SLDEM COG |
| NASA Trek WMTS | `https://trek.nasa.gov/tiles/Moon/{EQ,NP,SP}/{layer}/1.0.0/WMTSCapabilities.xml` | WMTS | tiles for display only, no numeric values; catalogue at `https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems?...` |

## 6. State of this repo (mask coverage)

Verified in the working tree:

- `data/seed/sites` has **44** curated sites.
- `data/seed` has **no `terrain/` and no `terrainGrid/` collection**, so zero
  horizon masks and zero grid tiles are seeded.
- `integrations/science/firestore-provider.ts` therefore falls through to
  `smoothHorizonMask()` for every site. The "Mask coverage: unchecked" concern is
  confirmed: coverage is currently **zero**, not partial.
- `scripts/data-pipeline/30_site_terrain.py` is complete and writes
  `sites/<id>/terrain/v1.json` plus `terrainSummary`; `40_psr.py` and
  `50_zones.py` are the other missing seed stages. Running 30 + 40 fixes the
  south-polar sites and the 5 m-site boxes; non-polar sites then need the global
  DEM path (LDEM_64 / SLDEM2015) to get real masks too.
- `MOON_REGIONS` in `integrations/terrain/moon-samples.ts` has 5 scaffold pins.
  Two of them (−89.5°, 222.7° and 89.5°, 42.0°) fall inside the polar grid
  regimes; the other three (8°N 20°E, 14°N 315°E, 12°S 175°E) never get a mask
  from the current south-polar-only grid.

Recommended order:

1. Replace `SCAFFOLD_MOON_GRID` with a baked global `TerrainGrid` (LDEM_4 height,
   SLDEM2015_64 slope). Fixes both readouts for all five pins.
2. Run stage 30 for the 44 curated sites; seed `terrain/` + `terrainGrid/`.
3. Wire the picker to `getSiteIndex()` (44 sites with masks and elevation) and
   keep `MOON_REGIONS` only as a fallback / coarse map layer.
4. Keep `smoothHorizonMask()` as the explicit, labelled fallback for pins
   outside DEM coverage — never silently present it as terrain.

## 7. Freeplay globe imagery and overlays

Display imagery only; no analysis uses these color images. The original service
identifiers below are imported by `scripts/archive-globe.ts`. The globe loads their
stored Firestore copies rather than requesting the upstream services at runtime.
Source definitions remain in `scenes/cesium/moon-layers.ts`.

| Layer | Service | Identifier |
|---|---|---|
| Base mosaic | NASA Moon Trek WMTS | `LRO_WAC_Mosaic_Global_303ppd_v02` (`https://trek.nasa.gov/tiles/Moon/EQ/…/1.0.0/default/default028mm/{z}/{row}/{col}.jpg`) |
| Slope | Moon Trek WMTS | `LRO_LOLA_ClrSlope_Global_16ppd` + `LRO_LOLA_ClrSlope_SPole75S_120m_EQ` (69°S–90°S). The public Trek layer list hides slope products; they are in the catalog API (`TrekServices/ws/index/eq/searchItems`). |
| Illumination % (polar) | LROC Lunaserv WMS 1.1.1 (`https://wms.im-ldi.com/`, EPSG:4326) | `luna_polar_illumination_pct` |
| Permanently shadowed regions | LROC Lunaserv WMS | `luna_psr_81s` |
| Elevation (color shaded relief) | LROC Lunaserv WMS | `luna_wac_dtm` |

Catalog landing, impact/rover, and Artemis reference-point overlays use `/api/v1/catalog/sites`.
Heritage boundaries and PSR resource-context polygons use the existing `/api/v1/zones`
collection and its source citations. Cold-trap polygons select PSR zones whose stored
Diviner `coldTrapFraction` is greater than zero; the footprint is the full PSR polygon,
not a delineation of ice or of its coldest subregion. These overlays do not establish
confirmed ice, ore grades, reserves, or mining suitability. Heritage circles retain their
stored kilometre radii; Artemis markers are reference points rather than region boundaries.

Additional science imagery identifiers were verified in Lunaserv GetCapabilities on
2026-11-14. `scripts/data-pipeline/curated/globeMaps.json` retains each product's
published abstract and credit; source manifests are seeded alongside other data sources.

| Overlay | Lunaserv WMS identifier | Interpretation / coverage |
|---|---|---|
| Titanium oxide | `luna_wac_tio2_color` | LROC TiO₂ weight %, 70°S–70°N |
| Iron oxide | `luna_kaguya_feo` | Kaguya FeO weight %, 50°S–50°N |
| Thorium | `luna_lp_deconvolved_thorium` | Lunar Prospector spatial deconvolution, 2 ppd |
| Olivine | `luna_kaguya_olivine` | Kaguya mineral abundance, 50°S–50°N |
| Plagioclase | `luna_kaguya_plagioclase` | Kaguya mineral abundance, 50°S–50°N |
| Clinopyroxene | `luna_kaguya_clinopyroxene` | Kaguya mineral abundance, 50°S–50°N |
| Silicates | `luna_diviner_silicate` | Christiansen-feature wavelength, not ore grade |
| Ice-stability depth | `luna_diviner_sp_ice_depth_today` | Modeled south-polar stability, not ice detection |
| Maximum thermal anomaly | `luna_diviner_tbol_max` | Zonal mean subtracted; −25 to +25 K |
| Minimum thermal anomaly | `luna_diviner_tbol_min` | Zonal mean subtracted; −10 to +10 K |
| Impact history | `luna_copernican_craters` | Craters >10 km, <~1.1 Ga; 60°S–60°N |

The meteor exposure model uses TUM's seven 2026 reference radiants/epochs, stored
in `curated/meteorStreams.json`. Stage `61_globe_layers.py` produces derived
IAU_MOON sub-radiants and writes the `meteor-streams-2026` fact sheet through the
same curated/seed convention as other fact sheets. SourceRefs distinguish TUM
inputs from NAIF-derived geometry. The browser reads this sheet via the existing
facts API and draws `max(0, normal · radiant)` on a smooth sphere. It ignores
velocity aberration, radiant drift, gravitational focusing, and terrain shielding.
The overlay is tied to the selected reference epoch, not the simulation clock.
Brightness represents relative incidence only; neither an impact rate nor a storm
forecast is inferred. Uncolored regions may receive other shower/sporadic impacts.
A numerical test compares derived sub-radiants to Cesium's IAU orientation evaluator.

Firebase archive: `catalog/globe-assets-v1` records the bounded display snapshots,
source request URLs, image dimensions and geographic bounds, and content hashes.
Images and the collected-data bundle use 240 KiB Firestore Bytes documents under
`catalog/globe-chunk-*`, with manifests under `catalog/globe-asset-*`. The API
reassembles and verifies lengths and SHA-256 before serving data. Existing catalog
rules permit public reads and deny browser writes. Only the offline importer writes.
The app keeps source imagery separate from numerical analysis inputs.

Most stored maps cover the globe at 2048 × 1024. The south-pole slope image covers
its source tile bounds at 4096 × 256. Unmapped source areas remain unmapped;
these snapshots do not add coverage or precision. The selected scope excludes
full-resolution upstream archives that were never downloaded locally.
`collected-data` archives all original static seed documents, curated source data,
locally cached source responses/tiles, and citations; user data and credentials are
excluded. `scripts/data-pipeline/globe-archive.lock.json` is the import manifest.

The globe's star background is Cesium's bundled Tycho-2 sky box.

## References

- Smith, D. E. et al. (2010), *Space Sci. Rev.* 150, 209–241, doi:10.1007/s11214-009-9512-y
- Barker, M. K. et al. (2016), *Icarus* 273, 346–355, doi:10.1016/j.icarus.2015.07.039
- Barker, M. K. et al. (2021), *Planet. Space Sci.* 203, 105119, doi:10.1016/j.pss.2020.105119
- Barker, M. K. et al. (2023), *Planet. Sci. J.* 4, 183, doi:10.3847/PSJ/acf3e1
- Mazarico, E. et al. (2011), *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030
- Speyerer, E. J. & Robinson, M. S. (2013), *Icarus* 222, 122–136, doi:10.1016/j.icarus.2012.10.010

---

<!-- BEGIN GENERATED: pipeline source list -->

## Datasets, papers and pages used by the Shadowline data pipeline

Generated by `scripts/data-pipeline/80_validate.py` from `curated/dataSources.json` and `curated/refs.json`. Tier: A = agency or peer-reviewed, B = company or official mission document, C = secondary press. Retrieved 2026-11-14 unless noted; whole-file downloads (URL, bytes, sha256, Last-Modified) are in `scripts/data-pipeline/manifest.lock.json`.

### Datasets

| Dataset | Version | Citation / DOI | URL |
|---|---|---|---|
| JPL Horizons API (observer tables, DE441) | DE441 | JPL Solar System Dynamics, Horizons System | https://ssd-api.jpl.nasa.gov/doc/horizons.html |
| LOLA south pole DEMs, PSR maps, slope and roughness (PGDA product 90) |  | Barker, M.K. et al. (2023), Planet. Sci. J. 4:183; doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole | https://pgda.gsfc.nasa.gov/products/90 |
| High-resolution LOLA topography for south pole sites, 5 m (PGDA product 78) |  | Barker, M.K. et al. (2021), Planet. Space Sci. 203:105119; doi:10.1016/j.pss.2020.105119 | https://pgda.gsfc.nasa.gov/products/78 |
| SLDEM2015 (LOLA + SELENE TC), 512 ppd | V2.0 (2015-09-15) | Barker, M.K. et al. (2016), Icarus 273:346-355; doi:10.1016/j.icarus.2015.07.039 | https://pgda.gsfc.nasa.gov/products/54 |
| LOLA GDR cylindrical LDEM_64 (64 ppd) and LDEM_512 45-90N tiles | LRO-L-LOLA-4-GDR-V1.0 | LOLA Science Team, PDS Geosciences Node | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/ |
| LROC Anthropogenic Features on the Moon shapefile (updated 2026-08-14) | 2026-08-14 | Wagner, R.V. et al. (2017), Icarus 283:92-103; doi:10.1016/j.icarus.2016.05.011 | https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_ANTHROPOGENIC_OBJECTS |
| LROC Coordinates of Lunar Anthropogenic Targets (2016) | 28 Jul 2016 | Wagner, R.V. et al. (2017), Icarus 283:92-103; doi:10.1016/j.icarus.2016.05.011 | https://lroc.im-ldi.com/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf |
| LROC WAC south polar illumination maps, 100 m (PCT and TWI) | 15 Feb 2010 - 5 Feb 2011 | Speyerer, E.J. & Robinson, M.S. (2013), Icarus 222:122-136; doi:10.1016/j.icarus.2012.10.010 | https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH |
| Diviner Polar Resource Product, south (annual maximum temperature) | LRO-L-DLRE-5-PRP-V2.0 (2018-02-21) | Paige, D.A. et al. (2010), Science 330:479; doi:10.1126/science.1187726 | https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ |
| NASA (2011) recommendations for protecting U.S. Government lunar artifacts, Rev A | Rev A, 28 Oct 2011 | NASA (2011) | https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf |
| NASA Artemis Human Landing System Update (1 Aug 2024) | NTRS 20240009596 | Dwyer Cianciolo, A. (2024) | https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf |
| ALSJ Earth and Sun altitude/azimuth at Apollo landings |  | Fjeld, P. & Scotti, J., Apollo Lunar Surface Journal | https://www.apollojournals.org/alsj/alsj-EarthSun_AltAz.html |
| NASA SP-4029 Apollo by the Numbers, Apollo 11 summary |  | Orloff, R.W., NASA SP-4029 | https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm |
| USGS Gazetteer of Planetary Nomenclature |  | IAU WGPSN / USGS Astrogeology | https://planetarynames.wr.usgs.gov/ |
| Shadowline curated site, preset, fact and story tables | 2026-11-14 | docs/research/*.md and docs/SOURCES.md |  |
| LROC Lunaserv lunar composition, thermal, ice-stability and crater overlays | GetCapabilities snapshot 2026-11-14 | Product-specific credits and references in docs/SOURCES.md §7 | https://wms.im-ldi.com/?service=WMS&request=GetCapabilities |
| TUM Lunar and Planetary Exploration, 2026 meteoroid stream geometry (updated 4 May 2026) | 2026 reference snapshots | TUM Lunar and Planetary Exploration, 2026 meteoroid stream geometry (updated 4 May 2026) | https://www.asg.ed.tum.de/en/lpe/forschung/mondeinschlagsblitze/meteoroid-stream-geometry/ |
| NASA/JPL NAIF pck00011, IAU_MOON orientation model (2009 coefficients) | pck00011 | NASA/JPL NAIF pck00011, IAU_MOON orientation model (2009 coefficients) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc |
| Firebase globe display snapshots and collected scientific data archive | 1 | Original source citations in docs/SOURCES.md §7; import provenance in scripts/data-pipeline/globe-archive.lock.json |  |

### Every cited page, paper and document

| Tier | Source | URL |
|---|---|---|
| A | ALSJ, Apollo 11 post-landing transcript | https://www.apollojournals.org/alsj/a11/a11.postland.html |
| A | Artemis Accords (13 Oct 2020) | https://www.nasa.gov/wp-content/uploads/2022/11/Artemis-Accords-signed-13Oct2020.pdf |
| A | Diviner Polar Resource Product, south (Paige et al. 2010, Science, doi:10.1126/science.1187726; LRO-L-DLRE-5-PRP-V2.0) | https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab |
| A | FRED, India / U.S. Foreign Exchange Rate, annual (AEXINUS) | https://fred.stlouisfed.org/graph/fredgraph.csv?id=AEXINUS |
| A | FRED, Japan / U.S. Foreign Exchange Rate, annual (AEXJPUS) | https://fred.stlouisfed.org/graph/fredgraph.csv?id=AEXJPUS |
| A | Fisher et al. 2017, Icarus 292:74-85, doi:10.1016/j.icarus.2017.03.023 | https://ntrs.nasa.gov/citations/20170003782 |
| A | George et al., LPSC 2026 abstract #1901 (Artemis III region refinement) | https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf |
| A | Greenhagen et al. (2010), Global Silicate Mineralogy of the Moon from the Diviner Lunar Radiometer | https://doi.org/10.1126/science.1192196 |
| A | Grumman Apollo News Reference, LM Electrical Power | https://www.apollojournals.org/alsj/LM11_Electric_ppEP1-5.pdf |
| A | House Science, Space and Technology Committee hearing charter, 1 Apr 2025 (CLPS) | https://republicans-science.house.gov/_cache/files/0/8/08794b1b-508d-4b7a-8008-341e51828609/3A2F66B634F78F4A4A5430D8B5C1C68D2A0EDD05462C88DC1E0AC8149943A700.sst-hearing-charter---leveraging-commercial-innovation-for-lunar-exploration-a-review-of-nasas-clps-initiative.pdf |
| A | ISRO monthly summary, August 2023 | https://www.isro.gov.in/media_isro/pdf/Monthly_summary/MonthlySummary_August2023Eng.pdf |
| A | ISRO, Chandrayaan-2 spacecraft | https://www.isro.gov.in/chandrayan_spacecraft.html |
| A | ISRO, Chandrayaan-3 details | https://www.isro.gov.in/Chandrayaan3_Details.html |
| A | ISRO, Chandrayaan-3 mission page | https://www.isro.gov.in/Chandrayaan3.html |
| A | JAXA SLIM project review briefing, Dec 2024 | https://www.isas.jaxa.jp/en/topics/files/SLIM-press-briefing-20241226.pdf |
| A | JAXA press release, SLIM landing results (25 Jan 2024) | https://global.jaxa.jp/press/2024/01/20240125-1_e.html |
| A | JAXA press release, SLIM operations ended (26 Aug 2024) | https://global.jaxa.jp/press/2024/08/20240826-1_e.html |
| A | JPL Horizons API | https://ssd-api.jpl.nasa.gov/doc/horizons.html |
| A | JPL Horizons manual | https://ssd.jpl.nasa.gov/horizons/manual.html |
| A | Kopp & Lean 2011, GRL 38 L01706, doi:10.1029/2010GL045777 | https://espo.nasa.gov/node/30086 |
| A | LOLA GDR cylindrical LDEM_64 / LDEM_512 (LRO-L-LOLA-4-GDR-V1.0) | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/ |
| A | LROC Lunaserv WMS GetCapabilities, lunar science map product metadata | https://wms.im-ldi.com/?service=WMS&request=GetCapabilities |
| A | LROC RDR shapefile, Anthropogenic Features on the Moon (last updated 2026-08-14) | https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_ANTHROPOGENIC_OBJECTS |
| A | LROC WAC south polar illumination maps, 100 m (Speyerer & Robinson 2013, Icarus 222:122-136) | https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH |
| A | LROC, Beresheet impact site (images/1101) | https://lroc.im-ldi.com/images/1101 |
| A | LROC, Blue Ghost landing site (images/1407) | https://www.lroc.im-ldi.com/images/1407 |
| A | LROC, Chandrayaan-3 landing site (images/1314, 5 Sep 2023) | https://lroc.im-ldi.com/images/1314 |
| A | LROC, Chang'e 4 (posts/1090) | https://lroc.asu.edu/posts/1090 |
| A | LROC, Chang'e 4 DTM (images/1100, 30 Apr 2019) | https://lroc.im-ldi.com/images/1100 |
| A | LROC, Chang'e 5 landing site (images/1172) | https://lroc.im-ldi.com/images/1172 |
| A | LROC, Chang'e 6 landing site (images/1374, 14 Jun 2024) | https://lroc.im-ldi.com/images/1374 |
| A | LROC, Coordinates of Lunar Anthropogenic Targets (28 Jul 2016; Wagner et al. 2017, Icarus 283:92-103) | https://lroc.im-ldi.com/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf |
| A | LROC, HAKUTO-R Mission 1 probable impact site (images/1302) | https://lroc.im-ldi.com/images/1302 |
| A | LROC, IM-2 Athena landing site (images/1408) | https://lroc.im-ldi.com/images/1408 |
| A | LROC, IM-2 intended landing site on Mons Mouton (images/1401) | https://lroc.im-ldi.com/images/1401 |
| A | LROC, Luna 25 impact site (images/1311) | https://lroc.im-ldi.com/images/1311 |
| A | LROC, RESILIENCE impact site (images/1456) | https://lroc.im-ldi.com/images/1456 |
| A | LROC, SLIM landing site (images/1358) | https://lroc.im-ldi.com/images/1358 |
| A | LROC, Vikram impact site (images/1131) | https://lroc.im-ldi.com/images/1131 |
| A | Lawrence et al. (2007), Global spatial deconvolution of Lunar Prospector Th abundances | https://doi.org/10.1029/2006GL028530 |
| A | Lemelin et al. (2016), Global map products from the Kaguya Multiband Imager at 512 ppd: Minerals, FeO and OMAT, LPSC 2994 | https://www.hou.usra.edu/meetings/lpsc2016/pdf/2994.pdf |
| A | Li et al. 2018, PNAS 115(36), doi:10.1073/pnas.1802345115 | https://pmc.ncbi.nlm.nih.gov/articles/6130389 |
| A | NASA (2011, Rev A 28 Oct 2011), Recommendations to Space-Faring Entities: How to Protect and Preserve the Historic and Scientific Value of U.S. Government Lunar Artifacts | https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf |
| A | NASA Astrobotic Peregrine press kit | https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf |
| A | NASA Firefly Blue Ghost Mission 1 press kit | https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf |
| A | NASA IM-1 press kit | https://www.nasa.gov/wp-content/uploads/2024/01/np-2023-12-016-jsc-clps-im-press-kit-web-508.pdf |
| A | NASA IM-2 press kit | https://nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf |
| A | NASA Meteoroid Environment Office, Shower Meteoroid Environment | https://www.nasa.gov/meteoroid-environment-office/shower-meteoroid-environment/ |
| A | NASA NDL briefing on the IM-1 mission (NTRS 20240004236) | https://ntrs.nasa.gov/api/citations/20240004236/downloads/MSS%202024_NDL%20Lunar%20Mission.pdf |
| A | NASA OIG IG-24-013, NASA's Commercial Lunar Payload Services Initiative | https://oig.nasa.gov/wp-content/uploads/2024/06/final-report-ig-24-013-nasas-commercial-lunar-payload-services-initiative.pdf |
| A | NASA OTPS, Lunar Landing and Operations Policy Analysis (30 Sep 2022) | https://www.nasa.gov/wp-content/uploads/2022/10/lunar_landing_and_operations_policy_analysis_final_report_24oct2022_tagged_0.pdf |
| A | NASA SP-4029 Apollo by the Numbers, Apollo 11 summary | https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm |
| A | NASA SVS 5074, Mons Mouton, a newly named lunar mountain (15 Feb 2023): 'sometimes known informally as Leibnitz Beta' | https://svs.gsfc.nasa.gov/5074 |
| A | NASA blog, Artemis acceleration plans for Moon missions (23 Oct 2026) | https://www.nasa.gov/blogs/missions/2026/10/23/nasa-shares-artemis-acceleration-plans-for-moon-missions/ |
| A | NASA, Artemis Human Landing System Update (Dwyer Cianciolo, 1 Aug 2024; NTRS 20240009596) | https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf |
| A | NASA, Artemis IV mission page | https://www.nasa.gov/mission/artemis-iv/ |
| A | NASA, LRO images Intuitive Machines' Odysseus lander | https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ |
| A | NASA, Touchdown: Firefly's Blue Ghost lands on the Moon | https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/ |
| A | NASA, Vikram lander found (2 Dec 2019) | https://www.nasa.gov/image-article/vikram-lander-found/ |
| A | NASA, adds mission to Artemis lunar program, updates architecture (27 Feb 2026) | https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/ |
| A | NASA, candidate regions for landing next Americans on the Moon (19 Aug 2022) | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ |
| A | NASA, first surface science in decades via commercial Moon mission (IM-1) | https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/ |
| A | NASA, receives some data before Intuitive Machines ends lunar mission | https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/ |
| A | NASA, selects first commercial Moon landing services (2019) | https://www.nasa.gov/news-release/nasa-selects-first-commercial-moon-landing-services-for-artemis-program/ |
| A | NASA, update on Artemis III Moon landing regions (28 Oct 2024) | https://www.prnewswire.com/news-releases/nasa-provides-update-on-artemis-iii-moon-landing-regions-302288659.html |
| A | NASA/JPL NAIF pck00011, IAU_MOON orientation model (2009 coefficients) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc |
| A | NSSDC Earth fact sheet | https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html |
| A | NSSDC Moon fact sheet | https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html |
| A | NSSDCA, Apollo 11 Lunar Module / EASEP (1969-059C) | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C |
| A | NSSDCA, Apollo 12 Lunar Module (1969-099C) | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-099C |
| A | NSSDCA, Apollo 14 Lunar Module (1971-008C) | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1971-008C |
| A | NSSDCA, Apollo 15 Lunar Module (1971-063C) | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1971-063C |
| A | NSSDCA, Apollo 16 Lunar Module (1972-031C) | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-031C |
| A | NSSDCA, Apollo 17 Lunar Module (1972-096C) | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-096C |
| A | NSSDCA, Apollo Landing Sites (ME/DE421 coordinates from Wagner et al. 2017) | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html |
| A | NSSDCA, Soviet lunar missions | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunarussr.html |
| A | NSSDCA, Surveyor program | https://nssdc.gsfc.nasa.gov/planetary/lunar/surveyor.html |
| A | One Small Step to Protect Human Heritage in Space Act, Pub. L. 116-275 (31 Dec 2020) | https://www.govinfo.gov/content/pkg/PLAW-116publ275/html/PLAW-116publ275.htm |
| A | PGDA product 78 README (site list and names) | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README |
| A | PGDA product 78, High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021, PSS 203:105119) | https://pgda.gsfc.nasa.gov/products/78 |
| A | PGDA product 90, A New View of the Lunar South Pole from LOLA (Barker et al. 2023, PSJ 4:183, doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole) | https://pgda.gsfc.nasa.gov/products/90 |
| A | PIB (Govt. of India), Chandrayaan-2 statement, 20 Nov 2019 | https://www.pib.gov.in/PressReleasePage.aspx?PRID=1592495 |
| A | PIB (Govt. of India), Chandrayaan-3 statement, 3 Aug 2023 | https://www.pib.gov.in/PressReleasePage.aspx?PRID=1945483 |
| A | Paige et al. 2010, Science 330:479 (USGS publication record) | https://www.usgs.gov/publications/diviner-lunar-radiometer-observations-cold-traps-moons-south-polar-region |
| A | SLDEM2015 (Barker et al. 2016, Icarus 273:346-355) | https://pgda.gsfc.nasa.gov/products/54 |
| A | Sato et al. (2017), Lunar Mare TiO2 Abundances Estimated from UV/Vis Reflectance | https://doi.org/10.1016/j.icarus.2017.06.013 |
| A | Siegler et al. (2016), Lunar true polar wander inferred from polar hydrogen | https://doi.org/10.1038/nature17166 |
| A | TUM Lunar and Planetary Exploration, 2026 meteoroid stream geometry (updated 4 May 2026) | https://www.asg.ed.tum.de/en/lpe/forschung/mondeinschlagsblitze/meteoroid-stream-geometry/ |
| A | USGS Gazetteer of Planetary Nomenclature, Cabeus B (feature 8058) | https://planetarynames.wr.usgs.gov/Feature/Cabeus%20B |
| A | USGS Gazetteer of Planetary Nomenclature, Mons Mouton (feature 16070; adopted 13 May 2022) | https://planetarynames.wr.usgs.gov/Feature/16070 |
| A | USGS Gazetteer of Planetary Nomenclature, Slater (feature 15325) | https://planetarynames.wr.usgs.gov/Feature/Slater |
| A | USGS Gazetteer of Planetary Nomenclature, de Gerlache (feature 1439) | https://planetarynames.wr.usgs.gov/Feature/de%20Gerlache |
| A | Williams et al. 2017, Icarus 283:300-325, doi:10.1016/j.icarus.2016.08.012 | https://api.semanticscholar.org/ |
| B | ALSJ, Earth and Sun Altitude/Azimuth at landing (Fjeld and Scotti; computed reconstruction spot-checked against JPL Horizons) | https://www.apollojournals.org/alsj/alsj-EarthSun_AltAz.html |
| B | AZUR SPACE 3G30-Advanced triple-junction cell datasheet | https://www.azurspace.com/media/uploads/file_links/file/bdb_00010893-02-00_3g30-advanced_6x12.pdf |
| B | Astrobotic, Peregrine Mission One post-mission report | https://www.astrobotic.com/wp-content/uploads/2024/08/PM1_Post-Mission-Report_Website.pdf |
| B | Firefly Aerospace, Blue Ghost Mission 1 | https://fireflyspace.com/missions/blue-ghost-mission-1/ |
| B | Firefly Aerospace, completes 14 days of surface operations | https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon/ |
| B | ispace, results of the HAKUTO-R Mission 1 lunar landing (26 May 2023) | https://www.ispace-inc.com/2023/05/26/ispace-announces-results-of-the-hakuto-r-mission-1-lunar-landing/ |
| B | ispace, technical cause analysis for HAKUTO-R Mission 2 (24 Jun 2025) | https://www.ispace-inc.com/2025/06/24/ispace-releases-technical-cause-analysis-for-hakuto-r-mission-2/ |
| C | AP via Star-Advertiser, Israeli moon mission fails | https://www.staradvertiser.com/2019/04/11/news/israeli-moon-mission-fails-after-spacecraft-apparently-crashes/ |
| C | China Aerospace (Xinhua), Chang'e-3 landing | https://english.spacechina.com/n17212/c604696/content.html |
| C | SpaceNews, IM-1 called a success as mission winds down | https://spacenews.com/intuitive-machines-and-nasa-call-im-1-lunar-lander-a-success-as-mission-winds-down/ |
| C | SpaceNews, IM-2 lunar lander mission ends | https://spacenews.com/im-2-lunar-lander-mission-ends/ |
| C | SpacePolicyOnline, China lands sample return probe on the far side | https://spacepolicyonline.com/news/china-lands-sample-return-probe-on-the-far-side-of-the-moon/ |
| C | SpacePolicyOnline, Luna 25's engines fired longer than planned | https://spacepolicyonline.com/news/luna-25s-engines-fired-longer-than-planned/ |
| C | The Planetary Society, Chang'e-4 success (citing Chinese state media) | https://planetary.org/blogs/jason-davis/change4-success.html |
| C | The Planetary Society, software command doomed Beresheet | https://www.planetary.org/articles/software-command-doomed-beresheet |
| C | The Space Review (J. Foust, 26 Oct 2026): no CLPS mission launched in 2026 | https://www.thespacereview.com/article/5344/1 |
| C | The Week, Chandrayaan-3 in sleep mode (Pragyan battery) | https://www.theweek.in/news/sci-tech/2023/09/07/chandrayaan-3-in-sleep-mode-after-14-days-on-the-moon-will-pragyan-rover-wake-up-again.html |
| C | Tribune India (PTI), ISRO attempt to wake Chandrayaan-3 lander and rover | https://www.tribuneindia.com/news/india/isro-makes-attempt-to-wake-up-chandrayaan-3s-lander-rover-no-signals-from-them-so-far-546808 |

<!-- END GENERATED: pipeline source list -->
