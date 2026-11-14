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

Map tiles only; no analysis uses them. Both services send `Access-Control-Allow-Origin: *`, so the browser
loads them directly (checked 2026-11-14). Defined in `scenes/cesium/moon-layers.ts`.

| Layer | Service | Identifier |
|---|---|---|
| Base mosaic | NASA Moon Trek WMTS | `LRO_WAC_Mosaic_Global_303ppd_v02` (`https://trek.nasa.gov/tiles/Moon/EQ/…/1.0.0/default/default028mm/{z}/{row}/{col}.jpg`) |
| Slope | Moon Trek WMTS | `LRO_LOLA_ClrSlope_Global_16ppd` + `LRO_LOLA_ClrSlope_SPole75S_120m_EQ` (69°S–90°S). The public Trek layer list hides slope products; they are in the catalog API (`TrekServices/ws/index/eq/searchItems`). |
| Illumination % (polar) | LROC Lunaserv WMS 1.1.1 (`https://wms.im-ldi.com/`, EPSG:4326) | `luna_polar_illumination_pct` |
| Permanently shadowed regions | LROC Lunaserv WMS | `luna_psr_81s` |
| Elevation (color shaded relief) | LROC Lunaserv WMS | `luna_wac_dtm` |

The globe's star background is Cesium's bundled Tycho-2 sky box.

## References

- Smith, D. E. et al. (2010), *Space Sci. Rev.* 150, 209–241, doi:10.1007/s11214-009-9512-y
- Barker, M. K. et al. (2016), *Icarus* 273, 346–355, doi:10.1016/j.icarus.2015.07.039
- Barker, M. K. et al. (2021), *Planet. Space Sci.* 203, 105119, doi:10.1016/j.pss.2020.105119
- Barker, M. K. et al. (2023), *Planet. Sci. J.* 4, 183, doi:10.3847/PSJ/acf3e1
- Mazarico, E. et al. (2011), *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030
- Speyerer, E. J. & Robinson, M. S. (2013), *Icarus* 222, 122–136, doi:10.1016/j.icarus.2012.10.010
