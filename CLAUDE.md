# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shadowline: an interactive 3D mission-planning environment for the lunar south pole (NASA Space Apps Challenge 2026). Currently **Phase 1 (website foundation)**: the landing page, design system and routes exist; the simulator does not. All terrain is procedurally generated and all displayed values are illustrative. No LOLA or JPL Horizons data is integrated yet, so don't present numbers as real.

## Commands

```bash
npm run dev      # http://localhost:3000 (Turbopack)
npm run build    # production build; all routes prerender static
npm run start    # serve the production build
npm run lint     # ESLint (Next.js + React Compiler rules)
```

There is no test runner configured. Use `npm run lint` and `npm run build` (which type-checks) to verify changes.

## Stack notes

- Next.js 16 App Router with `cacheComponents` and `partialPrefetching` enabled in `next.config.ts`, React 19, React Compiler lint rules. Check `node_modules/next/dist/docs/` or current docs before relying on older Next.js behaviour.
- Tailwind v4 is wired through `@tailwindcss/turbopack` as a custom Turbopack CSS rule (not PostCSS). Design tokens live in `app/globals.css`.
- shadcn/ui (Radix) primitives in `components/ui/` (`components.json` configures the CLI). Imports use the `@/` alias.
- three.js + `@react-three/fiber` for the 3D scene.

## Architecture

- `app/`: routes `/`, `/mission`, `/explore`, `/compare`, `/science`. `mission`, `explore` and `compare` are intro pages today and will each host an interactive environment reusing `LunarScene`.
- `scenes/lunar/`: the reusable 3D scene. `lunar-scene.tsx` composes `terrain.ts` (height function and mesh builder), `celestial.tsx` (Sun, Earth, stars), `camera-rig.tsx` and `landing-site.tsx`. `lunar-scene-loader.tsx` loads it client-side via `next/dynamic`.
- `data/`: site copy, nav and experiences (`site.ts`), data sources and glossary (`science.ts`), and `hero-scene.ts`, whose Sun/Earth angles are shared by the 3D scene **and** the HUD/SVG graphics so they stay consistent.
- `lib/horizon.ts`: `HorizonModel` (`mask`, `sunPath`, `earth`) is the shape the `HorizonProfile` SVG chart renders. `createIllustrativeHorizon()` is the placeholder for computed masks.
- `components/graphics/`: static SVG diagrams, including the lunar horizon illustration that renders first and acts as the fallback when WebGL is unavailable or the scene errors.

### Planned seams for the simulator

- Replace `heightAt(x, z)` in `scenes/lunar/terrain.ts` with a LOLA DEM sampler. The mesh builder and scene stay unchanged.
- Replace `createIllustrativeHorizon()` with computed horizon masks and Horizons ephemerides.

## Conventions

- **Colour is semantic**: amber (`--sun`) always means sunlight, blue (`--earth`) always means Earth or communications. Everything else is the regolith greyscale on a near-black void. Use the token classes (`bg-void`, `text-bone`, `text-sun`, `text-earth`, `border-line`). Typography helpers: `.type-display`, `.type-heading`, `.type-data`.
- **Performance and accessibility behaviours to preserve**: shadows render once (static Sun and terrain); rendering pauses when the scene is out of view (`hooks/use-in-view.ts`); low-end and small devices get a lighter mesh and lower DPR cap; `prefers-reduced-motion` (`hooks/use-reduced-motion.ts`) freezes the camera, disables reveals and the hero entrance, and switches the canvas to on-demand rendering; keep the skip link, amber focus rings and accessible mobile menu.
