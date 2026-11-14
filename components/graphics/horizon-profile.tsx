import { useId } from "react";
import { createIllustrativeHorizon, type HorizonModel } from "@/lib/horizon";
import { cn } from "@/lib/utils";

const W = 800;
const PAD = { top: 18, right: 16, bottom: 30, left: 40 };

/**
 * Horizon-mask chart: azimuth (x) vs elevation angle (y). Terrain mask in
 * grey, the Sun's path in amber (solid where it clears the terrain, faint
 * where it is blocked) and the Earth in blue.
 */
export function HorizonProfile({
  model = createIllustrativeHorizon(),
  height = 240,
  showAxes = true,
  showLegend = false,
  className,
  title = "Illustrative horizon mask",
}: {
  model?: HorizonModel;
  height?: number;
  showAxes?: boolean;
  showLegend?: boolean;
  className?: string;
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  const H = height;
  const yMax = Math.ceil(model.maxElevation + 1);
  const x = (az: number) => PAD.left + (az / 360) * (W - PAD.left - PAD.right);
  const y = (el: number) => H - PAD.bottom - (el / yMax) * (H - PAD.top - PAD.bottom);
  const baseY = y(0);

  const maskLine = model.mask.map((s) => `${x(s.azimuth).toFixed(1)},${y(s.elevation).toFixed(1)}`).join(" ");
  const maskArea = `${x(0)},${baseY} ${maskLine} ${x(360)},${baseY}`;
  const skyArea = `${x(0)},${PAD.top - 20} ${maskLine} ${x(360)},${PAD.top - 20}`;
  const sunLine = model.sunPath.map((s) => `${x(s.azimuth).toFixed(1)},${y(s.elevation).toFixed(1)}`).join(" ");

  return (
    <figure className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>
          Terrain elevation angle around a site plotted against azimuth. The Sun&apos;s path is lit where it rises
          above the terrain and blocked where the terrain is higher. Earth sits near {model.earth.azimuth}° azimuth.
          Values are illustrative.
        </desc>
        <defs>
          <clipPath id={`${id}-sky`}>
            <polygon points={skyArea} />
          </clipPath>
          <clipPath id={`${id}-ground`}>
            <polygon points={maskArea} />
          </clipPath>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3a3935" />
            <stop offset="1" stopColor="#151516" />
          </linearGradient>
        </defs>

        {showAxes && (
          <g className="type-data" fontSize="11" fill="#8b8a85">
            {[0, 90, 180, 270, 360].map((az) => (
              <g key={az}>
                <line x1={x(az)} x2={x(az)} y1={PAD.top} y2={baseY} stroke="#2a2b2c" strokeDasharray="2 4" />
                <text x={x(az)} y={H - 10} textAnchor="middle">
                  {az}°
                </text>
              </g>
            ))}
            {Array.from({ length: Math.floor(yMax / 2) + 1 }, (_, i) => i * 2).map((el) => (
              <text key={el} x={PAD.left - 8} y={y(el) + 4} textAnchor="end">
                {el}°
              </text>
            ))}
          </g>
        )}

        <polygon points={maskArea} fill={`url(#${id}-fill)`} />
        <polyline points={maskLine} fill="none" stroke="#ece9e2" strokeOpacity="0.7" strokeWidth="1.25" strokeLinejoin="round" />

        {/* Sun path: faint where blocked, bright where it clears terrain. */}
        <polyline points={sunLine} fill="none" stroke="#ff5364" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" clipPath={`url(#${id}-ground)`} />
        <polyline points={sunLine} fill="none" stroke="#ff5364" strokeWidth="2.25" clipPath={`url(#${id}-sky)`} />

        <g transform={`translate(${x(model.earth.azimuth)} ${y(model.earth.elevation)})`}>
          <circle r="11" fill="#4b9bff" fillOpacity="0.12" />
          <circle r="5" fill="#4b9bff" />
        </g>

        <line x1={PAD.left} x2={W - PAD.right} y1={baseY} y2={baseY} stroke="#8b8a85" strokeOpacity="0.5" />
      </svg>

      {showLegend && (
        <figcaption className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-4 rounded-[2px] bg-[#3a3935] ring-1 ring-bone/50" /> Terrain mask
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-5 bg-sun" /> Sun path, unobstructed
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-5 border-t-2 border-dashed border-sun/40" /> Sun path, blocked by terrain
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-earth" /> Earth
          </span>
          <span className="type-data text-bone/50">Illustrative values</span>
        </figcaption>
      )}
    </figure>
  );
}
