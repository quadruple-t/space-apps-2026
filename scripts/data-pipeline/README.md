# Shadowline data pipeline

Offline Python pipeline that downloads, precomputes and validates every dataset the app displays and writes
Firestore-ready JSON to `data/seed/`. The app itself never calls Horizons, PDS or any other service; the
TypeScript seed script (`scripts/seed-firestore.ts`) uploads `data/seed/` to Firestore.

Binary fields are written as `{"$bytes": "<base64>"}` (little-endian payloads); the seed script turns them
into Buffers (Firestore Bytes). Raw DEMs and other multi-GB inputs live in `.cache/` (gitignored) and are
never committed. Only derived outputs under `data/seed/` are committed.

## Setup

Python 3.11+ (developed on 3.13).

```bash
cd scripts/data-pipeline
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run everything

Run from `scripts/data-pipeline/`. Every stage is idempotent and caches under `.cache/`.

```bash
.venv/bin/python 00_fetch.py          # downloads (resumable) + manifest.lock.json
.venv/bin/python 10_sites.py          # sites/, catalog/siteIndex (fails if a verified site moves > 50 m vs the LROC shapefile)
.venv/bin/python 20_ephemeris.py      # Horizons global series (sequential, cached)
.venv/bin/python 21_ephemeris_check.py# client math vs direct Horizons; fails above 0.02 deg
.venv/bin/python 60_curated.py        # presets, facts, story, profiles, validation (pending), dataSources
.venv/bin/python 40_psr.py            # PSR layer, cold-trap flags, PSR zones
.venv/bin/python 50_zones.py          # NASA-2011 heritage zones
.venv/bin/python 30_site_terrain.py   # per-site 720-bin horizon masks (needs 40_psr.py first for PSR distances)
.venv/bin/python 70_demo.py           # Home demo series (needs 30 for the mask)
.venv/bin/python 31_terrain_grid.py   # south-polar custom-coordinate grid (the long one)
.venv/bin/python 80_validate.py       # computes validation checks, lit fractions, size report, catalog/meta
```

Stage 60 writes `validationChecks` with computed fields pending; stage 80 is the only writer of `computed`,
`deltaDeg` and `status`. Rerun `80_validate.py` after any change to terrain or ephemeris.

Rerun one stage: just run its script (for example `30_site_terrain.py --only apollo-11-tranquility`). To force
a recompute, delete its cache: `.cache/windows/` (remote DEM windows), `.cache/grid/` (grid tiles),
`.cache/horizons/` (Horizons responses).

## Expected runtime and disk (measured on an Apple M4, 10 cores, a slow 0.1-1 MB/s link)

| Stage | Runtime | Notes |
|---|---|---|
| `00_fetch` | about 1.5-3 h on a slow link | about 3.5 GB downloaded (Diviner PRP 605 MB, LDEM_80S_40MPP 716 MB, LPSR 154 MB, 240/80 m DEMs and errors, five 5 m site tiles) |
| `20_ephemeris` | about 3 min | about 40 sequential Horizons requests |
| `30_site_terrain` | about 5-15 min | remote COG / multi-range windows are cached |
| `40_psr` | about 25 s (after the PRP parse) | first run parses the 605 MB PRP once (about 10 min) |
| `31_terrain_grid` | about 12-15 min on 8 processes | 33,441 cells, 169 tiles; resumable |
| other stages | under 1 min each | |

Disk: `.cache/` about 4 GB; `data/seed/` about 65 MB of JSON (about 48 MiB of Firestore data). Free at least 6 GB.

## Provenance and policy

- `manifest.lock.json` lists every whole-file download (URL, bytes, sha256, Last-Modified / ETag, retrievedAt)
  and every range-read source (COG windows, SLDEM2015 and LOLA tiles, Horizons).
- Horizons: one request at a time, disk-cached, 1 s spacing, back-off on errors, `$$SOE` checked in every
  response (input errors arrive as HTTP 200), at most 90,000 rows per request.
- Every stored scientific value carries a source (URL, product or version, retrieval date) or is `null` and
  listed in `docs/MISSING_DATA.md`. Assumptions carry `basis: "assumption"`.
- Curated inputs live in `curated/*.json`; source references are keys into `curated/refs.json`.

See `docs/METHODS.md` (equations, error margins, validation), `docs/SOURCES.md`, `docs/MISSING_DATA.md` and
`docs/DATA_SIZE_REPORT.md`.


## Firebase globe archive

From the repository root, run `npm run archive:globe` to collect complete globe
snapshots at the selected overview resolution and create seed-ready binary chunks.
`npm run archive:globe -- --upload` runs the normal full static seed validator and
uploader and then reads every asset back to verify SHA-256. `--verify` repeats only
the readback. Raw requests are cached in `.cache/globe-assets/`; provenance is in
`globe-archive.lock.json`. The collected-data gzip includes the original seed data,
curation, cached source responses/tiles and citations. It excludes generated chunk
JSON to avoid recursive archives, credentials, user data and unavailable full-size
upstream source archives. See the root README for storage layout and API routes.
