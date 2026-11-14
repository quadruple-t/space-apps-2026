# Shadowline data API

The Next.js REST API exposes the seeded Firestore catalog and science calculations at `/api/v1`. Static responses use short CDN caching; authenticated user data is never cached. The API uses Firebase Admin credentials on the server and never exposes those credentials to the browser.

## Resources

| Route | Purpose |
| --- | --- |
| `GET /api/v1` | API manifest |
| `GET /api/v1/catalog/sites?q=&family=` | Searchable site index |
| `GET /api/v1/catalog/sites/{id}` | Site details and its precomputed terrain mask |
| `GET /api/v1/catalog/meta` | Dataset version and collection counts |
| `GET /api/v1/science/celestial?siteId=&time=` | Topocentric Sun/Earth azimuth, elevation, and terrain visibility |
| `GET /api/v1/science/timeline?siteId=&start=&stepMinutes=1` | One-day celestial timeline for smooth client playback |
| `GET /api/v1/science/horizon?siteId=` | Site horizon mask |
| `GET /api/v1/science/metrics?siteId=&start=&durationHours=` | Sampled sunlight and direct-to-Earth availability metrics |
| `GET /api/v1/science/compare?siteIds=a,b&start=&durationHours=` | Same mission-window metrics for two or three sites |
| `GET /api/v1/{chapters,profiles,zones,presets,facts,validations,sources,ephemeris,terrain,psr,demos}?limit=` | Public collection access |
| `GET /api/v1/{collection}/{id}` | Public document access; use `sites/{id}/terrain/v1` for a site mask |
| `GET /api/v1/users/{uid}/{sessions,reports}?limit=` | Owner's saved records |
| `POST /api/v1/users/{uid}/sessions[/{id}]` | Create or update a saved session |
| `POST /api/v1/users/{uid}/{reports,progress}` | Save owner data |
| `DELETE /api/v1/users/{uid}/{sessions,reports}/{id}` | Delete an owner record |

Science endpoints accept a `siteId` for catalog sites with coordinates. They also accept `lat` and `lon` for a custom point. Values use planetocentric latitude and east-positive longitude in degrees. All times are ISO 8601 UTC. Mission metrics accept `durationHours` from 0 to 720 (default 24). Horizons calculations use the cached JPL series from 2026-01 through 2030-12; outside that interval the API returns HTTP 422 instead of extrapolating.

Responses include provenance and interval assumptions. A smooth-sphere fallback is explicitly labelled when a terrain mask is unavailable. `GET /api/v1/catalog/sites` returns the curated site index; filters are `q` and `family`.

## NASA/JPL refresh path

The checked-in data pipeline fetches JPL Horizons ephemerides and LOLA/PDS terrain inputs, validates and packs them, and the seed command publishes the resulting versioned dataset to Firestore. Use that pipeline to refresh the cached source data; interactive API requests do not call NASA/JPL and therefore do not wait on external feeds. Dataset version and generation time are exposed through `/api/v1/catalog/meta`.

## Authentication and setup

Send `Authorization: Bearer <Firebase ID token>` for owner resources. The route verifies the token and derives the allowed UID from its signed claims; a caller cannot read or write another UID's documents. Set `FIREBASE_PROJECT_ID` and either `FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials for local/server use. For the emulators, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, then start the Firebase emulators.

Errors use `{ "error": { "message": "..." } }`. Collection reads accept `limit` up to 250 and return `{ items, count, limit, hasMore }`.
