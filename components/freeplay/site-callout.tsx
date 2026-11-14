"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Orbit, Save, X } from "lucide-react";
import type { FreeplaySite } from "@/data/sites";
import { subscribeAnchor } from "@/scenes/cesium/anchor";
import { useFreeplay } from "@/lib/freeplay-store";

const BOX_W = 248;
const GAP = 44;

const fmtLat = (v: number) => `${Math.abs(v).toFixed(4)}°${v < 0 ? "S" : "N"}`;

/** Callout box tied to the selected site by a leader line. Repositions every rendered globe frame. */
export function SiteCallout() {
  const site = useFreeplay((s) => s.site);
  const open = useFreeplay((s) => s.calloutOpen);
  if (!site || !open) return null;
  return <CalloutBody key={site.id} site={site} />;
}

function CalloutBody({ site }: { site: FreeplaySite }) {
  const { setRadius, setCalloutOpen, saveCurrentSite, setView } = useFreeplay.getState();
  const savedCount = useFreeplay((s) => s.savedSites.length);
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const [radiusText, setRadiusText] = useState(String(site.radiusKm));
  const [syncedRadius, setSyncedRadius] = useState(site.radiusKm);
  if (syncedRadius !== site.radiusKm) { setSyncedRadius(site.radiusKm); setRadiusText(String(site.radiusKm)); }
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => subscribeAnchor((a) => {
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
  }), []);

  const commitRadius = () => {
    const km = Number(radiusText);
    if (Number.isFinite(km) && km > 0) setRadius(km);
    else setRadiusText(String(site.radiusKm));
  };
  const startNaming = () => { setName(site.kind === "catalog" ? site.name : `Site ${savedCount + 1}`); setNaming(true); };
  const save = (e: FormEvent) => { e.preventDefault(); saveCurrentSite(name); setNaming(false); };
  const saved = site.kind === "saved";

  return <div ref={wrap} className="pointer-events-none absolute inset-0 z-20" style={{ visibility: "hidden" }}>
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <line ref={line} stroke="#f0ebf7" strokeOpacity="0.8" strokeWidth="1.5" />
      <circle ref={dot} r="4" fill="none" stroke="#f0ebf7" strokeWidth="1.5" />
    </svg>
    <div ref={box} role="dialog" aria-label={`${site.name} details`} className="hud-panel pointer-events-auto absolute left-0 top-0 p-3" style={{ width: BOX_W }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="type-data text-[0.54rem] uppercase tracking-[0.14em] text-retro-purple">{saved ? "Saved site" : site.kind === "catalog" ? "Catalog site · LOLA terrain" : "New site"}</div>
          <h2 className="type-heading mt-0.5 truncate text-sm text-bone">{site.name}</h2>
          <div className="type-data mt-0.5 text-[0.62rem] tabular-nums text-muted-foreground">{fmtLat(site.latitudeDeg)} · {site.longitudeDeg.toFixed(4)}°E</div>
        </div>
        <button type="button" onClick={() => setCalloutOpen(false)} aria-label="Close" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-bone"><X size={14} /></button>
      </div>
      <label className="mt-2.5 block text-[0.58rem] text-muted-foreground">Radius for region (km)
        <input inputMode="decimal" value={radiusText} onChange={(e) => setRadiusText(e.target.value)} onBlur={commitRadius}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="hud-input mt-1 tabular-nums" />
      </label>
      <p className="mt-1 text-[0.54rem] leading-snug text-muted-foreground">The circle is the area evaluated for landing: slope, lighting, shadowed ground.</p>

      {naming
        ? <form onSubmit={save} className="mt-2.5">
            <label className="block text-[0.58rem] text-muted-foreground">Name this site
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="hud-input mt-1"
                onKeyDown={(e) => { if (e.key === "Escape") setNaming(false); }} />
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setNaming(false)} className="rounded border border-line px-2 py-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-bone">Cancel</button>
              <button type="submit" disabled={!name.trim()} className="flex items-center justify-center gap-1 rounded bg-retro-purple px-2 py-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-void hover:bg-[#c2aaff] disabled:opacity-40">
                <Check size={12} />Save
              </button>
            </div>
          </form>
        : <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={startNaming} disabled={saved}
              className="flex items-center justify-center gap-1 rounded border border-retro-purple/50 bg-retro-purple/10 px-2 py-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-retro-purple hover:bg-retro-purple/20 disabled:opacity-40">
              <Save size={12} />{saved ? "Saved" : "Save to presets"}
            </button>
            <button type="button" onClick={() => setView("orbit")}
              className="flex items-center justify-center gap-1 rounded bg-retro-red px-2 py-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-void hover:bg-[#ff91a2]">
              <Orbit size={12} />View orbit
            </button>
          </div>}
    </div>
  </div>;
}
