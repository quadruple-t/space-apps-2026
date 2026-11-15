"use client";

/**
 * Freeplay side panel for expeditions. Signed out, it explains that work autosaves in this
 * browser and offers (never requires) sign-in. Signed in, it names, annotates, switches,
 * creates and deletes expeditions.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Flag, LogIn, Plus, Trash2, X } from "lucide-react";
import { useSignInDialog } from "@/components/auth/sign-in-dialog-store";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import { EXPEDITION_LIMITS } from "@/lib/expeditions/types";
import { EXPEDITION_PANEL_ID } from "./expedition-control";
import { SaveStatusLine } from "./save-status";
import { StudyList, savedOn } from "./study-list";

const sectionTitle = "type-data text-[0.58rem] uppercase tracking-[0.16em] text-retro-purple";
const smallBtn = "rounded border border-line px-2 py-1 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-bone disabled:opacity-40";

function NameForm({ label, submitLabel, initial, onSubmit }: { label: string; submitLabel: string; initial: string; onSubmit: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSubmit(name);
    setBusy(false);
  };
  return <form onSubmit={(e) => void submit(e)} className="flex gap-1.5">
    <label className="sr-only" htmlFor={`name-${submitLabel}`}>{label}</label>
    <input id={`name-${submitLabel}`} value={name} maxLength={EXPEDITION_LIMITS.nameChars} onChange={(e) => setName(e.target.value)} placeholder={label} className="hud-input min-w-0 flex-1" />
    <button type="submit" disabled={busy || !name.trim()} className="shrink-0 rounded bg-retro-purple px-3 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-void hover:bg-[#c2aaff] disabled:opacity-40">{busy ? "…" : submitLabel}</button>
  </form>;
}

function ExpeditionList() {
  const list = useExpeditions((s) => s.list);
  const listStatus = useExpeditions((s) => s.listStatus);
  const activeId = useExpeditions((s) => s.activeId);
  const busy = useExpeditions((s) => s.busy);
  const { open, remove, close, createNew } = useExpeditions.getState();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return <section aria-labelledby="expedition-list-title" className="space-y-2">
    <h3 id="expedition-list-title" className={sectionTitle}>Your expeditions</h3>
    {listStatus === "loading" && list.length === 0 && <p className="text-[0.66rem] text-muted-foreground">Loading…</p>}
    {listStatus === "error" && <p role="alert" className="text-[0.66rem] text-retro-red">Couldn&apos;t load your expeditions.</p>}
    <ul className="space-y-1">{list.map((e) => <li key={e.id} className={`flex items-center gap-1.5 rounded border px-2 py-1.5 ${e.id === activeId ? "border-retro-purple/60 bg-retro-purple/10" : "border-line/70"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-bone">{e.name}</p>
        <p className="type-data text-[0.54rem] text-muted-foreground">Updated {savedOn(e.updatedAt)}</p>
      </div>
      {e.id === activeId
        ? <span className="type-data text-[0.54rem] uppercase text-retro-purple">Open</span>
        : <button type="button" disabled={busy} onClick={() => void open(e.id)} className={smallBtn}>Open</button>}
      {confirmId === e.id
        ? <span className="flex items-center gap-1">
            <button type="button" onClick={() => { setConfirmId(null); void remove(e.id); }} className="rounded bg-retro-red/80 px-2 py-1 text-[0.56rem] uppercase text-void">Delete</button>
            <button type="button" onClick={() => setConfirmId(null)} className={smallBtn}>Keep</button>
          </span>
        : <button type="button" onClick={() => setConfirmId(e.id)} aria-label={`Delete ${e.name}`} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-retro-red/15 hover:text-retro-red"><Trash2 size={13} /></button>}
    </li>)}</ul>
    {confirmId && <p className="text-[0.6rem] text-muted-foreground">Deleting removes the expedition, its saved studies and chat. This can&apos;t be undone.</p>}
    <div className="space-y-1.5 pt-1">
      <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground"><Plus size={11} aria-hidden />New, empty expedition</p>
      <NameForm label="New expedition name" submitLabel="Create" initial="" onSubmit={createNew} />
      {activeId && <button type="button" onClick={() => void close()} className={`${smallBtn} mt-1`}>Work without an expedition</button>}
      <Link href="/expeditions" className="block pt-1 text-[0.62rem] text-retro-purple underline-offset-2 hover:underline">Manage all expeditions</Link>
    </div>
  </section>;
}

export function ExpeditionPanel({ onClose }: { onClose: () => void }) {
  const uid = useExpeditions((s) => s.uid);
  const activeId = useExpeditions((s) => s.activeId);
  const activeName = useExpeditions((s) => s.activeName);
  const notes = useExpeditions((s) => s.notes);
  const error = useExpeditions((s) => s.error);
  const { rename, setNotes, saveCurrentAsExpedition } = useExpeditions.getState();
  const openSignIn = useSignInDialog((s) => s.open);
  const [name, setName] = useState(activeName ?? "");
  const [shownFor, setShownFor] = useState(activeId);
  if (shownFor !== activeId) { setShownFor(activeId); setName(activeName ?? ""); }

  return <aside id={EXPEDITION_PANEL_ID} aria-label="Expedition" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
    className="flex h-full min-h-0 flex-col overflow-hidden border border-line bg-void text-bone lg:w-[340px] lg:border-0 lg:border-l lg:border-line">
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-retro-purple/35 bg-retro-purple/10 text-retro-purple"><Flag size={18} /></span>
        <div className="min-w-0">
          {activeId
            ? <input value={name} aria-label="Expedition name" maxLength={EXPEDITION_LIMITS.nameChars} onChange={(e) => setName(e.target.value)}
                onBlur={() => { const n = name.trim(); if (!n) setName(activeName ?? ""); else if (n !== activeName) void rename(activeId, n); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="type-heading w-full rounded border border-transparent bg-transparent px-1 text-sm text-bone hover:border-line focus:border-retro-purple focus:outline-none" />
            : <h2 className="type-heading text-sm text-bone">Unsaved work</h2>}
          <SaveStatusLine className="px-1" />
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close expedition panel" className="grid size-9 shrink-0 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={16} /></button>
    </header>

    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {error && <p role="alert" className="rounded border border-retro-red/40 bg-retro-red/10 px-2 py-1.5 text-[0.66rem] text-retro-red">{error}</p>}

      {!uid && <section className="border-l-2 border-retro-purple/60 pl-3 text-[0.72rem] leading-relaxed text-muted-foreground">
        <p className="text-bone">Your sites, time window, layers, notes and chat save automatically in this browser.</p>
        <p className="mt-1">Signing in is optional. It keeps your work as named expeditions in your account so you can open them on any device.</p>
        <button type="button" onClick={() => openSignIn()} className="mt-2 inline-flex items-center gap-1.5 rounded border border-retro-purple/50 bg-retro-purple/10 px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.08em] text-retro-purple hover:bg-retro-purple/20">
          <LogIn size={12} />Sign in to keep it
        </button>
      </section>}

      {uid && !activeId && <section className="space-y-2">
        <h3 className={sectionTitle}>Save as expedition</h3>
        <p className="text-[0.66rem] leading-relaxed text-muted-foreground">This work is only in this browser. Name it to save it to your account with its sites, studies, notes and chat.</p>
        <NameForm label="Expedition name" submitLabel="Save" initial="" onSubmit={saveCurrentAsExpedition} />
      </section>}

      <section className="space-y-1.5">
        <label htmlFor="expedition-notes" className={sectionTitle}>Notes</label>
        <textarea id="expedition-notes" value={notes} maxLength={EXPEDITION_LIMITS.notesChars} onChange={(e) => setNotes(e.target.value)} rows={4}
          placeholder="Goals, open questions, why a site made the shortlist…" className="hud-input min-h-20 resize-y text-xs leading-relaxed" />
      </section>

      <section className="space-y-2">
        <h3 className={sectionTitle}>Saved studies</h3>
        <StudyList />
      </section>

      {uid && <ExpeditionList />}
    </div>
  </aside>;
}
