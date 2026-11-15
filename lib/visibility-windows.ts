/** Sample-based availability intervals, clipped to the requested analysis period. */
export type VisibilityWindow = { startMs: number; endMs: number; hours: number };

export function windowsFrom(xs: ArrayLike<number>, on: ArrayLike<boolean>, stepMs: number, endMs = (xs.length ? xs[xs.length - 1] + stepMs : 0)): VisibilityWindow[] {
  const windows: VisibilityWindow[] = [];
  if (!(stepMs > 0) || xs.length !== on.length) return windows;
  let start: number | null = null;
  let end = 0;
  const close = () => {
    if (start !== null && end > start) windows.push({ startMs: start, endMs: end, hours: (end - start) / 3_600_000 });
    start = null;
  };
  for (let i = 0; i < xs.length && xs[i] < endMs; i++) {
    const intervalEnd = Math.min(endMs, xs[i] + stepMs, i + 1 < xs.length ? xs[i + 1] : Infinity);
    if (start !== null && xs[i] > end) close();
    if (on[i] && intervalEnd > xs[i]) {
      start ??= xs[i];
      end = intervalEnd;
    } else close();
  }
  close();
  return windows;
}

export const windowHours = (windows: VisibilityWindow[]) => windows.reduce((sum, window) => sum + window.hours, 0);
export const longestWindowHours = (windows: VisibilityWindow[]) => windows.reduce((max, window) => Math.max(max, window.hours), 0);
