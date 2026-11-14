"use client";

import { useEffect, useRef, useState } from "react";
import { Orbit, Save, X } from "lucide-react";
import { subscribeAnchor } from "@/scenes/cesium/anchor";
import { useFreeplay } from "@/lib/freeplay-store";

const BOX_W = 248;
const GAP = 44;

const fmtLat = (v: number) => `${Math.abs(v).toFixed(4)}°${v < 0 ? "S" : "N"}`;

/** Callout box tied to the selected site by a leader line. Repositions every rendered globe frame. */
export function SiteCallout() {
  const site = useFreeplay((s) => s.site);
  const open = useFreeplay((s) => s.calloutOpen);
  const { setRadius, setCalloutOpen, saveCurrentSite, setView } = useFreeplay.getState();
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const [radiusText, setRadiusText] = useState(String(site.radiusKm));
  const [syncedRadius, setSyncedRadius] = useState(site.radiusKm);
  if (syncedRadius !== site.radiusKm) { setSyncedRadius(site.radiusKm); setRadiusText(String(site.radiusKm)); }

  useEffect(() => {
    if (!open) return;
    return subscribeAnchor((a) => {
      const w = wrap.current, b = box.current, l = line.current, d = dot.current;
      if (!w || !b || !l || !d) return;
      if (!a || !a.visible) { w.style.visibility = "hidden"; return; }
      w.style.visibility = "visible";
      const W = w.clientWidth, H = w.clientHeight, h = b.offsetHeight;
      const right = a.x + GAP + BOX_W < W - 8;
      const above = a.y - GAP - h > 8;
      const bx = right ? a.x + GAP : Math.max(8, a.x - GAP - BOX_W);
      const by = Math.min(H - h - 8, above ? a.y - GAP - h : a.y + GAP);
      b.style.transform = `translate(${bx}px, ${by}px)`;
      l.setAttribute("x1", String(a.x)); l.setAttribute("y1", String(a.y));
      l.setAttribute("x2", String(right ? bx : bx + BOX_W)); l.setAttribute("y2", String(above ? by + h : by));
      d.setAttribute("cx", String(a.x)); d.setAttribute("cy", String(a.y));
    });
  }, [open]);

  if (!open) return null;

  const commitRadius = () => {
    const km = Number(radiusText);
    if (Number.isFinite(km) && km > 0) setRadius(km);
    else setRadiusText(String(site.radiusKm));
  };

  return <div ref={wrap} className="pointer-events-none absolute inset-0 z-20" style={{ visibility: "hidden" }}>
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <line ref={line} stroke="#f0ebf7" strokeOpacity="0.8" strokeWidth="1.5" />
      <circle ref={dot} r="4" fill="none" stroke="#f0ebf7" strokeWidth="1.5" />
    </svg>
    <div ref={box} role="dialog" aria-label={`${site.name} details`} className="hud-panel pointer-events-auto absolute left-0 top-0 p-3" style={{ width: BOX_W }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="type-data text-[0.54rem] uppercase tracking-[0.14em] text-retro-purple">{site.kind === "custom" ? "Custom site" : site.kind === "saved" ? "Saved site" : site.program}</div>
          <h2 className="type-heading mt-0.5 truncate text-sm text-bone">{site.name}</h2>
          <div className="type-data mt-0.5 text-[0.62rem] tabular-nums text-muted-foreground">{fmtLat(site.latitudeDeg)} · {site.longitudeDeg.toFixed(4)}°E</div>
          {site.kind === "preset" && !site.verified && <div className="mt-1 text-[0.56rem] leading-snug text-muted-foreground">Approximate: {site.source}</div>}
        </div>
        <button type="button" onClick={() => setCalloutOpen(false)} aria-label="Close" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-bone"><X size={14} /></button>
      </div>
      <label className="mt-2.5 block text-[0.58rem] text-muted-foreground">Radius for region (km)
        <input inputMode="decimal" value={radiusText} onChange={(e) => setRadiusText(e.target.value)} onBlur={commitRadius}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="hud-input mt-1 tabular-nums" />
      </label>
      <p className="mt-1 text-[0.54rem] leading-snug text-muted-foreground">The circle is the area evaluated for landing: slope, lighting, shadowed ground.</p>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={saveCurrentSite} disabled={site.kind === "saved"}
          className="flex items-center justify-center gap-1 rounded border border-retro-purple/50 bg-retro-purple/10 px-2 py-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-retro-purple hover:bg-retro-purple/20 disabled:opacity-40">
          <Save size={12} />{site.kind === "saved" ? "Saved" : "Save to presets"}
        </button>
        <button type="button" onClick={() => setView("orbit")}
          className="flex items-center justify-center gap-1 rounded bg-retro-red px-2 py-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-void hover:bg-[#ff91a2]">
          <Orbit size={12} />View orbit
        </button>
      </div>
    </div>
  </div>;
}
