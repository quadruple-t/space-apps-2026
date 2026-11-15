"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ExternalLink, Info, MonitorUp, RotateCcw, RotateCw, SendHorizontal, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ASSISTANT_NAME, MAX_INPUT_CHARS } from "@/lib/assistant/constants";
import { useAssistant, type UiMessage } from "@/lib/assistant/assistant-store";
import { currentTimeMs, useFreeplay } from "@/lib/freeplay-store";
import { Sources } from "./sources";

export const PANEL_ID = "mission-control-panel";
export const LAUNCHER_ID = "mission-control-launcher";

const SUGGESTIONS = [
  "When is the Sun above the horizon at this site?",
  "How much sunlight and Earth visibility does this mission get?",
  "What does the horizon look like here, and where does the data come from?",
  "Show me the Sun and Earth over this mission on the orbit view.",
];

/** Shows what "this site" and "now" currently mean. Own component so playback ticks re-render only this. */
function ContextChip() {
  const site = useFreeplay((s) => s.site);
  const minute = useFreeplay((s) => (s.playing ? null : Math.floor(currentTimeMs(s) / 60_000)));
  const time = minute === null ? "playing" : new Date(minute * 60_000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return <p className="type-data truncate text-[0.58rem] text-muted-foreground" title="Mission Control sees this Freeplay state with each question">
    Context: <span className="text-bone/80">{site ? site.name : "no site selected"}</span> · {time}
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
    <div className={`max-w-[92%] rounded border px-3 py-2 text-[0.8rem] leading-relaxed ${mine ? "border-retro-purple/35 bg-retro-purple/15 text-bone" : "border-line bg-charcoal/70 text-bone/95"}`}>
      <p className="sr-only">{mine ? "You:" : `${ASSISTANT_NAME}:`}</p>
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
      {message.notices && message.notices.length > 0 && <ul className="mt-2 space-y-1">
        {message.notices.map((n) => <li key={n} className="flex gap-1.5 rounded-sm border border-retro-purple/40 bg-retro-purple/10 px-2 py-1 text-[0.68rem] leading-snug text-bone/90">
          <Info size={12} className="mt-0.5 shrink-0 text-retro-purple" aria-hidden /><span><span className="sr-only">Data note: </span>{n}</span>
        </li>)}
      </ul>}
      <ViewChanges message={message} canUndo={canUndo} />
      {message.records && <Sources records={message.records} />}
    </div>
  </li>;
}

export function AssistantPanel({ onClose, className = "" }: { onClose: () => void; className?: string }) {
  const messages = useAssistant((s) => s.messages);
  const status = useAssistant((s) => s.status);
  const progress = useAssistant((s) => s.progress);
  const draft = useAssistant((s) => s.draft);
  const error = useAssistant((s) => s.error);
  const hint = useAssistant((s) => s.hint);
  const announce = useAssistant((s) => s.announce);
  const { send, cancel, clear, retry } = useAssistant.getState();
  const reduced = useReducedMotion();
  const lastUndoable = [...messages].reverse().find((m) => m.viewBefore)?.id;
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "thinking" || status === "tool" || status === "streaming";

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

  return <section id={PANEL_ID} aria-label={`${ASSISTANT_NAME} assistant`} className={`flex min-h-0 flex-col bg-void text-bone ${className}`}
    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
      <div className="min-w-0">
        <h2 className="type-heading text-sm">{ASSISTANT_NAME}</h2>
        <ContextChip />
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon-sm" onClick={clear} disabled={messages.length === 0 && !busy} aria-label="Clear conversation"><Trash2 /></Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`Close ${ASSISTANT_NAME}`}><X /></Button>
      </div>
    </header>

    {/* Streamed text is not announced chunk by chunk; this region announces progress and the finished reply. */}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</div>

    <div role="log" aria-label="Conversation" aria-live="off" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {messages.length === 0 && <div className="space-y-3 text-[0.8rem] text-muted-foreground">
        <p>Ask about the mission you are building or about lunar terrain. I look facts up from the Lunaris360 data service rather than answering from memory.</p>
        <ul className="space-y-1.5" aria-label="Suggested questions">
          {SUGGESTIONS.map((q) => <li key={q}><button type="button" onClick={() => void send(q)} disabled={busy}
            className="w-full rounded border border-line px-2.5 py-1.5 text-left text-bone/85 hover:border-retro-purple/50 hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">{q}</button></li>)}
        </ul>
      </div>}
      <ul className="space-y-3">{messages.map((m) => <Bubble key={m.id} message={m} canUndo={m.id === lastUndoable} />)}</ul>

      {busy && <div className="flex justify-start"><div className="max-w-[92%] rounded border border-line bg-charcoal/70 px-3 py-2 text-[0.8rem]">
        {draft && !reduced
          ? <p className="whitespace-pre-wrap break-words text-bone/95">{draft}</p>
          : <p className={`type-data text-[0.7rem] text-muted-foreground ${reduced ? "" : "animate-pulse"}`}>{status === "tool" && progress ? progress : status === "streaming" ? `${ASSISTANT_NAME} is replying…` : `${ASSISTANT_NAME} is thinking…`}</p>}
        {status === "tool" && progress && draft && !reduced && <p className="type-data mt-1 text-[0.65rem] text-muted-foreground">{progress}</p>}
      </div></div>}

      {error && <div role="alert" className="rounded border border-retro-red/50 bg-retro-red/10 px-3 py-2 text-[0.78rem] text-bone">
        <p>{error}</p>
        {status !== "unavailable" && <Button variant="outline" size="xs" className="mt-2" onClick={retry}><RotateCw />Retry</Button>}
      </div>}
      <div ref={endRef} />
    </div>

    <form onSubmit={submit} className="border-t border-line p-2.5">
      {hint && <p role="status" className="type-data mb-1.5 text-[0.62rem] text-retro-purple">{hint}</p>}
      <div className="flex items-end gap-2">
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))} onKeyDown={onKeyDown}
          rows={2} maxLength={MAX_INPUT_CHARS} disabled={status === "unavailable"} aria-label={`Ask ${ASSISTANT_NAME}`} placeholder="Ask about this site, time or terrain…"
          className="min-h-12 flex-1 resize-none rounded border border-line bg-charcoal/60 px-2.5 py-1.5 text-[0.8rem] text-bone placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50" />
        {busy
          ? <Button type="button" variant="outline" size="icon" onClick={cancel} aria-label="Stop"><Square /></Button>
          : <Button type="submit" size="icon" disabled={!input.trim() || status === "unavailable"} aria-label="Send question"><SendHorizontal /></Button>}
      </div>
      <p className="type-data mt-1.5 flex justify-between gap-2 text-[0.55rem] leading-snug text-muted-foreground">
        <span>Uses stored JPL Horizons ephemerides and LOLA masks where covered. Not an operational mission tool.</span>
        <span aria-hidden className="shrink-0 tabular-nums">{input.length}/{MAX_INPUT_CHARS}</span>
      </p>
    </form>
  </section>;
}
