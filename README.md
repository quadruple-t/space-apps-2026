# Shadowline

An interactive 3D mission-planning environment for the lunar south pole. Shadowline shows how terrain
shapes sunlight and direct-to-Earth line of sight at candidate landing sites.

Built for the NASA Space Apps Challenge 2026.

> The landing page and immersive Freeplay simulator are implemented. Terrain and science values are illustrative; no LOLA terrain or JPL Horizons ephemerides are integrated yet.

## Getting started

Requirements: Node.js 20+ (developed on Node 24) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build (all routes prerender as static)
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
| `/`        | Landing page                                              |
| `/mission` | Guided Mission: tutorial introduction                     |
| `/explore` | Freeplay: interactive lunar scene, custom coordinates, time controls, camera modes and demo metrics |
| `/compare` | Mission Comparison: comparison layout (empty states)      |
| `/science` | Methodology, data sources and glossary                    |

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
integrations/science/    Typed science-provider boundary and explicitly illustrative mock provider
data/                    Site copy, nav, experiences, data sources, hero-scene config
lib/                     Seeded noise, illustrative horizon model, WebGL detection, utils
hooks/                   useReducedMotion, useInView
```

## Design system

Colour uses a retro lunar palette: **purple** marks navigation and interface accents, **electric blue** marks Earth and communications, and **coral red** marks sunlight and active controls. Everything else uses regolith greys on a near-black void. Tokens are defined
in `app/globals.css` and exposed as Tailwind colours (`bg-void`, `text-bone`, `text-retro-red`, `text-retro-blue`,
`border-line`, …). Typography helpers: `.type-display`, `.type-heading` and `.type-data`.

## Simulation architecture

The landing page and Freeplay share the code-driven Three.js scene. Freeplay provides region selection, coordinate sampling, camera and time controls. Terrain and science remain behind replaceable data boundaries:

- **Terrain:** `scenes/lunar/terrain.ts`. Replace `heightAt(x, z)` with a sampler over a LOLA DEM. The
  frustum-shaped mesh builder and the scene stay unchanged.
- **Horizon masks:** `lib/horizon.ts`. `HorizonModel` (`mask`, `sunPath`, `earth`) is the shape the
  `HorizonProfile` chart renders. Swap `createIllustrativeHorizon()` for computed masks and Horizons
  ephemerides.
- **Scene configuration:** `data/hero-scene.ts` holds the Sun and Earth angles shared by the 3D scene and
  the HUD.
- **Freeplay:** `/explore` is an interactive demo workspace. See `FREEPLAY_INTEGRATION_CONTRACT.md` for provider,
  coordinate, terrain and provenance requirements before connecting real science data.

## Performance and accessibility

- The 3D scene loads client-side via `next/dynamic`. A static SVG horizon renders first and remains as
  the fallback when WebGL is unavailable or the scene errors.
- The cinematic scenes render static shadows; Freeplay refreshes the shadow map only when its illustrative Sun position changes.
  Low-end and small devices get a lighter mesh and a lower DPR cap.
- `prefers-reduced-motion` freezes the camera, disables reveals and the hero entrance, and switches the
  canvas to on-demand rendering.
- Skip link, keyboard-accessible navigation and lunar map, visible focus rings, and an accessible mobile menu
  (Radix Dialog).

## Firestore

All displayed data is read from Firestore at runtime (project `shadowline-2t12`). Static collections are
public-read and seeded with the Admin SDK; user data (`users/{uid}/…`) is owner-only. Client code lives in
`lib/firebase/client.ts`, `lib/firestore/*` (typed converters and cached services) and `lib/auth/`.

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

## Data sources (planned)

- [Lunar Orbiter Laser Altimeter (LOLA), PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/lro/lola.htm)
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)

Not affiliated with or endorsed by NASA.
