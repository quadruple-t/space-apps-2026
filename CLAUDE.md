# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lunaris360: a 3D lunar mission-planning website with an immersive Freeplay simulator (NASA Space Apps Challenge 2026). Terrain and displayed science values are illustrative. No LOLA or JPL Horizons data is integrated, so do not present values as measured or operational.

## Commands

```bash
npm run dev      # http://localhost:3000 (Tailwind v4 via PostCSS)
npm run build    # production build; all routes prerender static
npm run start    # serve the production build
npm run lint     # ESLint (Next.js + React Compiler rules)
```

There is no test runner configured. Use `npm run lint` and `npm run build` (which type-checks) to verify changes.

## Stack notes

- Next.js 16 App Router with `cacheComponents` and `partialPrefetching` enabled in `next.config.ts`, React 19, React Compiler lint rules. Check `node_modules/next/dist/docs/` or current docs before relying on older Next.js behaviour.
- Tailwind v4 is wired through `@tailwindcss/postcss`. The PostCSS entry is `postcss.config.mjs`; design tokens live in `app/globals.css`.
- shadcn/ui (Radix) primitives in `components/ui/` (`components.json` configures the CLI). Imports use the `@/` alias.
- three.js + `@react-three/fiber` for the 3D scene.

## Architecture

- `app/`: routes `/`, `/mission`, `/explore`, `/compare`, `/science`. `explore` hosts the interactive Freeplay experience; `mission` and `compare` provide the surrounding mission flows.
- `scenes/lunar/`: the reusable 3D scene. `lunar-scene.tsx` composes `terrain.ts` (height function and mesh builder), `celestial.tsx` (Sun, Earth, stars), `camera-rig.tsx` and `landing-site.tsx`. `lunar-scene-loader.tsx` loads it client-side via `next/dynamic`.
- `data/`: site copy, nav and experiences (`site.ts`), data sources and glossary (`science.ts`), and `hero-scene.ts`, whose Sun/Earth angles are shared by the 3D scene **and** the HUD/SVG graphics so they stay consistent.
- `lib/horizon.ts`: `HorizonModel` (`mask`, `sunPath`, `earth`) is the shape the `HorizonProfile` SVG chart renders. `createIllustrativeHorizon()` is the placeholder for computed masks.
- `components/graphics/`: static SVG diagrams, including the lunar horizon illustration that renders first and acts as the fallback when WebGL is unavailable or the scene errors.

### Planned seams for the simulator

- Replace `heightAt(x, z)` in `scenes/lunar/terrain.ts` with a LOLA DEM sampler. The mesh builder and scene stay unchanged.
- Replace `createIllustrativeHorizon()` with computed horizon masks and Horizons ephemerides.

## Conventions

- **Colour uses a retro lunar palette**: purple for interface accents, electric blue for Earth and communications, and coral red for sunlight and active controls. Keep regolith greys on the near-black void. Use semantic tokens (`bg-void`, `text-bone`, `text-retro-purple`, `text-retro-blue`, `text-retro-red`, `border-line`). Typography helpers: `.type-display`, `.type-heading`, `.type-data`.
- **Performance and accessibility behaviours to preserve**: static scenes render shadows once; Freeplay refreshes shadows only when Sun position changes. Rendering pauses when a scene is out of view (`hooks/use-in-view.ts`); low-end and small devices get a lighter mesh and lower DPR cap. `prefers-reduced-motion` (`hooks/use-reduced-motion.ts`) freezes cinematic movement, skips Freeplay travel transitions and autoplay, disables reveals and the hero entrance, and switches static scenes to on-demand rendering. Keep the skip link, visible focus rings, keyboard-operable lunar map and accessible mobile menu.
