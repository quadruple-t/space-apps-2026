"use client";

import { create } from "zustand";
import { useFreeplay } from "@/lib/freeplay-store";
import { runTurn } from "./agent-loop";
import { buildTemplateVariables, toToolContext, type FreeplaySnapshot } from "./context";
import { describeError } from "./errors";
import { TURN_INACTIVITY_MS } from "./constants";
import { capHistory, createRateLimiter, createWatchdog, normalizeInput, turnNotices } from "./guards";
import type { SourceRecord, UiChange } from "./tool-results";
import { applyUiPlan, captureView, restoreView, type ViewSnapshot } from "./ui-actions";

export type UiMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  records?: SourceRecord[];
  notices?: string[];
  /** What the assistant changed on screen while answering, and the view to restore on Undo (cleared once used). */
  viewChanges?: UiChange[];
  viewBefore?: ViewSnapshot;
  /** User messages count toward model history only once they got a reply. */
  answered?: boolean;
};
export type AssistantStatus = "idle" | "thinking" | "tool" | "streaming" | "error" | "unavailable";

type AssistantState = {
  open: boolean;
  messages: UiMessage[];
  status: AssistantStatus;
  /** "Checking horizon data…" while a tool runs. */
  progress: string | null;
  /** Reply text streamed so far for the turn in flight. */
  draft: string;
  /** Message for the screen-reader live region. */
  announce: string;
  error: string | null;
  /** Rate-limit or input notice; does not change status. */
  hint: string | null;
  lastUserText: string | null;
  setOpen: (open: boolean) => void;
  /** `context` is app-supplied data (for example the surface planner setup) sent to the model with the question but not shown in the chat. */
  send: (raw: string, context?: string, surfaceSnapshot?: FreeplaySnapshot) => Promise<void>;
  retry: () => void;
  cancel: () => void;
  /** Puts the Freeplay view back as it was before this reply's changes. */
  undoView: (messageId: string) => void;
  clear: () => void;
};

const limiter = createRateLimiter();
let controller: AbortController | null = null;
let lastContext: string | undefined;
let lastSnapshot: FreeplaySnapshot | undefined;
let seq = 0;
const nextId = () => `m${++seq}`;
const dev = process.env.NODE_ENV !== "production";
/** Development-only diagnostics so a stuck or failing turn can be traced in the browser console. */
const dbg = (...args: unknown[]) => { if (dev) console.info("[mission-control]", ...args); };

function snapshot(): FreeplaySnapshot {
  const s = useFreeplay.getState();
  return { view: s.view, site: s.site, startIso: s.startIso, durationHours: s.durationHours, elapsedHours: s.elapsedHours, playing: s.playing, layers: s.layers, panelAreaM2: s.panelAreaM2, panelEfficiency: s.panelEfficiency };
}

export const useAssistant = create<AssistantState>((set, get) => ({
  open: false,
  messages: [],
  status: "idle",
  progress: null,
  draft: "",
  announce: "",
  error: null,
  hint: null,
  lastUserText: null,

  setOpen: (open) => {
    set({ open });
    if (open) void import("./firebase-ai").then((m) => m.warmUp()).catch(() => undefined);
  },

  send: async (raw, context, surfaceSnapshot) => {
    const text = normalizeInput(raw);
    if (!text || ["thinking", "tool", "streaming"].includes(get().status)) return;
    const decision = limiter.attempt();
    if (!decision.ok) {
      const seconds = Math.ceil(decision.retryInMs / 1000);
      set({ hint: decision.reason === "too-fast" ? "One moment before the next question." : `Question limit reached for now. Try again in ${seconds > 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`}.` });
      return;
    }
    lastContext = context;
    lastSnapshot = surfaceSnapshot;
    const history = capHistory(get().messages.filter((m) => m.role === "model" || m.answered).map((m) => ({ role: m.role, text: m.text })));
    const userMessage: UiMessage = { id: nextId(), role: "user", text };
    set((s) => ({ messages: [...s.messages, userMessage], status: "thinking", progress: null, draft: "", error: null, hint: null, lastUserText: text, announce: "Mission Control is thinking." }));

    controller = new AbortController();
    const { signal } = controller;
    const started = performance.now();
    const at = () => `${Math.round(performance.now() - started)}ms`;
    let timedOut = false;
    const watchdog = createWatchdog(TURN_INACTIVITY_MS, () => { timedOut = true; dbg("no progress, aborting", at()); controller?.abort(); });
    // The view as it was before the assistant touched it this turn, captured on its first change only.
    let viewBefore: ViewSnapshot | undefined;
    const applyUi = (plan: Parameters<typeof applyUiPlan>[0], catalog: Parameters<typeof applyUiPlan>[1]) => {
      viewBefore ??= captureView();
      return applyUiPlan(plan, catalog);
    };
    try {
      const snap = surfaceSnapshot ?? snapshot();
      const { createTurnChat, checkAppCheck } = await import("./firebase-ai");
      await checkAppCheck();
      dbg("app check ready", at());
      const variables = buildTemplateVariables(snap);
      dbg("sending", { historyMessages: history.length, variables });
      const chat = createTurnChat(history, variables, signal);
      const result = await runTurn({
        chat, userText: context ? `${text}\n\n${context}` : text, ctx: toToolContext(snap), signal, applyUi,
        events: {
          onText: (draft) => { watchdog.poke(); set({ draft, status: draft ? "streaming" : "thinking", progress: null }); },
          onToolStart: (progress) => { watchdog.poke(); dbg("tool start", progress, at()); set({ status: "tool", progress, announce: progress }); },
          onToolEnd: (record) => { watchdog.poke(); dbg("tool end", { tool: record.tool, ok: record.ok, error: record.error }, at()); set({ status: "thinking" }); },
          onToolCall: (name, args) => dbg("tool call", name, args),
          onRequest: (round) => { watchdog.poke(); dbg("model request", { round }, at()); },
          onResponse: (info) => { watchdog.poke(); dbg("model response", info, at()); },
        },
      });
      const reply = result.text.trim();
      if (!reply) throw new Error("empty reply");
      const notices = turnNotices(result.records, reply, { toolLimitHit: result.toolLimitHit });
      set((s) => ({
        messages: [...s.messages.map((m) => (m.id === userMessage.id ? { ...m, answered: true } : m)), {
          id: nextId(), role: "model", text: reply, records: result.records, notices,
          ...(viewBefore ? { viewBefore, viewChanges: result.records.flatMap((r) => (r.ui ? [r.ui] : [])) } : {}),
        }],
        status: "idle", progress: null, draft: "", announce: `Mission Control replied: ${reply.slice(0, 600)}`,
      }));
    } catch (err) {
      if (dev) console.error("[mission-control] turn failed", err);
      const info = timedOut
        ? { kind: "network" as const, message: "Mission Control didn't respond in time. It may be unavailable or the request may be blocked; check the browser console and retry." }
        : describeError(err);
      if (info.kind === "cancelled") { set({ status: "idle", progress: null, draft: "", announce: "Stopped." }); return; }
      set({ status: info.kind === "unavailable" ? "unavailable" : "error", error: info.message, progress: null, draft: "", announce: info.message });
    } finally {
      watchdog.stop();
      controller = null;
    }
  },

  retry: () => {
    const { lastUserText, messages } = get();
    if (!lastUserText) return;
    // Drop the unanswered user message so it is not duplicated.
    const last = messages[messages.length - 1];
    set({ messages: last?.role === "user" && !last.answered ? messages.slice(0, -1) : messages, status: "idle", error: null });
    void get().send(lastUserText, lastContext, lastSnapshot);
  },

  cancel: () => controller?.abort(),

  undoView: (messageId) => {
    const target = get().messages.find((m) => m.id === messageId);
    if (!target?.viewBefore) return;
    restoreView(target.viewBefore);
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, viewBefore: undefined } : m)), announce: "Restored the previous Freeplay view." }));
  },

  clear: () => {
    controller?.abort();
    lastContext = undefined;
    lastSnapshot = undefined;
    set({ messages: [], status: "idle", progress: null, draft: "", error: null, hint: null, lastUserText: null, announce: "Conversation cleared." });
  },
}));
