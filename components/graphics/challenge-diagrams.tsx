/**
 * Small schematic cross-sections for the Challenge section.
 * Not to scale; angles are exaggerated so the geometry is legible.
 */

const frame = "h-auto w-full";
const label = { fontFamily: "var(--font-plex-mono)", fontSize: 11, fill: "#a3a29c" } as const;

/** Grazing sunlight: a ridge casts a long shadow into a crater. */
export function LightingDiagram() {
  return (
    <svg viewBox="0 0 320 170" className={frame} role="img" aria-label="Diagram: sunlight grazing a ridge leaves the crater beyond it in shadow">
      <defs>
        <linearGradient id="ld-ray" x1="0" x2="1">
          <stop offset="0" stopColor="#ff637d" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff637d" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Shadow wedge cast by the ridge */}
      <polygon points="118,92 300,118 300,150 150,150" fill="#000" fillOpacity="0.55" />
      {/* Rays */}
      {[0, 1, 2].map((i) => (
        <line key={i} x1="16" y1={72 + i * 9} x2="300" y2={108 + i * 9} stroke="url(#ld-ray)" strokeWidth="1.2" />
      ))}
      {/* Terrain: ridge then crater */}
      <path d="M0 150 L0 128 L40 122 L80 110 L118 92 L140 108 L168 140 L200 148 L240 146 L268 132 L300 118 L320 120 L320 170 L0 170 Z" fill="#26262a" stroke="#ece9e2" strokeOpacity="0.55" />
      {/* Lit face of the ridge */}
      <path d="M40 122 L80 110 L118 92 L118 92" stroke="#ff637d" strokeWidth="2" fill="none" />
      <circle cx="16" cy="72" r="7" fill="#ff637d" />
      <text x="28" y="58" {...label}>Sun +1.5°</text>
      <text x="196" y="138" {...label} fill="#8b8a85">shadow</text>
    </svg>
  );
}

/** Earth line of sight: blocked from the valley, clear from the ridge. */
export function CommsDiagram() {
  return (
    <svg viewBox="0 0 320 170" className={frame} role="img" aria-label="Diagram: a site behind a ridge has no line of sight to Earth, a site on the ridge does">
      <circle cx="292" cy="34" r="12" fill="#58c8ff" fillOpacity="0.18" />
      <circle cx="292" cy="34" r="7" fill="#58c8ff" />
      <text x="232" y="20" {...label}>Earth</text>
      {/* Clear line from ridge-top site */}
      <line x1="196" y1="78" x2="286" y2="38" stroke="#58c8ff" strokeWidth="1.6" />
      {/* Blocked line from valley site */}
      <line x1="70" y1="134" x2="182" y2="88" stroke="#58c8ff" strokeOpacity="0.4" strokeWidth="1.4" strokeDasharray="3 4" />
      <path d="M176 84 l10 10 M186 84 l-10 10" stroke="#e5674f" strokeWidth="1.6" />
      <path d="M0 150 L30 144 L70 138 L110 130 L150 104 L196 80 L226 100 L262 124 L320 132 L320 170 L0 170 Z" fill="#26262a" stroke="#ece9e2" strokeOpacity="0.55" />
      {/* Sites */}
      <rect x="64" y="128" width="12" height="8" fill="#ece9e2" />
      <rect x="190" y="70" width="12" height="8" fill="#ece9e2" />
      <text x="40" y="160" {...label}>blocked</text>
      <text x="148" y="70" {...label}>clear</text>
    </svg>
  );
}

/** Trade-off: candidate sites against two competing constraints. */
export function TradeoffDiagram() {
  const sites = [
    { x: 92, y: 52, id: "A" },
    { x: 214, y: 112, id: "B" },
    { x: 238, y: 46, id: "C" },
  ];
  return (
    <svg viewBox="0 0 320 170" className={frame} role="img" aria-label="Diagram: three candidate sites plotted by sunlight against Earth visibility; only one is strong on both">
      <rect x="200" y="18" width="104" height="58" fill="#ff637d" fillOpacity="0.06" stroke="#ff637d" strokeOpacity="0.4" strokeDasharray="3 3" />
      <line x1="40" y1="140" x2="304" y2="140" stroke="#8b8a85" />
      <line x1="40" y1="140" x2="40" y2="14" stroke="#8b8a85" />
      <text x="304" y="158" textAnchor="end" {...label}>sunlight →</text>
      <text x="0" y="0" transform="translate(28 140) rotate(-90)" {...label}>Earth visibility →</text>
      {sites.map((s) => (
        <g key={s.id}>
          <circle cx={s.x} cy={s.y} r="5.5" fill="none" stroke="#ece9e2" strokeWidth="1.5" />
          <text x={s.x + 10} y={s.y + 4} {...label} fill="#ece9e2">{s.id}</text>
        </g>
      ))}
    </svg>
  );
}
