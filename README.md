# Shadowline

An interactive 3D mission-planning environment for the lunar south pole. Shadowline shows how terrain
shapes sunlight and direct-to-Earth line of sight at candidate landing sites.

Built for the NASA Space Apps Challenge 2026.

> **Status: Phase 1 (website foundation).** The landing page, design system and route structure are
> complete. The simulator is not built yet. All terrain is **procedurally generated** and every value
> shown is **illustrative**. No LOLA terrain or JPL Horizons ephemerides are integrated yet.

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
- **Tailwind CSS v4** with design tokens in `app/globals.css`
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

Colour is semantic. **Amber (`--sun`) always means sunlight** and **blue (`--earth`) always means Earth or
communications**. Everything else uses the regolith greyscale on a near-black void. Tokens are defined
in `app/globals.css` and exposed as Tailwind colours (`bg-void`, `text-bone`, `text-sun`, `text-earth`,
`border-line`, …). Typography helpers: `.type-display`, `.type-heading` and `.type-data`.

## Building the simulator (next phases)

The landing page doesn't depend on simulation code. These are the seams designed for it:

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
- The cinematic scenes render static shadows; Freeplay updates shadows as its illustrative Sun position changes.
  Low-end and small devices get a lighter mesh and a lower DPR cap.
- `prefers-reduced-motion` freezes the camera, disables reveals and the hero entrance, and switches the
  canvas to on-demand rendering.
- Skip link, keyboard-accessible navigation, visible focus rings (amber), and an accessible mobile menu
  (Radix Dialog).

## Data sources (planned)

- [Lunar Orbiter Laser Altimeter (LOLA), PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/lro/lola.htm)
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)

Not affiliated with or endorsed by NASA.
