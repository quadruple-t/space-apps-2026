# Lunaris360

An interactive 3D mission-planning environment for the lunar south pole. Lunaris360 shows how terrain
shapes sunlight and direct-to-Earth line of sight at candidate landing sites.

Built for the NASA Space Apps Challenge 2026.

> Freeplay is implemented with stored JPL Horizons ephemerides and available precomputed LOLA horizon masks. Coverage varies by location; unsupported points use a labelled smooth-sphere horizon. The rendered 3D surface is procedural and is not the terrain model used for horizon calculations. The Guided Mission is an interactive tutorial that runs the same simulation at the story chapters' featured catalog sites, and Mission Comparison is an empty layout.

## Getting started

Requirements: Node.js 20+ (developed on Node 24) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build and type-check
npm run start      # serve the production build
npm run lint       # ESLint (Next.js + React Compiler rules)
```

## Stack

- **Next.js 16** (App Router, Turbopack, Cache Components) with **React 19** and **TypeScript**
- **Tailwind CSS v4** through `@tailwindcss/postcss`, with design tokens in `app/globals.css`
- **shadcn/ui** (Radix) for `Button`, `Sheet` (mobile nav) and `Separator`
- **three.js** + **@react-three/fiber** for the lunar scene
- Fonts via `next/font`: Archivo (expanded display), IBM Plex Sans (body), IBM Plex Mono (data)

## Routes

| Route      | Purpose                                                   |
| ---------- | --------------------------------------------------------- |
| `/`        | Overview and how to use Lunaris360                         |
| `/mission` | Guided Mission: six interactive lessons across the First Landing, Robotic Explorer and Lunar Base chapters, run inside Freeplay's globe, Orbit + Graphs and surface drive |
| `/mission-control` | Mission Control: learning topics, method and data    |
| `/how-it-works` | How It Works: the surface view and the modelling approach, moved off the landing page |
| `/freeplay` | Freeplay mission planner: Cesium Moon globe (Moon Trek imagery, LROC overlays, catalog sites, user-named presets) and an orbit + graphs view driven by the stored ephemeris and LOLA horizon masks |
| `/freeplay/drive` | Freeplay surface drive: site and coordinate selection, time controls, first-person/orbit navigation, JPL Horizons Sun/Earth positions, horizon-aware 24-hour metrics where data is available (`/explore` redirects here). Opens at the site and time selected in Freeplay. |
| `/freeplay/approach` | Sunlight hours, intensity and Earth contact over a mission of up to a year at one site (`/explore/approach` redirects here) |
| `/compare` | Mission Comparison shell with an empty state; multi-site comparison is not implemented yet |

## Project structure

```
app/                     Routes (App Router), root layout, global styles
components/
  brand/                 Logo and mark
  layout/                Navbar, Footer, PageContainer
  landing/               Landing sections (Hero, Challenge, Introduction, Experiences, Science, Final CTA)
  experience/            Shared intro and cross-links for the experience routes
  graphics/              SVG diagrams: horizon profile, challenge diagrams, static lunar horizon
  ui/                    shadcn primitives + Reveal, SectionHeading, StatusBadge
scenes/lunar/            Reusable 3D scene (terrain, Sun/Earth/stars, camera rig, landing marker, loader)
integrations/science/    Science API client, Firestore-backed calculation provider, types and illustrative mock provider
integrations/terrain/    Lunar location catalog and scaffold terrain samples for rendering
app/api/v1/              Versioned API for catalog and science queries
data/                    Site copy, nav, experiences, data sources, hero-scene config
lib/                     Seeded noise, illustrative horizon model, WebGL detection, utils
hooks/                   useReducedMotion, useInView
```

## Design system

Colour uses a retro lunar palette: **purple** marks navigation and interface accents, **electric blue** marks Earth and communications, and **coral red** marks sunlight and active controls. Everything else uses regolith greys on a near-black void. Tokens are defined
in `app/globals.css` and exposed as Tailwind colours (`bg-void`, `text-bone`, `text-retro-red`, `text-retro-blue`,
`border-line`, …). Typography helpers: `.type-display`, `.type-heading` and `.type-data`.

For marketing and partner material, use [`docs/brand/BRAND_GUIDE.md`](docs/brand/BRAND_GUIDE.md) (rules and voice), the visual [`brand-guide.html`](docs/brand/brand-guide.html), and the drop-in [`shadowline-tokens.css`](docs/brand/shadowline-tokens.css).

## Simulation architecture

The landing page preview and Freeplay share the code-driven Three.js scene. Freeplay provides region selection, coordinate sampling, first-person/orbit camera controls and a UTC simulation clock. Scientific calculations are served through `/api/v1/` and read stored data from Firestore:

- **Ephemerides:** Stored JPL Horizons series provide Sun and Earth positions from 2026 through 2030 for the main series, plus historical chunks for supported sites. The API calculates local azimuth/elevation and timeline samples for the selected point.
- **Horizon masks:** Precomputed LOLA DEM masks are used for supported sites and polar grid cells. Locations without a terrain mask use a smooth-sphere horizon; results label that source and describe the sunlight and visibility shares as upper bounds.
- **Rendered terrain:** `scenes/lunar/terrain.ts` and `integrations/terrain/moon-samples.ts` provide procedural scene geometry and scaffold samples. This visualization is not a LOLA DEM rendering, even when the science calculation has a LOLA mask.
- **Illustrative previews:** `data/hero-scene.ts` configures conceptual hero readouts; `lib/horizon.ts` supplies illustrative horizon examples for landing-page graphics. These values are separate from Freeplay's science API.
- **Scene configuration:** `data/hero-scene.ts` holds the Sun and Earth angles shared by the 3D scene and
  the conceptual hero HUD.
- **Freeplay (`/freeplay`, `/freeplay/approach`):** loads the monthly `ephemeris` chunks and `science/horizon` masks from `/api/v1` and evaluates hourly Sun/Earth positions in the browser with `lib/ephemeris` (`lib/lunar-data.ts`). Globe imagery and overlays are stored Firebase snapshots of NASA Moon Trek and LROC Lunaserv products (see `docs/SOURCES.md` §7).
- **Surface drive:** `/freeplay/drive` calls the versioned science API. The API uses public Firestore reads for catalog and science data; user-owned endpoints use authenticated Firebase tokens and Admin SDK access.

## Performance and accessibility

- The 3D scene loads client-side via `next/dynamic`. A static SVG horizon renders first and remains as
  the fallback when WebGL is unavailable or the scene errors.
- The cinematic scenes render static shadows; Freeplay refreshes the shadow map only when the Sun position changes.
  Low-end and small devices get a lighter mesh and a lower DPR cap.
- `prefers-reduced-motion` freezes the camera, disables reveals and the hero entrance, and switches the
  canvas to on-demand rendering.
- Skip link, keyboard-accessible navigation and lunar map, visible focus rings, and an accessible mobile menu
  (Radix Dialog).

## Firestore

Catalog and science data are read from Firestore at runtime (project `shadowline-2t12`); the versioned API serves public reads using Firestore public-read rules. Static collections are seeded with the Admin SDK. User data (`users/{uid}/…`) is owner-only and accessed through authenticated API routes. Firebase client, Firestore and auth code lives in `lib/firebase/`, `lib/firestore/` and `lib/auth/`.

**Env:** copy `.env.example` to `.env.local` and fill in the web-app config from the Firebase console. Set
`NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true` to use the local emulators (auth 9099, Firestore 8080, UI 4000).

```bash
npm run emulators       # start auth + Firestore emulators (needs Java 21)
npm run seed:emulator   # validate data/seed/ and write it to the emulator
npm run smoke           # client-SDK smoke test against the running emulators
npm test                # unit tests (vitest)
npm run test:rules      # security-rules tests (starts its own Firestore emulator; port 8080 must be free)
```

`scripts/seed-firestore.ts` validates everything before writing and aborts on any error. Useful flags:
`--dry-run` (validate and print sizes only) and `--only sites,catalog`.

**Deploy rules and indexes:**

```bash
npx -y firebase-tools@15.36.0 deploy --only firestore:rules,firestore:indexes \
  --project shadowline-2t12 --account taran.duba3@gmail.com
```

**Seed production:** first run `gcloud auth application-default login` as taran.duba3@gmail.com, then
`npm run seed:prod -- --yes`. The project id comes from `.firebaserc`.

## Data sources

- [Lunar Orbiter Laser Altimeter (LOLA), PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) — precomputed horizon masks and polar terrain-grid masks where coverage is available.
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) — stored ephemerides used to calculate Sun and Earth positions.

Globe science overlays and meteor references (retrieved 2026-11-14):

- [LROC Lunaserv map catalog](https://wms.im-ldi.com/?service=WMS&request=GetCapabilities) — imagery metadata and WMS layers. [NASA Moon Trek](https://trek.nasa.gov/moon/) supplies the base mosaic and slope overlays.
- [LROC WAC titanium oxide, Sato et al. (2017)](https://doi.org/10.1016/j.icarus.2017.06.013) — TiO₂ abundance estimates, 70°S–70°N.
- [Kaguya mineral maps, Lemelin et al. (2016)](https://www.hou.usra.edu/meetings/lpsc2016/pdf/2994.pdf) — FeO, olivine, plagioclase and clinopyroxene, 50°S–50°N.
- [Lunar Prospector thorium, Lawrence et al. (2007)](https://doi.org/10.1029/2006GL028530) — regional thorium abundance.
- [Diviner silicate mineralogy, Greenhagen et al. (2010)](https://doi.org/10.1126/science.1192196) — Christiansen-feature composition proxy.
- [Diviner temperature maps, Williams et al. (2017)](https://doi.org/10.1016/j.icarus.2016.08.012) — maximum/minimum anomalies relative to latitude means; historical observations, not forecasts.
- [Ice-stability modeling, Siegler et al. (2016)](https://doi.org/10.1038/nature17166) — modeled south-polar ice-stability depth, not detected ice.
- [LROC Copernican crater catalog](https://wms.im-ldi.com/?service=WMS&request=GetCapabilities) — Ravi et al. (2016), natural craters >10 km, younger than approximately 1.1 billion years, 60°S–60°N; impact history, not present-day storm frequency.
- [TUM 2026 meteoroid stream geometry](https://www.asg.ed.tum.de/en/lpe/forschung/mondeinschlagsblitze/meteoroid-stream-geometry/) — seven shower radiants and reference epochs. [NASA/JPL NAIF pck00011](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc) supplies the approximate lunar orientation used to derive the stream-facing hemispheres.
- [NASA Meteoroid Environment Office](https://www.nasa.gov/meteoroid-environment-office/shower-meteoroid-environment/) — context for time-varying shower hazards; the overlay does not predict storm frequency or impact rates.

These additions follow the existing data workflow: curated inputs in
`scripts/data-pipeline/curated/`, source manifests in `data/seed/dataSources/`, and
API-backed meteor facts in `data/seed/facts/meteor-streams-2026.json`. Run
`python3 scripts/data-pipeline/61_globe_layers.py` **before** stage 60 to reproduce
those reference facts. The map inventory and product abstracts are retained in
`curated/globeMaps.json`; the downloaded capabilities snapshot is recorded in
`manifest.lock.json` with its hash and cached under `.cache/globe/`.

The globe now reads stored image snapshots from Firestore through `/api/v1/globe`.
The images are stored as 240 KiB binary chunks under `catalog/`, using the same
Firestore Bytes convention as terrain and ephemerides. Original source metadata,
image bounds, dimensions, byte counts, and SHA-256 hashes are preserved. No Firebase
Storage bucket or billing-plan change is needed for this bounded archive.

The selected scope is **complete globe display snapshots plus all collected app
data**, not the upstream full-resolution scientific archives. Most images are
2048 × 1024; the regional south-pole slope snapshot is 4096 × 256 with its actual
bounds. Zooming does not increase their detail. The globe fetches imagery only
from this app's Firebase-backed API, with no live Moon Trek/Lunaserv fallback.

`catalog/globe-assets-v1` lists the stored assets. `catalog/globe-asset-*` documents
hold manifests; `catalog/globe-chunk-*` documents hold their binary payloads.
The `collected-data` asset is a gzipped JSON bundle containing the original static
seed data, curated inputs, locally downloaded source responses and tile bytes,
and source documentation. Each bundled file includes its relative path, encoding,
and checksum. Private credentials and user records are excluded.

```bash
npm run archive:globe                 # prepare snapshots and seed files; no cloud writes
npm run archive:globe -- --upload     # validate and sync static data, then verify readback
npm run archive:globe -- --verify     # read every stored asset back and check its checksum
```

Import provenance is retained in `scripts/data-pipeline/globe-archive.lock.json`;
generated Firestore documents remain under `data/seed/catalog/`. The original
source credits above and [complete inventory](docs/SOURCES.md) also apply to the
stored copies. The globe sidebar includes a collected-data download link.

The app is an educational planning and visualization tool, not an operational mission system. Data coverage and assumptions are exposed in Freeplay; the procedural display terrain should not be interpreted as measured topography.

Not affiliated with or endorsed by NASA.

Mission Prompt:
Missions to the Moon’s south pole face extreme lighting and communication constraints, and planning them takes careful coordination between science and engineering teams. Tools for determining Sun and Earth positions at candidate landing sites exist, but their complicated interfaces make it difficult to evaluate critical information with efficiency. Your challenge is to create an intuitive tool or application that lets mission planners, educators, and the public compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows.

Background
NASA’s Commercial Lunar Payload Services (CLPS) program and other lunar missions depend on careful selection of landing sites and dates that balance the needs of both science and engineering teams. One of the most significant challenges in this process is understanding the local lighting and communication environment at a potential landing site. The position of the Sun determines power availability for solar arrays and thermal conditions for equipment, while the position of Earth determines whether direct communication is possible without relay satellites.

This challenge is particularly acute at the Moon's south pole, where many future missions are planned due to the presence of water ice and other scientifically valuable resources. The south pole's geometry creates extreme variations in solar illumination and Earth visibility across different lunar days and seasons. Small changes in landing location or date can dramatically affect both power generation potential and communication windows, making rapid site evaluation critical.

In practice, mission development rarely proceeds on a fixed timeline. Hardware development challenges, launch delays, or other factors often force mission planners to reconsider their original landing date and location. When this happens, engineers need to quickly evaluate alternative sites in the same region, or alternative dates at the same site, to understand how these changes impact mission feasibility. A tool that enables rapid, intuitive comparison of multiple scenarios would accelerate this decision-making process and help teams identify viable alternatives when constraints shift.

Tools that provide this information — such as NASA's Quickmap, Moon Trek, and the JPL Horizons System — are built for detailed analysis and are often difficult for non-specialists to use effectively for rapid scenario comparison. Evaluating each site-data combination means navigating multiple interfaces and interpreting raw data. This leaves a gap between the technical data available and the accessible tools needed to support agile mission planning. An intuitive interface that translates complex ephemeris and topographic data into clear, comparable visualizations could help bridge that gap.

Objectives
Your challenge is to create a tool or application that enables rapid evaluation of lunar landing site options. Your solution may include:

Interactive site selection and comparison: You may consider allowing users to choose from a curated list of notable landing sites – such as past Apollo missions, future CLPS mission targets, targets of other commercial lunar missions, or landing sites from other countries' lunar programs – as well as the ability to input custom lunar coordinates. You may also consider enabling side-by-side or sequential comparison of multiple sites to help users quickly assess trade-offs.
Date and time flexibility: You may consider allowing users to select landing dates and times, and providing tools to explore how conditions change across different lunar days or seasons. This enables users to understand how mission schedule adjustments affect feasibility.
Sun and Earth position visualization: Display the positions of the Sun and Earth relative to the horizon at a selected landing site on a chosen date. You may consider showing how much time remains before sunset or Earthset, as this directly impacts mission operations and power generation windows.
Power and communication assessment: You may consider highlighting key metrics such as solar elevation angle (which affects power generation efficiency), duration of sunlight, and Earth visibility windows. These metrics help mission planners quickly assess whether a site-date combination is viable.
Multiple visualization approaches: You may explore 2D maps, 3D surface visualizations, or other creative representations that help users understand the spatial relationships between the landing site, Sun, and Earth.
Temporal dynamics: You may consider creating animations or timeline views that show how Sun and Earth positions change over a lunar day or across multiple days, helping users understand the duration and timing of operational windows.
Accessibility across skill levels: Your tool could serve mission planners seeking detailed technical information for rapid decision-making, as well as educators and the general public curious about why the Moon presents such distinct engineering challenges.
You are encouraged to be creative in how you present this information. Your solution might be a web application, a mobile app, an interactive visualization, an educational game, or another format entirely — as long as it makes rapid site evaluation clear and efficient.

Potential Considerations
You may (but are not required to) consider the following:

Technical approach:

Ephemeris data – the positions and motions of celestial bodies – can be calculated using tools like the JPL Horizons System, or you may consider using pre-computed datasets.
Lunar topography data from sources like the Lunar Orbiter Laser Altimeter (LOLA) can help create realistic surface visualizations and accurate horizon calculations.
Consider how to handle the Moon's lack of atmosphere when calculating horizon positions. Without atmospheric refraction, the horizon is determined by local terrain and the edge of the lunar sphere as seen from the landing site.
Solar elevation angle is a key metric for power generation, and you may consider calculating and displaying this prominently.
User experience:

Your interface could prioritize rapid scenario comparison, allowing mission planners to evaluate multiple site-date combinations efficiently.
Consider how to clearly communicate time remaining before sunset or Earthset, as this is critical operational information.
Think about how to make the extreme differences between lunar and terrestrial conditions apparent—they can be compelling when visualized effectively.
You may consider features that help users understand why small location or date changes have large impacts on mission feasibility.
Data and accuracy:

Consider accounting for the Moon's actual topography, as terrain elevation can significantly affect horizon positions and visibility windows.
Consider whether your tool will account for factors like Earth's libration (wobble) or the Moon's orbital variations.
South pole terrain is particularly complex, and you may consider how to represent steep slopes and deep craters that create extreme shadow conditions.
Engagement and impact:

Your solution could support mission planners in coordinating between science and engineering teams during mission development.
It could help teams respond quickly when schedule changes or hardware development challenges require landing date or location adjustments.
It could also serve as an educational tool to help students and the public understand lunar exploration challenges and why mission planning is so complex.
For data and resources related to this challenge, refer to the Resources tab at the top of the page. More resources may be added before the hackathon begins.

Resources:
We are given but not limited too:

An interactive mapping tool developed by Arizona State University that provides access to high-resolution lunar imagery, topographic data, and other datasets from NASA's Lunar Reconnaissance Orbiter. You can use Quickmap to explore landing sites, visualize terrain, and understand the lunar surface in detail - particularly useful for understanding the complex topography of south pole regions.
https://quickmap.lroc.im-ldi.com/?earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg

NASA's interactive 3D visualization tool for lunar exploration. Moon Trek allows you to explore the lunar surface, view topographic data, and understand the terrain at potential landing sites. It provides an intuitive interface for spatial understanding of lunar locations and can help you visualize how terrain affects horizon positions.
https://trek.nasa.gov/moon/#v=0.1&x=0&y=0&z=1&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&d=&locale=&b=moon&e=-247.49999538324226%2C-140.9765598702843%2C247.49999538324226%2C140.9765598702843&sfz=&w=

A powerful ephemeris computation tool developed by NASA's Jet Propulsion Laboratory that calculates the positions and velocities of celestial bodies, including the Sun and Earth as seen from any location on the Moon. You can use Horizons to obtain the precise angular positions of the Sun and Earth at specific times and locations, which form the foundation for your visualizations and power/communication assessments.
https://ssd.jpl.nasa.gov/horizons/

Explore the CSA’s Moon Exploration portal to learn about past, current, and future missions to the Moon. Discover Canada's contributions to lunar exploration, including technologies, scientific research, and participation in the Artemis program
https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/

Final Idea: Story Mode with past present future timelines, along with a free play 
