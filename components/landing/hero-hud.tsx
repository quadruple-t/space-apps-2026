import type { ReactNode } from "react";
import { HERO_SCENE } from "@/data/hero-scene";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "sun" | "earth";

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-bone/70",
  sun: "bg-sun shadow-[0_0_10px_var(--sun)]",
  earth: "bg-earth shadow-[0_0_10px_var(--earth)]",
};

/** Bracketed instrument readout. */
export function HudReadout({
  label,
  value,
  note,
  tone = "neutral",
  className,
  style,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: Tone;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("relative px-3.5 py-3", className)} style={style}>
      {/* Corner brackets */}
      <span aria-hidden className="absolute left-0 top-0 size-2.5 border-l border-t border-bone/40" />
      <span aria-hidden className="absolute right-0 top-0 size-2.5 border-r border-t border-bone/40" />
      <span aria-hidden className="absolute bottom-0 left-0 size-2.5 border-b border-l border-bone/40" />
      <span aria-hidden className="absolute bottom-0 right-0 size-2.5 border-b border-r border-bone/40" />
      <dt className="type-data flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-bone/70">
        <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[tone])} />
        {label}
      </dt>
      <dd className="type-data mt-1.5 text-[0.95rem] text-bone">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-bone/60">{note}</dd>}
    </div>
  );
}

const READOUTS: Array<{ label: string; value: string; note: string; tone: Tone; mobile: boolean }> = [
  {
    label: "Lunar south pole",
    value: HERO_SCENE.site.latitude,
    note: `${HERO_SCENE.site.longitude} · conceptual site`,
    tone: "neutral",
    mobile: false,
  },
  {
    label: "Sun elevation",
    value: `+${HERO_SCENE.sunElevationDeg.toFixed(1)}°`,
    note: "Grazing the horizon",
    tone: "sun",
    mobile: true,
  },
  {
    label: "Earth visibility",
    value: `+${HERO_SCENE.earthElevationDeg.toFixed(1)}°`,
    note: `${HERO_SCENE.earth.status}, in line of sight`,
    tone: "earth",
    mobile: true,
  },
  {
    label: "Mission environment",
    value: HERO_SCENE.environment.summary,
    note: HERO_SCENE.environment.detail,
    tone: "neutral",
    mobile: false,
  },
];

/** Floating mission overlays for the hero. Values are illustrative. */
export function HeroHud({ className }: { className?: string }) {
  return (
    <div className={className}>
      <dl aria-label="Conceptual preview readouts (illustrative values)" className="grid grid-cols-2 gap-2 sm:gap-3">
        {READOUTS.map(({ mobile, ...r }, i) => (
          <HudReadout
            key={r.label}
            {...r}
            className={cn("hud-enter bg-void/35 backdrop-blur-[3px]", !mobile && "hidden sm:block")}
            style={{ "--hud-delay": `${900 + i * 120}ms` } as React.CSSProperties}
          />
        ))}
      </dl>
    </div>
  );
}
