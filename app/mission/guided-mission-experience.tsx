"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Compass, Play, Radio, Sun } from "lucide-react";
import { Freeplay } from "@/app/explore/freeplay";

export function GuidedMissionExperience() {
  const [started, setStarted] = useState(false);

  if (started) return <Freeplay guided />;

  return (
    <main className="relative isolate flex min-h-[calc(100dvh-5rem)] items-center overflow-hidden bg-void px-5 py-16 text-bone sm:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_45%,rgba(75,155,255,.16),transparent_42%),radial-gradient(ellipse_at_22%_80%,rgba(169,134,255,.13),transparent_38%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 type-data text-xs uppercase tracking-[.15em] text-muted-foreground transition hover:text-retro-blue"><ArrowLeft size={14}/> Main menu</Link>
          <p className="mt-10 type-data text-xs uppercase tracking-[.24em] text-retro-red">Shadowline / guided mission</p>
          <h1 className="type-heading mt-4 max-w-3xl text-4xl leading-[1.02] text-bone sm:text-6xl">Your first<br/><span className="text-retro-purple">lunar mission.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Learn to read the lunar environment, understand its constraints, and evaluate your first potential landing site—while standing inside the live lunar simulation.</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Compass size={15} className="text-retro-purple"/> 6 interactive lessons</span>
            <span className="inline-flex items-center gap-2"><Sun size={15} className="text-retro-red"/> About 10 minutes</span>
            <span className="inline-flex items-center gap-2"><Radio size={15} className="text-retro-blue"/> Apollo · robotic · Artemis eras</span>
          </div>
          <button type="button" onClick={()=>setStarted(true)} className="mt-9 inline-flex h-12 items-center gap-3 rounded-lg bg-retro-purple px-6 type-data text-xs font-semibold uppercase tracking-[.16em] text-void shadow-[0_0_35px_rgba(169,134,255,.24)] transition hover:bg-[#c2abff]"><Play size={15} fill="currentColor"/> Start guided mission</button>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-retro-blue/20 bg-[#10101d]/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          <div aria-hidden className="absolute -right-10 -top-12 size-56 rounded-full border border-retro-blue/20 bg-[radial-gradient(circle_at_35%_35%,#8799ff,#394368_50%,#141827_72%)] shadow-[0_0_90px_rgba(75,155,255,.18)]" />
          <p className="relative type-data text-[.62rem] uppercase tracking-[.18em] text-retro-blue">Mission sequence</p>
          <ol className="relative mt-6 space-y-5">
            {[
              ["01", "First landing", "Learn to read the surface and terrain horizon."],
              ["02", "Robotic explorers", "Follow the Sun and understand Earth visibility."],
              ["03", "Lunar base", "Use time and mission metrics to compare sites."],
            ].map(([number, title, description])=><li key={number} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-line/80 pt-4"><span className="type-data text-xs text-retro-red">{number}</span><div><h2 className="type-heading text-lg text-bone">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div></li>)}
          </ol>
          <p className="relative mt-7 border-t border-line/80 pt-4 text-xs leading-relaxed text-muted-foreground">Uses the same procedural scene, camera, timeline, and telemetry as Freeplay. Terrain and science values are illustrative scaffolding, not LOLA-derived measurements or mission recommendations.</p>
        </div>
      </div>
    </main>
  );
}
