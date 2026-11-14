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

Public collection names are `sites`, `chapters`, `profiles`, `zones`, `presets`, `facts`, `validations`, `sources`, `ephemeris`, `terrain`, `psr`, and `demos`. These map to Firestore collections `sites`, `storyChapters`, `missionProfiles`, `protectionZones`, `landerPresets`, `facts`, `validationChecks`, `dataSources`, `ephemerisGlobal`, `terrainGrid`, `psrLayer`, and `demo`, respectively. Collection reads accept `limit` (default 250, clamped to 1–250) and `cursor` (the last document ID from the previous page). The response is `{ "items": [...], "count": 2, "limit": 2, "hasMore": true, "nextCursor": "..." }`; `nextCursor` is `null` when the collection is empty.

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

Terrain masks use a site's LOLA DEM mask where available, then a LOLA polar terrain-grid cell for supported southern polar points, then a smooth-sphere horizon. Responses identify the source. The smooth-sphere fallback is not terrain-derived and resulting sunlight and Earth visibility shares are upper bounds. Metrics sample every 10 minutes; longest-run values are limited to the requested interval. Sun and Earth are treated as points at disk center, with no refraction.

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
| 422 | Science request outside stored ephemeris coverage, or `siteId` names a catalog site without a verified point coordinate (unverified coordinates, or an Artemis region reference). Use `lat`/`lon` for a custom point instead |
| 503 | Firebase/Admin configuration or required stored science data unavailable |

## Calculation paths

The server and Freeplay share one implementation of the sky maths: ephemeris interpolation and topocentric Sun/Earth positions in `lib/ephemeris`, mask lookup in `lib/terrain/mask`, and the visibility decision (`elevation > horizon at azimuth`), sampling and run-length helpers in `lib/science/sky.ts`. `/api/v1/science/*` calls those modules directly. Freeplay's graphs call the same modules in the browser on raw chunks fetched from `/api/v1/ephemeris/{YYYY-MM}`, because the year-long and per-lunar-day views need far more samples than the 24-hour `timeline` route returns. Neither path calls JPL Horizons, LOLA or PDS at request time. `tests/science-parity.test.ts` compares the client samples with the API-shaped output at the same sites, times and horizon sources.

## Data refresh and setup

The checked-in data pipeline fetches JPL Horizons ephemerides and LOLA/PDS terrain inputs, validates and packs them, and the seed command publishes the versioned dataset to Firestore. Use that pipeline to refresh source data; API requests read the stored dataset. Dataset version and generation time are exposed by `/api/v1/catalog/meta`.

Set `FIREBASE_PROJECT_ID` and either `FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials for hosted use and authenticated owner routes. Public GET routes use Firebase Web SDK credentials and Firestore public-read rules. In local development, set `NEXT_PUBLIC_FIREBASE_API_KEY` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for public reads. For the emulators, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, then start the Firebase emulators.
