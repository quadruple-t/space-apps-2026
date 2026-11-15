"use client";

type Body = { azimuthDeg: number; elevationDeg: number } | null;

const MIN_EL = -15;
const R = 46;

/**
 * Local sky seen from the buggy: zenith at the centre, horizon on the dashed ring, terrain
 * horizon (from the loaded elevation grid) as the filled silhouette. North up, east right.
 */
export function SkyDial({ horizonDeg, stepDeg, sun, earth, sunVisible, earthVisible }: {
  horizonDeg: number[] | null; stepDeg: number; sun: Body; earth: Body; sunVisible: number | null; earthVisible: number | null;
}) {
  const radius = (el: number) => (R * (90 - Math.max(MIN_EL, Math.min(90, el)))) / (90 - MIN_EL);
  const point = (az: number, el: number) => {
    const a = (az * Math.PI) / 180, r = radius(el);
    return [50 + r * Math.sin(a), 50 - r * Math.cos(a)] as const;
  };
  const silhouette = horizonDeg?.length
    ? `M${horizonDeg.map((el, i) => point(i * stepDeg, Math.max(MIN_EL, el)).map((v) => v.toFixed(1)).join(" ")).join("L")}Z M50 ${50 - R}A${R} ${R} 0 1 0 50 ${50 + R}A${R} ${R} 0 1 0 50 ${50 - R}Z`
    : null;
  const body = (b: Body, color: string, size: number, visible: number | null, label: string) => {
    if (!b) return null;
    const [x, y] = point(b.azimuthDeg, b.elevationDeg);
    const hidden = (visible ?? 1) <= 0 || b.elevationDeg < MIN_EL;
    return <g opacity={hidden ? 0.45 : 1}>
      <circle cx={x} cy={y} r={size} fill={hidden ? "none" : color} stroke={color} strokeWidth="1.2" />
      <title>{label}: azimuth {b.azimuthDeg.toFixed(0)}°, elevation {b.elevationDeg.toFixed(1)}°{hidden ? " (hidden)" : ""}</title>
    </g>;
  };
  const sunText = sun ? `Sun ${sun.elevationDeg.toFixed(1)}° elevation, ${sunVisible === null ? "" : sunVisible > 0.99 ? "in view" : sunVisible > 0 ? "partly behind terrain" : "below the terrain horizon"}` : "Sun position unavailable";
  const earthText = earth ? `Earth ${earth.elevationDeg.toFixed(1)}° elevation, ${earthVisible === null ? "" : earthVisible > 0 ? "in view" : "hidden"}` : "";
  return <svg viewBox="0 0 100 100" role="img" aria-label={`Sky from the buggy. ${sunText}. ${earthText}.`} className="size-full">
    <circle cx="50" cy="50" r={R} fill="#0d0b1c" stroke="#2c2846" />
    <circle cx="50" cy="50" r={radius(0)} fill="none" stroke="#6f6a8c" strokeDasharray="2 2" strokeWidth=".6" />
    <circle cx="50" cy="50" r={radius(45)} fill="none" stroke="#2c2846" strokeWidth=".5" />
    {silhouette && <path d={silhouette} fill="#4a4658" fillRule="evenodd" opacity=".9" />}
    {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(([t, az]) => <text key={t} x={50 + (R - 4) * Math.sin((az * Math.PI) / 180)} y={52.5 - (R - 4) * Math.cos((az * Math.PI) / 180)} textAnchor="middle" fontSize="7" fill="#d8d3e6" className="type-data">{t}</text>)}
    {body(earth, "#4b9bff", 3.2, earthVisible, "Earth")}
    {body(sun, "#ff5364", 3.8, sunVisible, "Sun")}
  </svg>;
}
