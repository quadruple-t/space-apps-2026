# Data sources

Everything Freeplay shows that comes from outside this repo, and where it was checked. Coordinates are planetocentric latitude and east-positive longitude (0–360°) in the mean Earth/polar axis (ME) frame unless noted.

## Reference landing sites (`data/sites.ts`)

Freeplay starts with no presets: users pick points on the globe and name the ones they save. This verified list backs the prefetched demo data, the validation tests and `/explore/approach`.

| Site | Lat (°) | Lon (°E) | Status | Source |
|---|---|---|---|---|
| Apollo 11 LM | 0.67416 | 23.47314 | Verified | [LROC Coordinates of Lunar Anthropogenic Features, 28 Jul 2016](https://lroc.im-ldi.com/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf) (Wagner et al. 2016, Icarus) |
| Apollo 15 LM | 26.13239 | 3.63330 | Verified | Same table |
| Apollo 17 LM | 20.1911 | 30.7723 | Verified | Same table |
| Chang'e 4 | −45.4561 | 177.5885 | Verified | [LROC: Topographic Map of the Chang'e 4 Site](https://www.lroc.asu.edu/images/1100) (NAC stereo DTM; initial fix 45.457°S 177.589°E ±20 m in [Chang'e 4 Lander Coordinates](https://www.lroc.asu.edu/posts/1087)) |
| Chang'e 6 | −41.6385 | 206.0148 | Verified | [LROC: First Look: Chang'e 6](https://lroc.im-ldi.com/images/1374) (±30 m) |
| Chandrayaan-3 (Vikram) | −69.3741 | 32.32 | Verified | [LROC: Chandrayaan-3 Landing Site](https://www.lroc.asu.edu/images/1314). ISRO reports 69.37°S 32.32°E. |
| SLIM | −13.3160 | 25.2510 | Verified | [LROC: JAXA SLIM Landing](https://www.lroc.asu.edu/images/1358); [NASA](https://www.nasa.gov/missions/lro/nasas-lro-spots-japans-moon-lander). JAXA's pre-landing target was 13.31549°S 25.24889°E. |
| IM-1 Odysseus | −80.13 | 1.44 | Verified | [NASA/LROC, NAC frame M1463440322L](https://www.lroc.asu.edu/images/1360); NAIF frame kernel `clps_to2im_im1_v02.tf` gives 1.44587°E |

### Artemis III candidate regions

NASA's [October 2024 update](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) names nine regions but publishes no coordinates or boundaries. Where NASA/GSFC has released a 5 m/px LOLA site DEM for a region on Moon Trek, the preset uses the centre of that DEM's footprint (south-polar stereographic metres converted with a 1737.4 km sphere). The radius is about half the footprint width.

| Region | Lat (°) | Lon (°E) | Status | Basis |
|---|---|---|---|---|
| Haworth | −86.764 | 337.223 | Verified | LOLA `Haworth_final_adj_5mpp` footprint |
| Malapert Massif | −85.995 | 359.764 | Verified | LOLA `Site23_final_adj_5mpp` (Malapert Massif) footprint |
| Mons Mouton Plateau | −85.427 | 31.743 | Verified | LOLA `Site20_final_adj_5mpp` (Leibnitz Beta Plateau, renamed Mons Mouton in 2022) |
| Nobile Rim 1 | −85.438 | 37.367 | Verified | LOLA `Site06_final_adj_5mpp` footprint |
| Nobile Rim 2 | −83.954 | 58.822 | Verified | LOLA `DM2_final_adj_5mpp` footprint |
| de Gerlache Rim 2 | −88.683 | 292.068 | **Unverified** | Centre of LOLA `Site11` "de Gerlache Rim" DEM. NASA's "Rim 2" boundary is not published. |
| Peak near Cabeus B | −82.4 | 307.0 | **Unverified** | IAU Gazetteer centre of [Cabeus B](https://planetarynames.wr.usgs.gov/Feature/8058) (82.4°S 53.0°W), not the peak itself |
| Mons Mouton | −84.6 | 31.0 | **Unverified** | IAU Gazetteer centre of Mons Mouton (84.6°S 31.0°E) |
| Slater Plain | −88.1 | 111.3 | **Unverified** | IAU centre of Slater crater (88.1°S 111.3°E); the plain is adjacent |

## Imagery and overlays

| Layer | Service | Identifier | Notes |
|---|---|---|---|
| Base mosaic | NASA Moon Trek WMTS | `LRO_WAC_Mosaic_Global_303ppd_v02` | `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{row}/{col}.jpg`, levels 0–8, CORS open |
| Slope (global) | Moon Trek WMTS | `LRO_LOLA_ClrSlope_Global_16ppd` | Colorized LOLA slope, PNG, levels 0–2. Found via the Trek catalog API (`TrekServices/ws/index/eq/searchItems`); the public layer list filters slope products out. |
| Slope (south pole) | Moon Trek WMTS | `LRO_LOLA_ClrSlope_SPole75S_120m_EQ` | 120 m colorized LOLA slope, 69°S–90°S, levels 0–6 |
| Illumination % (polar) | LROC Lunaserv WMS 1.1.1 | `luna_polar_illumination_pct` | "LROC WAC North and South Pole Illumination – Percentage Based" |
| Permanently shadowed regions | LROC Lunaserv WMS 1.1.1 | `luna_psr_81s` | "LOLA South Pole PSRs (90S to 81S)", magenta outlines. `luna_nac_pole_psr_south` is the NAC alternative. |
| Elevation | LROC Lunaserv WMS 1.1.1 | `luna_wac_dtm` | "LROC WAC Color Shaded Relief" (GLD100) |

Lunaserv endpoint: `https://wms.im-ldi.com/` (`webmap.lroc.asu.edu` redirects there). GetCapabilities lists 352 layers and `EPSG:4326` among supported SRS. Both services send `Access-Control-Allow-Origin: *`, so no proxy route is needed. Checked 2026-11-14.

Lunaserv has no global slope layer, only per-site ones (`luna_apollo_11_slope`, ...), which is why slope comes from Moon Trek.

## Ephemerides

JPL Horizons API (`https://ssd.jpl.nasa.gov/api/horizons.api`), called only from `app/api/horizons/route.ts`.

- Observer: `EPHEM_TYPE=OBSERVER`, `CENTER='coord@301'`, `COORD_TYPE=GEODETIC`, `SITE_COORD='<east_lon>,<lat>,<alt_km>'`, `QUANTITIES='4'` (apparent azimuth and elevation, degrees; azimuth clockwise from north). `COMMAND='10'` Sun, `'399'` Earth.
- Vectors: `EPHEM_TYPE=VECTORS`, `CENTER='500@399'` (geocentric), `REF_PLANE=ECLIPTIC`, `OUT_UNITS=KM-S`, `CSV_FORMAT=YES`, `COMMAND='301'` Moon, `'10'` Sun. Times are TDB (about 69 s from UTC), which doesn't matter at diagram scale.
- Benchmark: Sun elevation at Apollo 11 at 1969-07-20 20:17 UTC is 10.70° from Horizons. The Apollo Lunar Surface Journal gives about 10°.

### Prefetched data (`public/data/horizons/prefetch/`)

`npm run prefetch` (`scripts/prefetch-horizons.ts`) saves hourly data from 2026-12-01 00:00 UTC for 366 days. That covers Sun and Earth az/el for every preset, plus Moon and Sun geocentric vectors. The API route serves any hourly (or whole-hour step) request inside that window from these files, so the default Freeplay mission works with no Horizons access. Other dates and custom sites call Horizons live through the route and are cached in `public/data/horizons/` (gitignored). Rerun the script if preset coordinates change.

Validation tests built on this data:
- `__tests__/earth-visibility.test.ts`: Earth stays below the horizon for the whole year at Chang'e 4 (max −37.7°) and Chang'e 6, and stays above 45° at Apollo 11.
- `__tests__/orbit.test.ts`: the orbit diagram's site geometry agrees with Horizons Sun elevation at Apollo 11 to within libration (8°).
