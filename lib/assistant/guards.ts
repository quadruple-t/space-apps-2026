/** Input cap, history cap, client-side rate limit and the deterministic per-turn notices. */
import {
  MAX_HISTORY_MESSAGES, MAX_HISTORY_MESSAGE_CHARS, MAX_INPUT_CHARS, RATE_MAX_IN_WINDOW,
  RATE_MIN_INTERVAL_MS, RATE_WINDOW_MS, TOOL_LIMIT_WORDING, UNGROUNDED_WORDING,
} from "./constants";
import type { SourceRecord } from "./tool-results";

export type ChatMessage = { role: "user" | "model"; text: string };

/** Trims, strips control characters and caps length. Returns null for empty input. */
export function normalizeInput(raw: string): string | null {
  const text = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, MAX_INPUT_CHARS) : null;
}

/** Last N completed text messages, each capped. Tool payloads are never replayed. */
export function capHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  // The model API requires the first turn to be from the user.
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent.map((m) => ({ role: m.role, text: m.text.slice(0, MAX_HISTORY_MESSAGE_CHARS) }));
}

export type RateDecision = { ok: true } | { ok: false; retryInMs: number; reason: "too-fast" | "too-many" };

export function createRateLimiter(opts: { minIntervalMs?: number; windowMs?: number; maxInWindow?: number; now?: () => number } = {}) {
  const { minIntervalMs = RATE_MIN_INTERVAL_MS, windowMs = RATE_WINDOW_MS, maxInWindow = RATE_MAX_IN_WINDOW, now = Date.now } = opts;
  let stamps: number[] = [];
  return {
    /** Records the attempt only when allowed. */
    attempt(): RateDecision {
      const t = now();
      stamps = stamps.filter((s) => t - s < windowMs);
      const last = stamps[stamps.length - 1];
      if (last !== undefined && t - last < minIntervalMs) return { ok: false, retryInMs: minIntervalMs - (t - last), reason: "too-fast" };
      if (stamps.length >= maxInWindow) return { ok: false, retryInMs: windowMs - (t - stamps[0]), reason: "too-many" };
      stamps.push(t);
      return { ok: true };
    },
  };
}

const NUMERIC_CLAIM = /\d(?:[\d.,]*)\s?(?:°|%|km\b|hours?\b|hrs?\b|minutes?\b|min\b|days?\b)/i;

/**
 * Notices the UI shows under a reply no matter what the model wrote: fallback/grid horizon wording, tool
 * failures, the tool-round cap, and numeric claims made without any successful lookup.
 */
export function turnNotices(records: SourceRecord[], reply: string, opts: { toolLimitHit?: boolean } = {}): string[] {
  const notices = new Set<string>();
  for (const r of records) r.mustSay.forEach((s) => notices.add(s));
  if (opts.toolLimitHit) notices.add(TOOL_LIMIT_WORDING);
  if (!records.some((r) => r.ok) && NUMERIC_CLAIM.test(reply)) notices.add(UNGROUNDED_WORDING);
  return [...notices];
}

/**
 * Inactivity watchdog for a turn: call `poke()` on every sign of progress (text, tool start/end). If nothing
 * happens for `ms`, `onTimeout` fires once. Call `stop()` when the turn ends.
 */
export function createWatchdog(ms: number, onTimeout: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => { timer = setTimeout(() => { timer = null; onTimeout(); }, ms); };
  arm();
  return {
    poke() { if (timer) { clearTimeout(timer); arm(); } },
    stop() { if (timer) { clearTimeout(timer); timer = null; } },
  };
}
