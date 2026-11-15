import type { VisibilityWindow as CommWindow } from "@/lib/visibility-windows";

const fmtShort = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace("T", " ");

/** "14.8 d", "8.0 h" or "25 min": the length of a window in the unit that reads best. */
export function fmtDuration(hours: number): string {
  if (hours <= 0) return "0 min";
  if (hours < 1 / 60) return "<1 min";
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  if (hours >= 1) return `${hours.toFixed(1)} h`;
  return `${Math.max(1, Math.round(hours * 60))} min`;
}

export function longestOf(windows: CommWindow[]): number {
  return windows.reduce((m, w) => Math.max(m, w.hours), 0);
}

/** Start, end and length of each window (UTC). Long lists are cut with a count of what is left. */
export function WindowList({ windows, emptyText, accent = "text-retro-blue", max = 8 }: { windows: CommWindow[]; emptyText: string; accent?: string; max?: number }) {
  if (windows.length === 0) return <p className="type-data text-xs text-retro-red">{emptyText}</p>;
  return <ul className="type-data grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
    {windows.slice(0, max).map((w) => <li key={w.startMs}><span className={accent}>{fmtShort(w.startMs)}</span> → {fmtShort(w.endMs)} UTC · <span className="text-bone">{fmtDuration(w.hours)}</span></li>)}
    {windows.length > max && <li>+ {windows.length - max} more</li>}
  </ul>;
}
