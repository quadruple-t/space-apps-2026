"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Check, ExternalLink, GitCompareArrows, Globe2, Info, Layers3, MonitorUp, Orbit, Rocket, RotateCcw, RotateCw, SendHorizontal, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { AssistantAction } from "@/integrations/assistant/types";
import { ASSISTANT_NAME, MAX_INPUT_CHARS } from "@/lib/assistant/constants";
import { useAssistant, type UiMessage } from "@/lib/assistant/assistant-store";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { SaveToExpedition } from "@/components/expeditions/save-to-expedition";
import { Sources } from "./mission-control-assistant/sources";

export const PANEL_ID = "mission-control-panel";
export const LAUNCHER_ID = "mission-control-launcher";

const STARTER_ACTIONS: Array<{ label: string; Icon: typeof Layers3; action: AssistantAction }> = [
  { label: "Show slope", Icon: Layers3, action: { type: "set-layer", layerId: "slope", enabled: true } },
  { label: "Show candidate sites", Icon: Globe2, action: { type: "show-catalog", enabled: true } },
  { label: "Open Orbit + Graphs", Icon: Orbit, action: { type: "set-view", view: "orbit" } },
  { label: "Launch window", Icon: Rocket, action: { type: "set-view", view: "launch" } },
  { label: "Compare presets", Icon: GitCompareArrows, action: { type: "set-view", view: "compare" } },
];

const SUGGESTIONS = [
  "When is the Sun above the horizon at this site?",
  "How much sunlight and Earth visibility does this mission get?",
  "What does the horizon look like here, and where does the data come from?",
  "Show me the Sun and Earth over this mission on the orbit view.",
  "Plan the launch: transit time, fuel and rough cost to land here.",
  "How much solar power would a flat panel make over this window?",
  "Which way does the Geminids stream face at this site?",
  "Compare my saved presets over this mission window.",
];

function runAction(action: AssistantAction) {
  const state = useFreeplay.getState();
  if (action.type === "set-layer") {
    state.setLayer(action.layerId, { on: action.enabled });
    state.setView("globe");
  } else if (action.type === "show-catalog") {
    state.setShowCatalog(action.enabled);
    state.setView("globe");
  } else {
    state.setView(action.view);
  }
}

/** Site and mission time the assistant sees with each question. Own component so playback ticks re-render only this. */
function ContextLine() {
  const site = useFreeplay((s) => s.site);
  const minute = useFreeplay((s) => (s.playing ? null : Math.floor(currentTimeMs(s) / 60_000)));
  const time = minute === null ? "playing" : new Date(minute * 60_000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return <p className="type-data mt-0.5 truncate text-[0.58rem] text-muted-foreground" title="The assistant sees this Freeplay state with each question">
    {site ? `${site.name} · ${site.latitudeDeg.toFixed(2)}°, ${site.longitudeDeg.toFixed(2)}°` : "No site selected"} · {time}
  </p>;
}

/** What the assistant changed on screen, with Undo (latest changed reply only, so it never reverts later work) and page links. */
function ViewChanges({ message, canUndo }: { message: UiMessage; canUndo: boolean }) {
  const changes = message.viewChanges?.flatMap((c) => c.changes) ?? [];
  const links = message.viewChanges?.flatMap((c) => (c.link ? [c.link] : [])) ?? [];
  if (changes.length === 0 && links.length === 0) return null;
  return <div className="mt-2 rounded-sm border border-retro-blue/40 bg-retro-blue/10 px-2 py-1.5 text-[0.68rem] leading-snug text-bone/90">
    <p className="type-data flex items-center gap-1.5 uppercase tracking-[0.1em] text-retro-blue"><MonitorUp size={12} aria-hidden />View changed</p>
    <ul className="mt-1 list-disc space-y-0.5 pl-4">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {canUndo && <Button type="button" variant="outline" size="xs" onClick={() => useAssistant.getState().undoView(message.id)}><RotateCcw />Restore previous view</Button>}
      {links.map((l) => <Button key={l.href} asChild variant="outline" size="xs"><Link href={l.href}><ExternalLink />{l.label}</Link></Button>)}
    </div>
  </div>;
}

function Bubble({ message, canUndo }: { message: UiMessage; canUndo: boolean }) {
  const mine = message.role === "user";
  return <li className={mine ? "flex justify-end" : "flex justify-start"}>
    <div className={`max-w-[92%] rounded-md border px-3 py-2 text-[0.8rem] leading-relaxed ${mine ? "border-retro-purple/35 bg-retro-purple/15 text-bone" : "border-line bg-charcoal/70 text-bone/95"}`}>
      <p className="sr-only">{mine ? "You:" : `${ASSISTANT_NAME}:`}</p>
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
      {message.notices && message.notices.length > 0 && <ul className="mt-2 space-y-1">
        {message.notices.map((n) => <li key={n} className="flex gap-1.5 rounded-sm border border-retro-purple/40 bg-retro-purple/10 px-2 py-1 text-[0.68rem] leading-snug text-bone/90">
          <Info size={12} className="mt-0.5 shrink-0 text-retro-purple" aria-hidden /><span><span className="sr-only">Data note: </span>{n}</span>
        </li>)}
      </ul>}
      <ViewChanges message={message} canUndo={canUndo} />
      {message.records && <Sources records={message.records} />}
      {message.studies?.map((study, i) => <div key={i} className="mt-2 border-t border-line/60 pt-2">
        <p className="type-data mb-1 text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">{study.label}</p>
        <SaveToExpedition compact makeInput={() => study} />
      </div>)}
    </div>
  </li>;
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const site = useFreeplay((s) => s.site);
  const messages = useAssistant((s) => s.messages);
  const status = useAssistant((s) => s.status);
  const progress = useAssistant((s) => s.progress);
  const draft = useAssistant((s) => s.draft);
  const error = useAssistant((s) => s.error);
  const hint = useAssistant((s) => s.hint);
  const announce = useAssistant((s) => s.announce);
  const { send, cancel, clear, retry } = useAssistant.getState();
  const reduced = useReducedMotion();
  const [input, setInput] = useState("");
  const [lastAction, setLastAction] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "thinking" || status === "tool" || status === "streaming";
  const unavailable = status === "unavailable";
  const lastUndoable = [...messages].reverse().find((m) => m.viewBefore)?.id;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, draft, status]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || busy) return;
    void send(input);
    setInput("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  const chooseAction = (label: string, action: AssistantAction) => {
    runAction(action);
    setLastAction(`${label} is ready.`);
  };

  const statusLabel = unavailable ? "AI not connected" : busy ? `${ASSISTANT_NAME} is working` : "Ready";
  const statusTone = unavailable ? "text-retro-red" : busy ? "text-retro-purple" : "text-retro-blue";
  const statusDot = unavailable ? "bg-retro-red" : busy ? "bg-retro-purple" : "bg-retro-blue";

  return <aside id={PANEL_ID} aria-label="Mission assistant" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
    className="flex h-full min-h-0 flex-col overflow-hidden border border-line bg-void text-bone lg:w-[360px] lg:border-0 lg:border-l lg:border-line">
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-retro-purple/35 bg-retro-purple/10 text-retro-purple"><Bot size={19} /></span>
        <div className="min-w-0">
          <h2 className="type-heading text-sm text-bone">Mission assistant</h2>
          <ContextLine />
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={clear} disabled={messages.length === 0 && !busy} aria-label="Clear conversation" className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone disabled:opacity-40"><Trash2 size={15} /></button>
        <button type="button" onClick={onClose} aria-label="Close mission assistant" className="grid size-9 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={16} /></button>
      </div>
    </header>

    {/* Streamed text is not announced chunk by chunk; this region announces progress and the finished reply. */}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</div>

    <div role="log" aria-label="Conversation" aria-live="off" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <div className={`flex items-center gap-2 text-xs ${statusTone}`}><span className={`size-2 rounded-full ${statusDot} ${busy && !reduced ? "animate-pulse" : ""}`} />{statusLabel}</div>

      {messages.length === 0 && <>
        <section aria-label="About the assistant" className="border-l-2 border-retro-purple/60 pl-3">
          <p className="text-sm leading-relaxed text-bone">Ask about the mission you are building or about lunar terrain. Answers are looked up from the Lunaris360 data service rather than given from memory.</p>
        </section>

        <section aria-labelledby="assistant-shortcuts">
          <h3 id="assistant-shortcuts" className="type-data text-xs uppercase text-muted-foreground">Workspace shortcuts</h3>
          <div className="mt-2 flex flex-col gap-2">
            {STARTER_ACTIONS.map(({ label, Icon, action }) => {
              const disabled = action.type === "set-view" && !site;
              return <button key={label} type="button" disabled={disabled} onClick={() => chooseAction(label, action)} className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 text-left text-sm text-bone transition hover:border-retro-purple/50 hover:bg-retro-purple/5 disabled:cursor-not-allowed disabled:opacity-45" title={disabled ? "Select a site on the Moon first" : undefined}>
                <Icon size={16} className="shrink-0 text-retro-purple" />
                <span className="flex-1">{label}</span>
                <ArrowUpRight size={14} className="text-muted-foreground" />
              </button>;
            })}
          </div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-retro-blue">{lastAction && <><Check size={13} className="mr-1 inline" />{lastAction}</>}</p>
        </section>

        <section aria-labelledby="assistant-suggestions" className="border-t border-line pt-4">
          <h3 id="assistant-suggestions" className="type-data text-xs uppercase text-muted-foreground">Ask about a site</h3>
          <ul className="mt-2 space-y-1.5">
            {SUGGESTIONS.map((q) => <li key={q}><button type="button" onClick={() => void send(q)} disabled={busy || unavailable}
              className="w-full rounded-md border border-line px-2.5 py-1.5 text-left text-[0.8rem] text-bone/85 hover:border-retro-purple/50 hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">{q}</button></li>)}
          </ul>
        </section>
      </>}

      <ul className="space-y-3">{messages.map((m) => <Bubble key={m.id} message={m} canUndo={m.id === lastUndoable} />)}</ul>

      {busy && <div className="flex justify-start"><div className="max-w-[92%] rounded-md border border-line bg-charcoal/70 px-3 py-2 text-[0.8rem]">
        {draft && !reduced
          ? <p className="whitespace-pre-wrap break-words text-bone/95">{draft}</p>
          : <p className={`type-data text-[0.7rem] text-muted-foreground ${reduced ? "" : "animate-pulse"}`}>{status === "tool" && progress ? progress : status === "streaming" ? `${ASSISTANT_NAME} is replying…` : `${ASSISTANT_NAME} is thinking…`}</p>}
        {status === "tool" && progress && draft && !reduced && <p className="type-data mt-1 text-[0.65rem] text-muted-foreground">{progress}</p>}
      </div></div>}

      {error && <div role="alert" className="rounded-md border border-retro-red/50 bg-retro-red/10 px-3 py-2 text-[0.78rem] text-bone">
        <p>{error}</p>
        {!unavailable && <Button variant="outline" size="xs" className="mt-2" onClick={retry}><RotateCw />Retry</Button>}
      </div>}
      <div ref={endRef} />
    </div>

    <form onSubmit={submit} className="border-t border-line p-2.5">
      {hint && <p role="status" className="type-data mb-1.5 text-[0.62rem] text-retro-purple">{hint}</p>}
      <div className="flex items-end gap-2">
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))} onKeyDown={onKeyDown}
          rows={2} maxLength={MAX_INPUT_CHARS} disabled={unavailable} aria-label="Message the mission assistant" placeholder={unavailable ? "AI connection not configured" : "Ask about this site, time or terrain…"}
          className="min-h-12 flex-1 resize-none rounded-md border border-line bg-void/60 px-2.5 py-1.5 text-[0.8rem] text-bone placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50" />
        {busy
          ? <Button type="button" variant="outline" size="icon" onClick={cancel} aria-label="Stop"><Square /></Button>
          : <Button type="submit" size="icon" disabled={!input.trim() || unavailable} aria-label="Send question"><SendHorizontal /></Button>}
      </div>
      <p className="type-data mt-1.5 flex justify-between gap-2 text-[0.55rem] leading-snug text-muted-foreground">
        <span>Uses stored JPL Horizons ephemerides and LOLA masks where covered. Not an operational mission tool.</span>
        <span aria-hidden className="shrink-0 tabular-nums">{input.length}/{MAX_INPUT_CHARS}</span>
      </p>
    </form>

    <footer className="border-t border-line px-4 py-3 text-xs text-muted-foreground">Site selections and layer settings stay under your control.</footer>
  </aside>;
}
