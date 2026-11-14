import type { Experience } from "@/data/site";

const stroke = { stroke: "#ece9e2", strokeOpacity: 0.55, fill: "none", strokeWidth: 1.25 } as const;

/** Guided: a route of waypoints along the horizon. */
function GuidedGlyph() {
  const pts = [
    [20, 92],
    [72, 70],
    [128, 82],
    [184, 54],
    [240, 66],
  ];
  return (
    <svg viewBox="0 0 260 120" className="h-auto w-full" aria-hidden>
      <path d="M0 104 L40 96 L70 88 L104 98 L150 78 L186 70 L220 84 L260 76" {...stroke} />
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#ff637d" strokeDasharray="3 4" strokeWidth="1.25" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i === 0 ? 5 : 3.5} fill={i === 0 ? "#ff637d" : "#050506"} stroke="#ff637d" strokeWidth="1.25" />
        </g>
      ))}
    </svg>
  );
}

/** Free exploration: a reticle over contour lines. */
function FreeGlyph() {
  return (
    <svg viewBox="0 0 260 120" className="h-auto w-full" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx="140" cy="62" rx={30 + i * 26} ry={14 + i * 12} {...stroke} strokeOpacity={0.45 - i * 0.08} transform="rotate(-8 140 62)" />
      ))}
      <g stroke="#ece9e2" strokeWidth="1.25">
        <circle cx="96" cy="70" r="12" fill="none" />
        <line x1="96" y1="48" x2="96" y2="62" />
        <line x1="96" y1="78" x2="96" y2="92" />
        <line x1="74" y1="70" x2="88" y2="70" />
        <line x1="104" y1="70" x2="118" y2="70" />
      </g>
      <circle cx="96" cy="70" r="2" fill="#ece9e2" />
    </svg>
  );
}

/** Comparison: two horizon profiles, synchronised. */
function CompareGlyph() {
  return (
    <svg viewBox="0 0 260 120" className="h-auto w-full" aria-hidden>
      <path d="M0 52 L36 44 L70 50 L108 30 L150 40 L190 26 L226 38 L260 32" {...stroke} />
      <path d="M0 100 L40 92 L80 98 L118 82 L150 90 L196 72 L230 86 L260 80" {...stroke} />
      <line x1="150" y1="14" x2="150" y2="112" stroke="#7fa6cf" strokeWidth="1.25" />
      <circle cx="150" cy="40" r="3.5" fill="#7fa6cf" />
      <circle cx="150" cy="90" r="3.5" fill="#7fa6cf" />
      <text x="6" y="20" fontFamily="var(--font-plex-mono)" fontSize="10" fill="#a3a29c">A</text>
      <text x="6" y="72" fontFamily="var(--font-plex-mono)" fontSize="10" fill="#a3a29c">B</text>
    </svg>
  );
}

export function ExperienceGlyph({ id }: { id: Experience["id"] }) {
  if (id === "mission") return <GuidedGlyph />;
  if (id === "explore") return <FreeGlyph />;
  return <CompareGlyph />;
}
