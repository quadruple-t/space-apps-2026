type Props = {
  latitudeDeg: number;
  longitudeDeg: number;
  sunAzimuthDeg?: number;
  sunElevationDeg?: number;
  earthAzimuthDeg?: number;
  earthElevationDeg?: number;
  caption?: string;
  className?: string;
};

export function MoonSunDiagram({
  latitudeDeg, longitudeDeg, sunAzimuthDeg = 32, sunElevationDeg = 12, earthAzimuthDeg, earthElevationDeg,
  caption = "Diagram uses the selected site's illustrative Sun angles and marks your target on the lunar disk.",
  className = "",
}: Props) {
  const azimuth = ((sunAzimuthDeg % 360) + 360) % 360;
  const azRad = (azimuth * Math.PI) / 180;
  const sx = 180 + Math.sin(azRad) * 112;
  const sy = 82 - Math.cos(azRad) * 46;
  const hasEarth = earthAzimuthDeg !== undefined && earthElevationDeg !== undefined;
  const earthAz = hasEarth ? ((earthAzimuthDeg % 360) + 360) % 360 : 0;
  const earthRad = (earthAz * Math.PI) / 180;
  const ex = 180 + Math.sin(earthRad) * 88;
  const ey = 82 - Math.cos(earthRad) * 36;
  const earthUp = hasEarth && earthElevationDeg > 0;
  const sunUp = sunElevationDeg > 0;
  const lonRad = (longitudeDeg * Math.PI) / 180;
  const latRad = (latitudeDeg * Math.PI) / 180;
  const px = 180 + Math.sin(lonRad) * Math.cos(latRad) * 29;
  const py = 82 - Math.sin(latRad) * 29;
  const limbDistance = Math.min(Math.abs(longitudeDeg - 90), Math.abs(longitudeDeg - 270), Math.abs(longitudeDeg - 450));
  const sideName = latitudeDeg < -60 ? "South polar side" : latitudeDeg > 60 ? "North polar side" : limbDistance < 55 ? "Lunar limb" : longitudeDeg > 90 && longitudeDeg < 270 ? "Far side" : "Near side";

  const earthLabel = hasEarth ? `, Earth at ${earthAz.toFixed(1)} degrees azimuth and ${earthElevationDeg.toFixed(1)} degrees elevation` : "";

  return <div className={`rounded-lg border border-retro-purple/30 bg-[#100e20]/90 p-3 sm:p-4 ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <div><div className="type-data text-[0.58rem] uppercase tracking-[0.16em] text-retro-purple">Approach geometry</div><div className="mt-1 text-xs text-bone">{hasEarth ? "Sun, Earth and selected lunar side" : "Sun and selected lunar side"}</div></div>
      <div className="type-data flex gap-3 text-right text-[0.56rem] text-bone">
        <div><span className="text-retro-red">● SUN</span><br/>AZ {azimuth.toFixed(1)}°<br/>EL {sunElevationDeg.toFixed(1)}°</div>
        {hasEarth && <div><span className="text-retro-blue">○ EARTH</span><br/>AZ {earthAz.toFixed(1)}°<br/>EL {earthElevationDeg.toFixed(1)}°</div>}
      </div>
    </div>
    <svg viewBox="0 0 360 160" role="img" aria-label={`Sun at ${azimuth.toFixed(1)} degrees azimuth and ${sunElevationDeg.toFixed(1)} degrees elevation${earthLabel}, relative to selected ${sideName}`} className="mt-2 block w-full">
      <defs>
        <radialGradient id="sunGlow"><stop stopColor="#ff829a" stopOpacity=".8"/><stop offset="1" stopColor="#ff5364" stopOpacity="0"/></radialGradient>
        <linearGradient id="moonLit" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#d2c8ff"/><stop offset="1" stopColor="#8878bd"/></linearGradient>
        <clipPath id="moonClip"><circle cx="180" cy="82" r="39"/></clipPath>
        <marker id="sunArrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#ff5364"/></marker>
      </defs>
      <ellipse cx="180" cy="82" rx="158" ry="62" fill="none" stroke="#a986ff" strokeOpacity=".2" strokeDasharray="3 5"/>
      <path d={`M${sx.toFixed(1)} ${sy.toFixed(1)}L${(180 + Math.sin(azRad) * 47).toFixed(1)} ${(82 - Math.cos(azRad) * 22).toFixed(1)}`} stroke="#ff5364" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#sunArrow)"/>
      {hasEarth && <g opacity={earthUp ? 1 : 0.4}>
        <path d={`M${ex.toFixed(1)} ${ey.toFixed(1)}L${(180 + Math.sin(earthRad) * 45).toFixed(1)} ${(82 - Math.cos(earthRad) * 21).toFixed(1)}`} stroke="#4b9bff" strokeWidth="1.5" strokeDasharray={earthUp ? "4 4" : "1 4"}/>
        <circle cx={ex} cy={ey} r="7" fill="#080712" stroke="#4b9bff" strokeWidth="2"/>
        <circle cx={ex} cy={ey} r="2.5" fill="#4b9bff"/>
      </g>}
      <g opacity={sunUp ? 1 : 0.45}>
        <circle cx={sx} cy={sy} r="23" fill="url(#sunGlow)"/>
        <circle cx={sx} cy={sy} r="8" fill="#ff5364" stroke="#ffdce5" strokeWidth="1.3"/>
      </g>
      <circle cx="180" cy="82" r="39" fill="#28243f" stroke="#d3cced" strokeOpacity=".7" strokeWidth="1.5"/>
      <g clipPath="url(#moonClip)">
        <g transform={`rotate(${azimuth + 90} 180 82)`}>
          <rect x="141" y="43" width="39" height="78" fill="url(#moonLit)"/>
          <circle cx="163" cy="69" r="7" fill="#554d75" fillOpacity=".5"/><circle cx="170" cy="96" r="10" fill="#554d75" fillOpacity=".42"/><circle cx="151" cy="91" r="5" fill="#554d75" fillOpacity=".4"/>
          <path d="M180 43C158 55 158 109 180 121" fill="#171427" fillOpacity=".78"/>
        </g>
        <circle cx={px} cy={py} r="4.5" fill="#ff5364" stroke="#fff2f5" strokeWidth="1.5"/>
      </g>
      <g fill="#b2abc4" fontFamily="monospace" fontSize="8" letterSpacing="1">
        <text x="180" y="17" textAnchor="middle">MOON</text><text x="180" y="148" textAnchor="middle">{sideName.toUpperCase()}</text>
        <text x={Math.max(12, Math.min(318, sx - 10))} y={Math.max(14, Math.min(151, sy - 15))} textAnchor="middle">{sunUp ? "SUN" : "SUN (SET)"}</text>
        {hasEarth && <text x={Math.max(14, Math.min(330, ex))} y={Math.max(14, Math.min(151, ey + (ey > 82 ? 17 : -12)))} textAnchor="middle">{earthUp ? "EARTH" : "EARTH (SET)"}</text>}
      </g>
    </svg>
    <p className="mt-1 text-[0.6rem] leading-relaxed text-muted-foreground">{caption}</p>
  </div>;
}
