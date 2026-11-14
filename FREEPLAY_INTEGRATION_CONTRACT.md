# Freeplay integration contract

## Ownership and safe integration points

Freeplay owns `app/explore/freeplay.tsx`, the reusable lunar scene in `scenes/lunar/`, the display side of simulation state, and this adapter boundary. The landing page, navigation, mission tutorial, comparison experience, global design tokens, and authoritative science calculations are owned elsewhere. Teammates can link to `/explore` and import the provider types without changing the page UI.

The scene components (`LunarScene`, `Terrain`, `Sun`, `Earth`, and `CameraRig`) are presentation components. They accept angles and view settings as props and do not compute ephemerides or visibility. `Freeplay` is the single source of truth for the selected site, UTC timestamp, camera mode, playback, celestial state, and mission metrics.

## Provider interface

Implement `ScienceProvider` from `integrations/science/types.ts` and replace `mockScienceProvider` in `app/explore/freeplay.tsx`:

```ts
interface ScienceProvider {
  readonly provenance: "illustrative" | "scientific";
  getCelestialState(site: LunarSite, timestamp: string): Promise<CelestialState>;
  getHorizon(site: LunarSite): Promise<HorizonProfile | null>;
  getMissionMetrics(site: LunarSite, start: string, durationHours: number): Promise<MissionMetrics | null>;
}
```

`LunarSite` uses planetocentric latitude in degrees (−90…+90), east-positive longitude in degrees (0…<360), and an explicit coordinate reference. Normalize coordinates only in the provider if its source uses a different convention; preserve the original source frame in returned metadata or document the transformation. Timestamps are ISO 8601 UTC strings. All azimuth/elevation values are degrees. Azimuth is clockwise from lunar north; elevation is above the local horizontal.

`CelestialState` returns Sun and Earth azimuth/elevation and may include provider-computed visibility. `HorizonProfile.elevationsDeg` contains one horizon elevation per equal azimuth bin, starting at azimuth 0° (north) and increasing clockwise by `azimuthStepDeg`. `MissionMetrics` values must include their actual mission interval and calculation assumptions when the science provider is connected; add those fields to the type before displaying interval-specific claims.

## Terrain handoff

The current `scenes/lunar/terrain.ts` produces deterministic procedural geometry for development only. It is not LOLA data. The scene currently consumes local Three.js geometry and has no authoritative DEM loader or geographic bounds. The science/terrain owner should provide either:

- a height grid with rows/columns, elevation units, geographic bounds, coordinate frame, axis orientation, no-data marker, and angular or spatial sampling resolution; or
- a Three.js `BufferGeometry` with the same bounds/frame/provenance metadata.

Once supplied, add a `TerrainDataset` type and loader at this boundary. Confirm whether the dataset is planetocentric or planetographic, longitude direction/range, and north/south row order before mapping it into Three.js. Keep the current procedural mesh as a labeled fallback. For a horizon/occlusion discrepancy, retain science-provider visibility as authoritative and report the visual mismatch during development.

## Coordinate conversion

`data/hero-scene.ts:horizonDirection` is the sole current celestial direction conversion: azimuth/elevation degrees to local Three.js direction `(x, y, z) = (sin az · cos el, sin el, −cos az · cos el)`. Thus 0° azimuth points along −Z (north), 90° points +X (east), and positive elevation points +Y. Keep this conversion centralized when adding terrain-frame transforms. Do not pass radians to it.

## Current demo data and known gaps

`integrations/science/mock-provider.ts` is intentionally illustrative: its Sun/Earth movement is a simple clock-driven visual demo and the daily metrics are static placeholders. It does not model lunar ephemerides, topographic visibility, or LOLA elevations. The default demo coordinate (89.5° N, 222.7° E) was inherited from the existing concept scene and is explicitly unverified; it must not be treated as a reference site. No verified reference-site list is present.

`/explore` currently validates custom coordinates, controls the UTC clock and playback, moves the displayed bodies and directional sunlight, and supports first-person, orbit, and overhead views. The renderer currently uses procedural terrain while the map and HUD interpolate scaffold data at the selected coordinate. Both remain illustrative until a geographic DEM provider is connected. The `/explore` map supports coordinate selection and scaffold interpolation; no analytical horizon profile is connected yet. Data provenance must remain visible while the mock provider is in use.

## Integration steps

1. Add the real provider implementation behind `ScienceProvider`.
2. Supply verified sites and a documented terrain dataset/loader.
3. Replace demo values with provider calls; retain `DATA UNAVAILABLE` states on null/error responses.
4. Pass returned terrain, celestial positions, horizon, and mission metrics through Freeplay state to the scene/HUD.
5. Compare rendered terrain occlusion with provider visibility at controlled locations/times; do not modify provider calculations in the renderer.
