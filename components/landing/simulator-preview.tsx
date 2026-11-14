import { HorizonProfile } from "@/components/graphics/horizon-profile";
import { HudReadout } from "@/components/landing/hero-hud";
import { createIllustrativeHorizon, maskElevationAt, sunlitRanges } from "@/lib/horizon";
import { LunarSceneLoader } from "@/scenes/lunar/lunar-scene-loader";

const MODEL = createIllustrativeHorizon();
const SUNLIT_PCT = Math.round(
  (sunlitRanges(MODEL).reduce((sum, [a, b]) => sum + (b - a), 0) / 360) * 100,
);
const EARTH_MARGIN = MODEL.earth.elevation - maskElevationAt(MODEL.mask, MODEL.earth.azimuth);

/**
 * Concept frame for the planned simulator: the 3D scene with a landing-site
 * marker, sight lines and readouts computed on the illustrative horizon.
 */
export function SimulatorPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-void shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
      {/* Window chrome */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-charcoal/70 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2 rounded-full bg-bone/20" />
            <span className="size-2 rounded-full bg-bone/20" />
            <span className="size-2 rounded-full bg-bone/20" />
          </span>
          <span className="type-data text-xs text-bone/70">shadowline / explore / site-a</span>
        </div>
        <span className="type-data rounded-sm border border-sun/40 px-2 py-0.5 text-[0.68rem] text-sun">
          Concept interface
        </span>
      </div>

      <div className="relative aspect-[4/5] sm:aspect-[16/10] lg:aspect-[16/9]">
        <LunarSceneLoader
          variant="preview"
          fallbackLabel="Illustration of the planned simulator view across lunar terrain"
        />

        <dl
          aria-label="Example readouts on an illustrative horizon profile"
          className="absolute left-3 top-3 grid w-[min(15rem,calc(100%-1.5rem))] gap-2 sm:left-5 sm:top-5"
        >
          <HudReadout label="Candidate site" value="Site A · rim crest" note="Placed by the user" className="bg-void/60 backdrop-blur-sm" />
          <HudReadout label="Sun above terrain" value={`${SUNLIT_PCT}% of path`} note="Over one solar circuit" tone="sun" className="hidden bg-void/60 backdrop-blur-sm sm:block" />
          <HudReadout label="Earth line of sight" value={`Clear · +${EARTH_MARGIN.toFixed(1)}° margin`} note="Above the terrain mask" tone="earth" className="hidden bg-void/60 backdrop-blur-sm sm:block" />
        </dl>

        <div className="absolute inset-x-3 bottom-3 rounded-md border border-line bg-void/75 p-3 backdrop-blur-sm sm:inset-x-5 sm:bottom-5 sm:p-4 lg:left-auto lg:w-[30rem]">
          <div className="mb-2 flex items-center justify-between">
            <span className="type-data text-[0.68rem] uppercase tracking-[0.14em] text-bone/70">Horizon profile</span>
            <span className="type-data text-[0.68rem] text-bone/45">Illustrative</span>
          </div>
          <HorizonProfile model={MODEL} height={150} title="Example horizon profile for Site A" />
        </div>
      </div>
      <figcaption className="border-t border-line px-4 py-3 text-xs text-muted-foreground">
        Concept of the planned simulator. Terrain is procedural and every readout is computed on an illustrative
        horizon profile, not real lunar data.
      </figcaption>
    </figure>
  );
}
