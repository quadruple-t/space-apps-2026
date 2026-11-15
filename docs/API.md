# Lunaris360 data API

The versioned REST API is served by the Next.js catch-all route at `/api/v1`. It reads the seeded Firestore catalog and computes science results from cached ephemeris and terrain data. Interactive requests do not call NASA/JPL. Public JSON responses are cached for 60 seconds with stale-while-revalidate for 5 minutes; owner data responses and errors use `Cache-Control: no-store`.

## Endpoint index

### Discovery and catalog

| Method and route | Description |
| --- | --- |
| `GET /api/v1` or `GET /api/v1/manifest` | API version, base path, and resource list |
| `GET /api/v1/catalog/sites` | Curated site index; optional `q` and `family` filters |
| `GET /api/v1/catalog/sites/{siteId}` | Site document and its `terrain/v1` document, if present |
| `GET /api/v1/catalog/meta` | Dataset metadata and collection counts |
| `GET /api/v1/{collection}` | Page through a public Firestore collection |
| `GET /api/v1/{collection}/{documentId}` | Read one public document |
| `GET /api/v1/sites/{siteId}/terrain/v1` | Read a site's versioned horizon-mask document |

Public collection names are `sites`, `chapters`, `profiles`, `zones`, `presets`, `facts`, `validations`, `sources`, `ephemeris`, `terrain`, `psr`, `composition`, and `demos`. These map to Firestore collections `sites`, `storyChapters`, `missionProfiles`, `protectionZones`, `landerPresets`, `facts`, `validationChecks`, `dataSources`, `ephemerisGlobal`, `terrainGrid`, `psrLayer`, `compositionGrid`, and `demo`, respectively. Collection reads accept `limit` (default 250, clamped to 1–250) and `cursor` (the last document ID from the previous page). The response is `{ "items": [...], "count": 2, "limit": 2, "hasMore": true, "nextCursor": "..." }`; `nextCursor` is `null` when the collection is empty.

The site index route is distinct from the generic `sites` collection route. It returns `{ "sites": [...], "count": 2, "generatedAt": "..." }`; `q` case-insensitively matches site name or mission, and `family` matches exactly. Site detail returns `{ "site": { "id": "...", ... }, "terrain": { "id": "v1", ... } }`; `terrain` is `null` if no site-specific mask exists. Firestore binary values in generic documents are serialized as base64 strings.

Each site index row has `latDeg`, `lonDeg`, `pointIsApproximate` and `coordsVerified`. `coordsVerified` is `true` only for a non-approximate point whose coordinates come from a primary source (LROC, NASA or NSSDCA); it is the only flag clients should use to decide whether a site may be presented as verified science. `pointIsApproximate` only marks Artemis region-reference points, and sites such as Luna 9 have a point but `coordsVerified: false`.

### Science

| Method and route | Description |
| --- | --- |
| `GET /api/v1/science/celestial` | Sun/Earth azimuth, elevation, and horizon visibility at one time |
| `GET /api/v1/science/horizon` | Horizon elevations by azimuth for a location |
| `GET /api/v1/science/metrics` | Sampled sunlight and Earth visibility over a mission interval |
| `GET /api/v1/science/timeline` | Sun/Earth samples over a 24-hour interval |
| `GET /api/v1/science/compare` | Metrics for two or three catalog sites over the same interval |
| `GET /api/v1/science/rank` | Screen and rank catalog sites against weighted lighting, terrain, ice-proxy and composition criteria |
| `GET /api/v1/science/composition` | Regional oxide abundances (Lunar Prospector GRS, 2° pixels) at a location |

All science routes accept either `siteId` for a catalog site with a verified point coordinate (`coordsVerified: true`; an unverified or region-reference site is rejected with 422, never returned as `provenance: "scientific"`), or both `lat` and `lon` for a custom point. Coordinates are planetocentric degrees; longitude is east-positive and accepts -180 through 360. If both forms are supplied, `siteId` takes precedence. Times must be parseable ISO 8601 timestamps and should be supplied in UTC. The stored JPL Horizons interval is 2026-01-01 through 2030-12-31; requests outside available coverage return 422.

| Parameter | Used by | Default and constraints |
| --- | --- | --- |
| `siteId` | celestial, horizon, metrics, timeline | A catalog site ID; alternatively provide `lat` and `lon` |
| `lat`, `lon` | celestial, horizon, metrics, timeline | Required together without `siteId`; latitude -90…90, longitude -180…360 |
| `time` | celestial | Required timestamp |
| `start` | metrics, timeline, compare | Required timestamp for metrics/timeline; compare forwards it to metrics |
| `durationHours` | metrics, compare | Metrics default 24; must be greater than 0 and at most 720 |
| `stepMinutes` | timeline | Default 1; integer from 1 to 60 |
| `siteIds` | compare | Comma-separated two or three valid catalog site IDs |

`horizon` accepts the same location parameters and uses the start of the stored ephemeris interval when no `time` or `start` is given. Other science resources require the applicable `time` or `start` parameter. Timeline always covers up to 24 hours; near the end of stored coverage it is truncated at the last available time.

Representative response shapes:

```json
{
  "timestamp": "2028-01-01T00:00:00.000Z",
  "sun": { "azimuthDeg": 120, "elevationDeg": 15, "visible": true },
  "earth": { "azimuthDeg": 300, "elevationDeg": 8, "visible": false },
  "horizonSource": "LOLA DEM",
  "provenance": "scientific"
}
```

```json
{
  "sunlightPercent": 72,
  "sunlightHours": 17.3,
  "longestDarknessHours": 4.5,
  "earthVisibilityPercent": 61,
  "longestBlackoutHours": 6.2,
  "intervalStart": "2028-01-01T00:00:00.000Z",
  "intervalEnd": "2028-01-02T00:00:00.000Z",
  "horizonSource": "LOLA DEM",
  "assumptions": ["10-minute sampling; run lengths limited to the interval"],
  "provenance": "scientific"
}
```

The response for `horizon` contains `{ "horizon": { "azimuthStepDeg": 1, "elevationsDeg": [...] }, "source": "...", "provenance": "scientific" }`; when no usable mask exists, `horizon` is `null`. `timeline` returns `{ "intervalStart", "intervalEnd", "stepMinutes", "horizonSource", "samples", "provenance" }`, with each sample containing `timestamp`, `sun`, and `earth` position/visibility objects. `compare` returns `{ "sites": [{ "siteId", "status", "result" }, ...], "interval": { "start", "durationHours" } }`; each result is the corresponding metrics response or error body.

Terrain masks use a site's LOLA DEM mask where available, then a LOLA polar terrain-grid cell for supported southern polar points, then a smooth-sphere horizon. Responses identify the source. The smooth-sphere fallback is not terrain-derived and resulting sunlight and Earth visibility shares are upper bounds. Metrics sample every 10 minutes; longest-run values are limited to the requested interval. When terrain data exists, `metrics` also returns `slopeDeg`, `elevationMeters` (catalog sites only) and, for points south of 80°S, `insidePsr` (whether the LOLA terrain-grid cell lies inside a permanently shadowed region). A field is omitted when there is no data for that point. Sun and Earth are treated as points at disk center, with no refraction.

### Site ranking

`GET /api/v1/science/rank` screens catalog sites for a hypothetical surface facility in one request. It is a comparison aid, not an engineering site selection.

| Parameter | Default and constraints |
| --- | --- |
| `start` | Required timestamp; start of the first window |
| `durationHours` | Default 720; greater than 0 and at most 720 |
| `windows` | Default 1; integer 1–4. Window *i* starts `start + i × 2190 h` (about three months apart); every window must end inside stored coverage, otherwise 422 |
| `family` | Optional exact site family filter |
| `siteIds` | Optional comma-separated list of 1–25 catalog ids. Ids not in the catalog are listed in `skipped` |
| `weights` | Optional `name:number` list, numbers 0–10, at least one above 0. Names: `sunlight`, `darkness`, `earth`, `slope`, `ice`, `iron`, `titanium`, `aluminium`, `calcium`. Unknown names return 400. Default `sunlight:1,darkness:1,earth:1,slope:1` |

Candidates are catalog sites with a verified point (`locationQuality: "verified"`) and Artemis candidate regions through their `representativePoint` (`locationQuality: "approximate-region"`). Sites with an unverified point and no representative point are listed in `skipped`. Each site uses the normal horizon chain (site LOLA mask, polar grid cell, smooth sphere), sampled every 20 minutes.

| Criterion | Measurement | Better |
| --- | --- | --- |
| `sunlight` | `sunlightPercent`, mean over windows | higher |
| `darkness` | `longestDarknessHours`, worst window | lower |
| `earth` | `earthVisibilityPercent`, mean over windows | higher |
| `slope` | `slope100mDeg` from the site `terrainSummary` (or the polar grid cell) | lower |
| `ice` | `nearestColdTrapKm` (Diviner cold-trap distance, south polar sites only) | lower |
| `iron`, `titanium`, `aluminium`, `calcium` | `feoWtPct`, `tio2WtPct`, `al2o3WtPct`, `caoWtPct` from the composition pixel | higher |

Each active criterion is min-max scaled across the candidates (1 = best, 0 = worst, 1 for everyone when all values are equal). `score` is the weighted mean of the criterion scores; a criterion the site has no value for scores 0 (worst) and is flagged `missing:<criterion>`, so missing data never helps a site. `weightCoverage` is the share of the weight the site had data for. A criterion no candidate has data for (for example composition when it is not seeded) is left out for everyone and flagged. Sites are sorted by `score` (ties by shorter darkness); `rank` is null when a site has no usable criterion. Other flags: `approximate-region-point`, `smooth-horizon-upper-bound`, `slope-over-hls-10deg` (NASA HLS 2024 landing limit, 10° over 100 m), `heritage-protection-zone` (a NASA 2011 heritage zone names the site), `impact-site`, `inside-psr`. `worstWindowSunlightPercent` reports the lowest window's sunlight share.

Extra response fields for screening:
- `recommendation`: `{ siteId, rank, reason, passedOver, allBlocked }`. The pick is the best-ranked site with no blocking flag (`heritage-protection-zone`, `impact-site`, `slope-over-hls-10deg`) and at least half of the scored weight covered. `passedOver` names the rank-1 site and its blocking flags when it was skipped. If every site is blocked, `allBlocked` is true and the top score is returned with its flags. `null` when nothing is ranked.
- `oxidesLowConfidence` (per site): oxides whose abundance is below two times its 1-sigma uncertainty, so the value is not distinguishable from noise. `oxideSigmaWtPct` gives the uncertainties for FeO, TiO2, Al2O3 and CaO.
- `compositionPixel` and `sharesCompositionPixelWith` (per site): the composition pixel index, and up to five other candidate sites inside the same pixel, which therefore share one composition value.

```json
{
  "interval": { "start": "2027-01-01T00:00:00.000Z", "durationHours": 720, "windows": 4, "windowStarts": ["..."] },
  "weights": { "sunlight": 3, "darkness": 2, "slope": 2, "iron": 1 },
  "method": { "normalisation": "...", "criteria": { "sunlight": "..." }, "slopeLimit": { "deg": 10, "source": "..." }, "sampling": "..." },
  "count": 40,
  "sites": [{
    "siteId": "artemis-malapert-massif", "name": "Malapert Massif", "family": "artemis-candidate",
    "latDeg": -85.995, "lonDeg": -0.24, "locationQuality": "approximate-region", "horizonSource": "LOLA DEM", "insidePsr": false,
    "sunlightPercent": 70, "worstWindowSunlightPercent": 55, "longestDarknessHours": 120.3, "earthVisibilityPercent": 98,
    "slope100mDeg": 4.23, "nearestColdTrapKm": 17.81, "feoWtPct": 5.1, "tio2WtPct": 0.4, "al2o3WtPct": 27.9, "caoWtPct": 15.6,
    "scores": { "sunlight": 0.93, "darkness": 0.88, "slope": 0.81, "iron": 0.12 }, "score": 0.79, "weightCoverage": 1, "rank": 1,
    "flags": ["approximate-region-point"]
  }],
  "skipped": [{ "siteId": "luna-9", "reason": "The selected site's coordinates are not verified, so scientific results are not available for it" }],
  "assumptions": ["..."],
  "provenance": "scientific"
}
```

Values in the example are illustrative.

### Surface composition

`GET /api/v1/science/composition` takes `siteId` or `lat` and `lon`. Like `rank`, it accepts an Artemis region id through its representative point (`locationQuality: "approximate-region"`); other unverified sites return 422. It reads the `compositionGrid/lp-grs-2deg` document: Lunar Prospector GRS elemental abundances on 2° equal-area pixels (Prettyman et al. 2006, `LP-L-GRS-5-ELEM-ABUNDANCE-V1.0`), about 60 km across, written by `scripts/data-pipeline/45_composition.py`. 503 means the document is not seeded.

```json
{
  "latDeg": 20.19, "lonDeg": 30.77, "locationQuality": "verified",
  "oxidesWtPct": { "FeO": 17.2, "TiO2": 6.1, "Al2O3": 12.4, "CaO": 11.1, "MgO": 9.3, "SiO2": 43.5 },
  "sigmaWtPct": { "FeO": 0.6, "TiO2": 0.5, "Al2O3": 0.9, "CaO": 0.8, "MgO": 1.1, "SiO2": 0.7 },
  "pixel": { "index": 6421, "centerLatDeg": 21, "centerLonDeg": 31.1, "sizeDeg": 2, "distanceKm": 31.4 },
  "resolutionKm": 60,
  "source": { "id": "lp-grs-elem-abundance", "product": "...", "citation": "Prettyman, T.H. et al. (2006) ..." },
  "assumptions": ["Regional average over a 2-degree equal-area pixel (about 60 km); not a measurement at this point", "..."],
  "provenance": "scientific"
}
```

Values in the example are illustrative. Oxide abundances are not mineral identifications, ore grades or extraction yields; `sigmaWtPct` is the 1-sigma uncertainty from the product's error matrix.

### Owner data

All owner routes require `Authorization: Bearer <Firebase ID token>`. The UID in the path must match the verified token UID. Owner data is never publicly readable and responses are not cached. Admin credentials are required for these routes.

| Method and route | Description |
| --- | --- |
| `GET /api/v1/users/{uid}` | Read the user's root profile document |
| `GET /api/v1/users/{uid}/sessions?limit=` | List saved sessions, newest `updatedAt` first |
| `GET /api/v1/users/{uid}/reports?limit=` | List saved reports, newest `createdAt` first |
| `GET /api/v1/users/{uid}/progress` | Read the single progress state |
| `POST /api/v1/users/{uid}/sessions` | Create a saved session |
| `POST /api/v1/users/{uid}/sessions/{sessionId}` | Merge updates into a saved session |
| `POST /api/v1/users/{uid}/reports` | Save a report summary |
| `POST /api/v1/users/{uid}/progress` | Replace the saved progress state |
| `DELETE /api/v1/users/{uid}/sessions/{sessionId}` | Delete a saved session |
| `DELETE /api/v1/users/{uid}/reports/{reportId}` | Delete a saved report |

List `limit` defaults to 100 and is clamped to 1–250. Lists return `{ "items": [...], "count": 2 }`. A missing user profile returns 404; progress reads return `{ "progress": null }` when no saved state exists. Session and report writes return HTTP 201 with `{ "id": "..." }`; progress writes return `{ "saved": true }`; deletes return `{ "deleted": true }`.

#### Create or update a session

Send JSON to the sessions route. Session IDs are generated for collection POSTs; the `/{sessionId}` form merges into that document and preserves its original `createdAt`.

```json
{
  "name": "South pole survey",
  "profileId": "short-landing",
  "siteSelections": [{ "kind": "library", "siteId": "site-id" }],
  "window": {
    "start": "2028-01-01T00:00:00Z",
    "end": "2028-01-02T00:00:00Z",
    "stepMinutes": 10
  },
  "scrubTime": "2028-01-01T12:00:00Z"
}
```

`profileId` must be `short-landing`, `robotic-14-day`, or `long-term-base`. `name` is at most 120 characters. Supply 1–3 `siteSelections`, each either `{ "kind": "library", "siteId": "..." }` or `{ "kind": "custom", "label": "...", "coordinates": { "latDeg": -85, "lonDeg": 20 } }`. Custom labels are at most 120 characters; coordinates allow latitude -90…90 and longitude -180…360. The window start/end and scrub time must parse as timestamps, end cannot precede start, and `stepMinutes` must be an integer of at least 1.

#### Save a report

`POST /api/v1/users/{uid}/reports` accepts `profileId`, `format` (`pdf` or `csv`), `window`, `siteSummaries`, `methodsSummary`, and `disclaimer`. The window has parseable `start` and `end` timestamps (end on or after start) and an integer `stepMinutes` of at least 1. Supply 1–3 summaries, each with `siteLabel` (up to 160 characters), numeric `latDeg` and `lonDeg`, optional score/energy values, and a `flags` array (up to 50 entries; only string flags are stored). `methodsSummary` is at most 4,000 characters and `disclaimer` at most 1,000 characters.

#### Save learning progress

`POST /api/v1/users/{uid}/progress` accepts `{ "chaptersCompleted": [...], "unlockedTools": [...], "expertMode": false, "stepAnswers": {} }`. Completed chapters must follow this order: `ch1-first-landing`, `ch2-robotic-explorer`, `ch3-lunar-base`. Unlocked tools must follow `horizon-dial`, `power-simulator`, `base-scoring`; expert mode unlocks all three. `stepAnswers` must be an object with at most 100 keys.

## Errors and status codes

Errors have the shape `{ "error": { "message": "..." } }` and are not cached.

| Status | Meaning |
| --- | --- |
| 400 | Invalid/missing parameters, malformed JSON, or invalid request body |
| 401 | Owner route missing a valid Firebase ID token |
| 403 | Token UID does not match the UID in the route |
| 404 | Unknown route/resource, or requested catalog/user document not found |
| 422 | Science request outside stored ephemeris coverage, or `siteId` names a catalog site without a verified point coordinate (unverified coordinates, or an Artemis region reference outside `rank` and `composition`). Use `lat`/`lon` for a custom point instead |
| 503 | Firebase/Admin configuration or required stored science data unavailable |

## Calculation paths

The server and Freeplay share one implementation of the sky maths: ephemeris interpolation and topocentric Sun/Earth positions in `lib/ephemeris`, mask lookup in `lib/terrain/mask`, and the visibility decision (`elevation > horizon at azimuth`), sampling and run-length helpers in `lib/science/sky.ts`. `/api/v1/science/*` (handlers in `lib/api/science.ts`) calls those modules directly; ranking is `lib/science/rank.ts` and composition lookup `lib/science/composition.ts`. Freeplay's graphs call the same modules in the browser on raw chunks fetched from `/api/v1/ephemeris/{YYYY-MM}`, because the year-long and per-lunar-day views need far more samples than the 24-hour `timeline` route returns. Neither path calls JPL Horizons, LOLA or PDS at request time. `tests/science-parity.test.ts` compares the client samples with the API-shaped output at the same sites, times and horizon sources.

## Data refresh and setup

The checked-in data pipeline fetches JPL Horizons ephemerides and LOLA/PDS terrain inputs, validates and packs them, and the seed command publishes the versioned dataset to Firestore. Use that pipeline to refresh source data; API requests read the stored dataset. Dataset version and generation time are exposed by `/api/v1/catalog/meta`.

Set `FIREBASE_PROJECT_ID` and either `FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials for hosted use and authenticated owner routes. Public GET routes use Firebase Web SDK credentials and Firestore public-read rules. In local development, set `NEXT_PUBLIC_FIREBASE_API_KEY` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for public reads. For the emulators, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, then start the Firebase emulators.


## Stored globe imagery and collected-data archive

- `GET /api/v1/globe/manifest`: version, scope and stored asset manifests from `catalog/globe-assets-v1`.
- `GET /api/v1/globe/assets/{id}`: reconstructs a PNG or collected-data gzip from stored catalog chunks. No upstream map service is called.
- `GET /api/v1/globe/assets/{id}?sha256={hash}`: versioned immutable response; a stale hash returns 404.

Manifest bounds are `[west, south, east, north]` in east-positive degrees. Dimensions
are the stored display resolution, not the native source resolution. Binary parts
are validated for ownership, sequence, lengths and checksum; missing/corrupt data
returns 503. Only public scientific assets are served. Unknown asset IDs return 404.
