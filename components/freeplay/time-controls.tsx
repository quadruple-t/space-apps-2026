"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { COVERAGE_END_ISO, COVERAGE_START_ISO, DURATION_PRESETS, SPEEDS, currentTimeMs, useFreeplay } from "@/lib/freeplay-store";

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
  const presetMatch = DURATION_PRESETS.find((p) => p.hours === durationHours);

  const startDate = startIso.slice(0, 10);
  const startTime = startIso.slice(11, 16);
  const changeStart = (date: string, time: string) => {
    const ms = Date.parse(`${date}T${time || "00:00"}:00Z`);
    if (!Number.isNaN(ms)) setStart(new Date(ms).toISOString());
  };

  return <section aria-label="Mission time" className="hud-panel flex flex-col gap-3 p-3 sm:p-4">
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause mission time" : "Play mission time"} title={playing ? "Pause time" : "Play time"}
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-retro-red text-void hover:bg-[#ff91a2]">{playing ? <Pause size={17} /> : <Play size={17} />}</button>
      <button type="button" onClick={() => { setPlaying(false); setElapsed(0); }} aria-label="Restart mission time" title="Restart from mission start" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-muted-foreground hover:text-bone"><RotateCcw size={16} /></button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="type-data text-sm font-medium text-bone tabular-nums">{fmtUtc(nowMs)}</span>
          <span className="text-xs text-muted-foreground">{fmtDuration(elapsedHours)} of {fmtDuration(durationHours)}</span>
        </div>
        <input type="range" min={0} max={durationHours} step={0.05} value={elapsedHours} onChange={(e) => setElapsed(Number(e.target.value))}
          aria-label="Mission time" aria-valuetext={fmtUtc(nowMs)} className="mt-2 w-full accent-[#ff5364]" />
      </div>
    </div>

    <details className="border-t border-line/80 pt-2">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-bone">Mission settings</summary>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="text-sm text-muted-foreground">Start date and time (UTC)
          <div className="mt-1 flex gap-1.5">
            <input type="date" value={startDate} min={COVERAGE_START_ISO.slice(0, 10)} max={COVERAGE_END_ISO.slice(0, 10)} onChange={(e) => changeStart(e.target.value, startTime)} className="hud-input w-[8.6rem] normal-case tracking-normal" title="Stored ephemeris covers 2026–2030" />
            <input type="time" value={startTime} onChange={(e) => changeStart(startDate, e.target.value)} className="hud-input w-[5.4rem] normal-case tracking-normal" />
          </div>
        </label>

        <div className="text-sm text-muted-foreground">Duration
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Mission duration">
              {DURATION_PRESETS.map((p) => <button key={p.label} type="button" aria-pressed={durationHours === p.hours} onClick={() => setDuration(p.hours)}
                className={`whitespace-nowrap px-2.5 py-2 text-sm ${durationHours === p.hours ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>{p.label}</button>)}
            </div>
            <input inputMode="numeric" aria-label="Custom duration in days" placeholder={presetMatch ? "days" : fmtDuration(durationHours)} value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              onBlur={() => { const d = Number(customDays); if (Number.isFinite(d) && d > 0 && d <= 366) setDuration(Math.round(d * 24)); setCustomDays(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="hud-input w-[4.2rem] normal-case tracking-normal" />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">Playback speed
          <div className="mt-1 flex overflow-hidden rounded border border-line" role="group" aria-label="Playback speed, simulated hours per second">
            {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}
              className={`px-3 py-2 text-sm ${speed === s ? "bg-retro-purple/20 text-bone" : "text-muted-foreground hover:text-bone"}`}>{s}×</button>)}
          </div>
          <span className="mt-1 block text-xs">1× = 1 simulated hour per second</span>
        </div>
      </div>
    </details>
  </section>;
}
