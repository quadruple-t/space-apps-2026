import { useId } from "react";
import { periodicNoise1D, seededRandom } from "@/lib/noise";
import { cn } from "@/lib/utils";

/**
 * Static, server-rendered lunar horizon. Used as the WebGL fallback, as the
 * loading state behind the 3D canvas, and as the final CTA backdrop.
 * Anchored to the bottom edge so the skyline stays in the lower third.
 */

const W = 1600;
const H = 900;

function ridgePoints(seed: number, base: number, amp: number, step: number, period: number) {
  const pts: Array<[number, number]> = [];
  for (let x = 0; x <= W; x += step) {
    const t = x / W;
    const y =
      base -
      amp * (periodicNoise1D(t, period, seed) * 0.65 + periodicNoise1D(t, period * 4, seed + 1) * 0.35);
    pts.push([x, +y.toFixed(1)]);
  }
  return pts;
}

const toPolygon = (pts: Array<[number, number]>) =>
  `0,${H} ${pts.map((p) => p.join(",")).join(" ")} ${W},${H}`;
const toLine = (pts: Array<[number, number]>) => pts.map((p) => p.join(",")).join(" ");

const STARS = (() => {
  const rand = seededRandom(9);
  return Array.from({ length: 120 }, () => ({
    x: rand() * W,
    y: rand() * H * 0.6,
    r: 0.5 + rand() * 1.1,
    o: 0.2 + rand() * 0.55,
  }));
})();

const FAR = ridgePoints(3, 660, 120, 26, 6);
const MID = ridgePoints(8, 735, 80, 22, 9);
const NEAR = ridgePoints(14, 830, 60, 18, 5);

const SUN = { x: 470, y: 600 };
const EARTH = { x: 1130, y: 420, r: 22 };

export function LunarHorizonIllustration({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const { x, y, r } = EARTH;
  // Crescent lit from the Sun's side (left): outer limb + elliptical terminator.
  const crescent = `M${x},${y - r} A${r},${r} 0 0 0 ${x},${y + r} A${r * 0.55},${r} 0 0 1 ${x},${y - r} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      className={cn("h-full w-full", className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-sun`} cx={SUN.x / W} cy={SUN.y / H} r="0.5">
          <stop offset="0" stopColor="#ffe3b0" stopOpacity="0.95" />
          <stop offset="0.04" stopColor="#ff637d" stopOpacity="0.5" />
          <stop offset="0.3" stopColor="#ff637d" stopOpacity="0.07" />
          <stop offset="1" stopColor="#ff637d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-streak`}>
          <stop offset="0" stopColor="#ffd89a" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff637d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-far`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#2a2926" />
          <stop offset={SUN.x / W} stopColor="#433f38" />
          <stop offset="1" stopColor="#171718" />
        </linearGradient>
        <linearGradient id={`${id}-mid`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#181816" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
        <linearGradient id={`${id}-near`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0c0c0c" />
          <stop offset="1" stopColor="#050506" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" x2="1">
          <stop offset="0" stopColor="#ff637d" stopOpacity="0.15" />
          <stop offset={SUN.x / W} stopColor="#ff637d" stopOpacity="0.8" />
          <stop offset="0.75" stopColor="#ff637d" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="#050506" />
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ece9e2" opacity={s.o} />
      ))}

      <circle cx={x} cy={y} r={r} fill="#0b1520" />
      <path d={crescent} fill="#7fa6cf" />
      <circle cx={x} cy={y} r={r + 1.5} fill="none" stroke="#7fa6cf" strokeOpacity="0.25" />

      <rect width={W} height={H} fill={`url(#${id}-sun)`} />
      <ellipse cx={SUN.x} cy={SUN.y} rx="300" ry="2.5" fill={`url(#${id}-streak)`} />
      <circle cx={SUN.x} cy={SUN.y} r="8" fill="#fff6e4" />

      <polygon points={toPolygon(FAR)} fill={`url(#${id}-far)`} />
      <polyline points={toLine(FAR)} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.5" strokeLinejoin="bevel" />
      <polygon points={toPolygon(MID)} fill={`url(#${id}-mid)`} />
      <polygon points={toPolygon(NEAR)} fill={`url(#${id}-near)`} />
    </svg>
  );
}
