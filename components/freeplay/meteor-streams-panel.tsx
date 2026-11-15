"use client";

import { useEffect, useState } from "react";
import { getFactSheet } from "@/lib/firestore/factsService";
import { useFreeplay } from "@/lib/freeplay-store";
import { meteorStreamsFromFacts, type MeteorStream } from "@/lib/science/meteor-streams";

export function MeteorStreamsPanel() {
  const selected = useFreeplay((s) => s.meteorStream);
  const setSelected = useFreeplay((s) => s.setMeteorStream);
  const [streams, setStreams] = useState<MeteorStream[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    getFactSheet("meteor-streams-2026").then((sheet) => {
      if (!sheet) throw new Error("Missing meteor-stream facts");
      const data = meteorStreamsFromFacts(sheet);
      if (!data.length) throw new Error("Empty meteor-stream facts");
      if (alive) setStreams(data);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  const stream = streams.find((s) => s.name === selected);
  return <div className="mt-2 text-[0.58rem] text-muted-foreground">
    <label htmlFor="meteor-stream" className="block text-bone">2026 shower reference</label>
    <select id="meteor-stream" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!streams.length}
      className="mt-1 w-full rounded border border-line bg-void p-1 text-bone">
      {!streams.length && <option value={selected}>{error ? "Reference data unavailable" : "Loading references…"}</option>}
      {streams.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
    </select>
    {stream && <p className="mt-1">Snapshot: {stream.referenceUtc.slice(0, 10)} · 20:00 UTC. Independent of the simulation clock.</p>}
    {error && <p role="alert" className="mt-1">Meteor reference data could not load. The meteor-streams-2026 fact sheet must be available in the data API.</p>}
    <p className="mt-1">Orange shows the stream-facing hemisphere; brighter means more direct incidence. Uncolored areas can still receive other meteoroids. No impact rates or storm frequency are implied.</p>
    <a className="mt-1 block underline" href="https://www.asg.ed.tum.de/en/lpe/forschung/mondeinschlagsblitze/meteoroid-stream-geometry/" target="_blank" rel="noreferrer">TUM stream geometry & reference maps ↗</a>
  </div>;
}
