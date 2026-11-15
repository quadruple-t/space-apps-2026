# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lunaris360: a lunar mission-planning and educational website (NASA Space Apps Challenge 2026). Freeplay uses stored JPL Horizons ephemerides and available precomputed LOLA horizon masks through the versioned science API. The rendered 3D surface is procedural and separate from those horizon calculations. Unsupported locations use a labelled smooth-sphere horizon; never present it as terrain-derived. The Guided Mission is an interactive tutorial that docks its lessons beside Freeplay's globe and Orbit + Graphs screens and ends in the surface drive, using the story chapters' featured catalog sites, and Mission Comparison is an empty layout. Do not present the app as an operational mission system.

## Commands

```bash
npm run dev      # http://localhost:3000 (Tailwind v4 via PostCSS)
npm run build    # production build and type-check
npm run start    # serve the production build
npm run lint     # ESLint (Next.js + React Compiler rules)
npm test         # Vitest unit tests
npm run test:rules # Firestore security-rules tests (starts emulator; port 8080 must be free)
npx vitest run tests/illumination.test.ts   # single test file (add -t "name" to filter)
npm run emulators  # Firebase auth + Firestore emulators (needs Java 21)
npm run seed:emulator   # validate data/seed/ and write it to the emulator (seed:prod needs -- --yes)
```

`npm run build` also type-checks the application. `dev`/`build` first run `scripts/copy-cesium.mjs` (copies Cesium static assets). Copy `.env.example` to `.env.local`; `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true` points the app at the local emulators. See README.md for seed flags, rules deployment and the assistant's one-time Firebase setup.

## Stack notes

- Next.js 16 App Router with `cacheComponents` and `partialPrefetching` enabled in `next.config.ts`, React 19, React Compiler lint rules. Check `node_modules/next/dist/docs/` or current docs before relying on older Next.js behaviour.
- Tailwind v4 is wired through `@tailwindcss/postcss`. The PostCSS entry is `postcss.config.mjs`; design tokens live in `app/globals.css`.
- shadcn/ui (Radix) primitives in `components/ui/` (`components.json` configures the CLI). Imports use the `@/` alias.
- three.js + `@react-three/fiber` for the 3D scene.

## Architecture

- `app/`: routes `/`, `/mission`, `/freeplay` (globe, `orbit`, `drive`, `approach` screens; state in `lib/freeplay-store.ts`), `/compare`, `/science`, `/how-it-works`, `/mission-control` (learning content, unrelated to the assistant), plus the versioned `/api/v1/` science and catalog API (single catch-all handler in `app/api/v1/[[...path]]`). `/explore` and `/explore/approach` are redirects to `/freeplay/drive` and `/freeplay/approach` (`next.config.ts`). `/mission` runs the guided tutorial (`app/mission/`: lesson copy in `tutorial-content.ts`, chapter and site records from `/api/v1/chapters` and `/api/v1/catalog/sites` via `use-tutorial-data.ts`) and `/compare` is currently an empty-state shell. `FREEPLAY_INTEGRATION_CONTRACT.md` is an older doc that still refers to `app/explore/freeplay.tsx`; trust the code.
- Before changing or adding `/api/v1` endpoints, read `docs/API.md`; keep that reference in sync with route behavior, parameters, payloads, and authentication.
- `scenes/cesium/`: Cesium-based Moon globe used by Freeplay's globe screen (`moon-globe.tsx`, layers, `load-cesium.ts`).
- `lib/assistant/` + `components/freeplay/mission-control-assistant/`: the Freeplay "Mission Control" AI assistant. It uses Firebase AI Logic (`firebase/ai`) with a server-side prompt template whose source of truth is `docs/ai/prompt-templates/mission-control-v1-1-0.prompt`; editing it requires re-pasting into the Firebase console (see README). `agent-loop.ts` is a manual, capped tool loop (no SDK auto function calling); data tools wrap read-only `/api/v1` calls, and `show_in_freeplay` (applied by `ui-actions.ts`, undoable from the chat) is the only tool that changes UI state, with schemas in `tool-schemas.ts` and validators in `tool-validation.ts`. Keep tool, validator and template changes in sync, and the answers sourced from tools, never model memory. Tests mock the model (`tests/assistant-*.test.ts`).
- `scenes/lunar/`: the reusable 3D scene. `lunar-scene.tsx` composes `terrain.ts` (height function and mesh builder), `celestial.tsx` (Sun, Earth, stars), `camera-rig.tsx` and `landing-site.tsx`. `lunar-scene-loader.tsx` loads it client-side via `next/dynamic`.
- `integrations/science/`: client API adapter and provider types. The API performs authoritative science lookups from Firestore; the illustrative mock provider is not Freeplay's live provider.
- `lib/engine/`: the Orbit view's launch-window planner. `trajectory.ts` (patched-conic style Earth arc aimed at the Moon's position at arrival, direct and low-energy), `deltav.ts` / `launch-costs.ts` (sourced constants), `rocket.ts` / `mission-estimate.ts` (rocket equation, cost range), `artemis-reference.ts` (static Horizons Artemis I path from `data/trajectory/`). Every constant needs a row in `docs/SOURCES.md` section 8 (`tests/trajectory-sources.test.ts` enforces it). Label all of it as approximation and estimate; state is `launchIso` etc. in `lib/freeplay-store.ts`, UI in `components/freeplay/trajectory-panel.tsx`.
- `lib/ephemeris/`, `lib/terrain/`, `lib/firestore/`: decode stored ephemeris and terrain data, compute local sky positions and test visibility against horizon masks.
- `integrations/terrain/moon-samples.ts` and `scenes/lunar/terrain.ts`: scaffold samples and procedural mesh used to render the scene; this is not a LOLA DEM surface.
- `data/`: site copy, nav and experiences (`site.ts`), data sources and glossary (`science.ts`), and `hero-scene.ts` for illustrative landing-page readouts.
- `lib/horizon.ts`: illustrative horizon model used by conceptual landing-page diagrams, not the live Freeplay science provider.
- `components/graphics/`: static SVG diagrams, including the lunar horizon illustration that renders first and acts as the fallback when WebGL is unavailable or the scene errors.

### Science data and provenance

- Freeplay calls `/api/v1/science/*`; public catalog and science reads use the Web SDK and Firestore public-read rules.
- The API uses stored JPL Horizons ephemerides (main series 2026–2030 plus historical chunks) for local Sun/Earth position and timeline calculations.
- Horizon source priority is site-specific LOLA mask, available LOLA polar grid cell, then smooth-sphere fallback. The fallback must stay labelled and its sunlight/visibility shares must be described as upper bounds.
- Keep display terrain and science terrain clearly distinct. Procedural geometry is for visual orientation; LOLA masks drive obstruction calculations only where coverage exists.
- Hero HUD values and landing-page horizon graphics are illustrative and must not be described as live telemetry.
- Surface composition (`/api/v1/science/composition`, `compositionGrid`) is the Lunar Prospector GRS 2° oxide map: regional averages over about 60 km, never site-scale values or ore grades.
- `/api/v1/science/rank` and `/science/composition` also accept Artemis candidate regions through their `representativePoint`, labelled `approximate-region`; every other science endpoint still rejects unverified sites with 422.

## Conventions

- **Colour uses a retro lunar palette**: purple for interface accents, electric blue for Earth and communications, and coral red for sunlight and active controls. Keep regolith greys on the near-black void. Use semantic tokens (`bg-void`, `text-bone`, `text-retro-purple`, `text-retro-blue`, `text-retro-red`, `border-line`). Typography helpers: `.type-display`, `.type-heading`, `.type-data`.
- **Performance and accessibility behaviours to preserve**: static scenes render shadows once; Freeplay refreshes shadows only when Sun position changes. Rendering pauses when a scene is out of view (`hooks/use-in-view.ts`); low-end and small devices get a lighter mesh and lower DPR cap. `prefers-reduced-motion` (`hooks/use-reduced-motion.ts`) freezes cinematic movement, skips Freeplay travel transitions and autoplay, disables reveals and the hero entrance, and switches static scenes to on-demand rendering. Keep the skip link, visible focus rings, keyboard-operable lunar map and accessible mobile menu.
