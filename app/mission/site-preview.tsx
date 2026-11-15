"use client";

import { useState } from "react";
import type { FreeplaySite } from "@/data/sites";

/** Actual LRO WAC mosaic tile centered on the selected lunar coordinates. */
export function SitePreview({ site, compact = false }: { site: FreeplaySite; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const z = 8;
  const lon = ((site.longitudeDeg + 180) % 360 + 360) % 360 - 180;
  const x = Math.max(0, Math.min(2 ** (z + 1) - 1, Math.floor(((lon + 180) / 360) * 2 ** (z + 1))));
  const y = Math.max(0, Math.min(2 ** z - 1, Math.floor(((90 - site.latitudeDeg) / 180) * 2 ** z)));
  const tile = `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;
  const height = compact ? "h-16" : "h-28";
  return <div role="img" aria-label={`LRO Wide Angle Camera lunar mosaic near ${site.name}, ${site.latitudeDeg.toFixed(3)} degrees latitude, ${site.longitudeDeg.toFixed(3)} degrees east longitude`} className={`relative w-full overflow-hidden bg-[#161322] ${height}`}>
    {!imageFailed ? <img src={tile} alt="" onError={() => setImageFailed(true)} className="absolute inset-0 size-full object-cover" /> : <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_48%_42%,#655b70,#2b2634_60%,#121019)]" />}
    <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-retro-red shadow-[0_0_0_5px_rgba(255,83,100,.24)]" />
    <span className="absolute inset-x-0 bottom-0 bg-void/75 px-2 py-1 type-data text-[.48rem] uppercase tracking-[.1em] text-bone/80">LRO WAC · {site.latitudeDeg.toFixed(2)}° · {site.longitudeDeg.toFixed(2)}° E</span>
  </div>;
}
