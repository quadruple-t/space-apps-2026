/**
 * Debounced autosave. It watches a value (the persistent workspace + chat), skips writes while
 * the mission clock is playing (elapsed time ticks constantly), and writes once things settle.
 * Kept free of stores and Firebase so it can be tested with fake timers.
 */
export type AutosaveDeps<T> = {
  /** Current value to save, or null when nothing should be saved right now. */
  read: () => T | null;
  /** Comparison key; a write happens only when it differs from the last saved key. */
  key: (value: T) => string;
  /** True while saving should wait (e.g. the clock is playing). */
  paused: () => boolean;
  write: (value: T) => Promise<void>;
  onStatus?: (status: "saving" | "saved" | "error", error?: unknown) => void;
  delayMs?: number;
};

export type Autosave = {
  /** Call after any relevant store change. */
  notify: () => void;
  /** Writes immediately if something changed (on unmount, before switching expeditions). */
  flush: () => Promise<void>;
  /** Treat the current value as already saved (after loading an expedition). */
  markSaved: () => void;
  cancel: () => void;
};

export function createAutosave<T>({ read, key, paused, write, onStatus, delayMs = 1500 }: AutosaveDeps<T>): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastKey: string | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = (): Promise<void> => {
    cancel();
    const value = read();
    if (value === null) return inFlight;
    const k = key(value);
    if (k === lastKey) return inFlight;
    lastKey = k;
    onStatus?.("saving");
    inFlight = inFlight.then(() => write(value)).then(
      () => { if (lastKey === k) onStatus?.("saved"); },
      (e: unknown) => {
        // Forget the key so the next change (or flush) retries.
        if (lastKey === k) lastKey = null;
        onStatus?.("error", e);
      },
    );
    return inFlight;
  };

  return {
    notify: () => {
      // Checked first: notify runs on every clock tick while playing.
      if (paused()) { cancel(); return; }
      const value = read();
      if (value === null || key(value) === lastKey) { cancel(); return; }
      cancel();
      timer = setTimeout(() => { void run(); }, delayMs);
    },
    flush: () => run(),
    markSaved: () => {
      cancel();
      const value = read();
      lastKey = value === null ? null : key(value);
    },
    cancel,
  };
}
