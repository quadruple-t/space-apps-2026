type Props = { latitudeDeg: number; longitudeDeg: number; sunAzimuthDeg?: number; sunElevationDeg?: number };

export function MoonSunDiagram({ latitudeDeg, longitudeDeg, sunAzimuthDeg = 32, sunElevationDeg = 12 }: Props) {
  const azimuth = ((sunAzimuthDeg % 360) + 360) % 360;
  const azRad = (azimuth * Math.PI) / 180;
  const sx = 180 + Math.sin(azRad) * 112;
  const sy = 82 - Math.cos(azRad) * 46;
  const lonRad = (longitudeDeg * Math.PI) / 180;
  const latRad = (latitudeDeg * Math.PI) / 180;
  const px = 180 + Math.sin(lonRad) * Math.cos(latRad) * 29;
  const py = 82 - Math.sin(latRad) * 29;
  const limbDistance = Math.min(Math.abs(longitudeDeg - 90), Math.abs(longitudeDeg - 270), Math.abs(longitudeDeg - 450));
  const sideName = latitudeDeg < -60 ? "South polar side" : latitudeDeg > 60 ? "North polar side" : limbDistance < 55 ? "Lunar limb" : longitudeDeg > 90 && longitudeDeg < 270 ? "Far side" : "Near side";

  return <div className="rounded-lg border border-retro-purple/30 bg-[#100e20]/90 p-3 sm:p-4">
    <div className="flex items-start justify-between gap-3">
      <div><div className="type-data text-[0.58rem] uppercase tracking-[0.16em] text-retro-purple">Approach geometry</div><div className="mt-1 text-xs text-bone">Sun and selected lunar side</div></div>
      <div className="type-data text-right text-[0.56rem] text-retro-red">AZ {azimuth.toFixed(1)}°<br/>EL {sunElevationDeg.toFixed(1)}°</div>
    </div>
    <svg viewBox="0 0 360 160" role="img" aria-label={`Sun at ${azimuth.toFixed(1)} degrees azimuth and ${sunElevationDeg.toFixed(1)} degrees elevation relative to selected ${sideName}`} className="mt-2 block w-full">
      <defs>
        <radialGradient id="sunGlow"><stop stopColor="#ff829a" stopOpacity=".8"/><stop offset="1" stopColor="#ff637d" stopOpacity="0"/></radialGradient>
        <linearGradient id="moonLit" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#d2c8ff"/><stop offset="1" stopColor="#8878bd"/></linearGradient>
        <clipPath id="moonClip"><circle cx="180" cy="82" r="39"/></clipPath>
        <marker id="sunArrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#ff637d"/></marker>
      </defs>
      <ellipse cx="180" cy="82" rx="158" ry="62" fill="none" stroke="#a986ff" strokeOpacity=".2" strokeDasharray="3 5"/>
      <path d={`M${sx.toFixed(1)} ${sy.toFixed(1)}L${(180 + Math.sin(azRad) * 47).toFixed(1)} ${(82 - Math.cos(azRad) * 22).toFixed(1)}`} stroke="#ff637d" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#sunArrow)"/>
      <circle cx={sx} cy={sy} r="23" fill="url(#sunGlow)"/>
      <circle cx={sx} cy={sy} r="8" fill="#ff637d" stroke="#ffdce5" strokeWidth="1.3"/>
      <circle cx="180" cy="82" r="39" fill="#28243f" stroke="#d3cced" strokeOpacity=".7" strokeWidth="1.5"/>
      <g clipPath="url(#moonClip)">
        <g transform={`rotate(${azimuth + 90} 180 82)`}>
          <rect x="141" y="43" width="39" height="78" fill="url(#moonLit)"/>
          <circle cx="163" cy="69" r="7" fill="#554d75" fillOpacity=".5"/><circle cx="170" cy="96" r="10" fill="#554d75" fillOpacity=".42"/><circle cx="151" cy="91" r="5" fill="#554d75" fillOpacity=".4"/>
          <path d="M180 43C158 55 158 109 180 121" fill="#171427" fillOpacity=".78"/>
        </g>
        <circle cx={px} cy={py} r="4.5" fill="#ff637d" stroke="#fff2f5" strokeWidth="1.5"/>
      </g>
      <g fill="#b2abc4" fontFamily="monospace" fontSize="8" letterSpacing="1">
        <text x="180" y="17" textAnchor="middle">MOON</text><text x="180" y="148" textAnchor="middle">{sideName.toUpperCase()}</text>
        <text x={Math.max(12, Math.min(318, sx - 10))} y={Math.max(14, Math.min(151, sy - 15))} textAnchor="middle">SUN</text>
      </g>
    </svg>
    <p className="mt-1 text-[0.6rem] leading-relaxed text-muted-foreground">Diagram uses the selected site&apos;s illustrative Sun angles and marks your target on the lunar disk.</p>
  </div>;
}
