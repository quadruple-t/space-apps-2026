"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw } from "lucide-react";
import { DURATION_PRESETS, SPEEDS, currentTimeMs, useFreeplay } from "@/lib/freeplay-store";

/** Advances elapsed mission time while playing. Mount once per Freeplay page. */
export function usePlaybackClock() {
  const playing = useFreeplay((s) => s.playing);
  const speed = useFreeplay((s) => s.speed);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      const { elapsedHours, durationHours, setElapsed, setPlaying } = useFreeplay.getState();
      const next = elapsedHours + dt * speed;
      if (next >= durationHours) { setElapsed(durationHours); setPlaying(false); return; }
      setElapsed(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);
}

const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtDuration = (h: number) => (h < 48 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(h % 24 ? 1 : 0)} d`);

export function TimeControls() {
  const startIso = useFreeplay((s) => s.startIso);
  const durationHours = useFreeplay((s) => s.durationHours);
  const elapsedHours = useFreeplay((s) => s.elapsedHours);
  const playing = useFreeplay((s) => s.playing);
  const speed = useFreeplay((s) => s.speed);
  const { setStart, setDuration, setElapsed, setPlaying, setSpeed } = useFreeplay.getState();
  const nowMs = currentTimeMs({ startIso, elapsedHours });

  const [customDays, setCustomDays] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const presetMatch = DURATION_PRESETS.find((p) => p.hours === durationHours);

  const startDate = startIso.slice(0, 10);
  const startTime = startIso.slice(11, 16);
  const changeStart = (date: string, time: string) => {
    const ms = Date.parse(`${date}T${time || "00:00"}:00Z`);
    if (!Number.isNaN(ms)) setStart(new Date(ms).toISOString());
  };

  return <section aria-label="Time controls" className="hud-panel flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-2.5">
    <button type="button" onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen}
      className="type-data flex w-full items-center justify-between text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground md:hidden">
      <span>Mission setup · {startDate} · {fmtDuration(durationHours)}</span>{setupOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
    </button>
    <div className={`${setupOpen ? "flex" : "hidden"} flex-wrap items-end gap-x-4 gap-y-2 md:contents`}>
    <label className="hud-label">Date (UTC)
      <div className="mt-1 flex gap-1">
        <input type="date" value={startDate} onChange={(e) => changeStart(e.target.value, startTime)} className="hud-input w-[8.6rem] normal-case tracking-normal" />
        <input type="time" value={startTime} onChange={(e) => changeStart(startDate, e.target.value)} className="hud-input w-[5.4rem] normal-case tracking-normal" />
      </div>
    </label>

    <div className="hud-label">Duration
      <div className="mt-1 flex items-center gap-1">
        <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Duration">
          {DURATION_PRESETS.map((p) => <button key={p.label} type="button" aria-pressed={durationHours === p.hours} onClick={() => setDuration(p.hours)}
            className={`type-data whitespace-nowrap px-2 py-[0.42rem] text-[0.6rem] normal-case tracking-normal ${durationHours === p.hours ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>{p.label}</button>)}
        </div>
        <input inputMode="numeric" aria-label="Custom duration in days" placeholder={presetMatch ? "days" : fmtDuration(durationHours)} value={customDays}
          onChange={(e) => setCustomDays(e.target.value)}
          onBlur={() => { const d = Number(customDays); if (Number.isFinite(d) && d > 0 && d <= 366) setDuration(Math.round(d * 24)); setCustomDays(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="hud-input w-[4.2rem] normal-case tracking-normal" />
      </div>
    </div>
    </div>

    <div className="hud-label">Speed
      <div className="mt-1 flex items-center gap-1">
        <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}
          className="grid size-8 place-items-center rounded bg-retro-red text-void hover:bg-[#ff91a2]">{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <button type="button" onClick={() => { setPlaying(false); setElapsed(0); }} aria-label="Restart" className="grid size-8 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><RotateCcw size={14} /></button>
        <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Playback speed (1× = 1 simulated hour per second)">
          {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}
            className={`type-data px-2 py-[0.42rem] text-[0.6rem] normal-case tracking-normal ${speed === s ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>{s}×</button>)}
        </div>
      </div>
    </div>

    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-data text-[0.66rem] text-bone tabular-nums">{fmtUtc(nowMs)}</span>
        <span className="type-data text-[0.56rem] text-muted-foreground tabular-nums">T+{fmtDuration(elapsedHours)} / {fmtDuration(durationHours)} · 1× = 1 h/s</span>
      </div>
      <input type="range" min={0} max={durationHours} step={0.05} value={elapsedHours} onChange={(e) => setElapsed(Number(e.target.value))}
        aria-label="Mission time" aria-valuetext={fmtUtc(nowMs)} className="w-full accent-[#ff5364]" />
    </div>
  </section>;
}
