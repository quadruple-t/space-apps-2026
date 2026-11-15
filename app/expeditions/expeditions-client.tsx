"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, LogIn, Trash2 } from "lucide-react";
import { useSignInDialog } from "@/components/auth/sign-in-dialog-store";
import { savedOn } from "@/components/expeditions/study-list";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/useAuth";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import { EXPEDITION_LIMITS, type ExpeditionMeta } from "@/lib/expeditions/types";

function Row({ e, active }: { e: ExpeditionMeta; active: boolean }) {
  const { rename, remove } = useExpeditions.getState();
  const [name, setName] = useState(e.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<void>) => { setError(null); fn().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))); };

  return <li className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-charcoal/30 p-4">
    <div className="min-w-0 flex-1">
      <input value={name} aria-label="Expedition name" maxLength={EXPEDITION_LIMITS.nameChars} onChange={(ev) => setName(ev.target.value)}
        onBlur={() => { const n = name.trim(); if (!n) setName(e.name); else if (n !== e.name) act(() => rename(e.id, n)); }}
        onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
        className="type-heading w-full rounded border border-transparent bg-transparent px-1 text-lg text-bone hover:border-line focus:border-retro-purple focus:outline-none" />
      <p className="type-data px-1 text-xs text-muted-foreground">Updated {savedOn(e.updatedAt)} · created {savedOn(e.createdAt)}{active ? " · open in Open Exploration" : ""}</p>
      {error && <p role="alert" className="px-1 text-xs text-retro-red">{error}</p>}
    </div>
    <Button asChild size="sm"><Link href={`/open-exploration?expedition=${encodeURIComponent(e.id)}`}>Open in Open Exploration</Link></Button>
    {confirming
      ? <span className="flex items-center gap-2 text-xs text-muted-foreground">Delete it, with its studies and chat? This can&apos;t be undone.
          <Button size="sm" variant="destructive" onClick={() => act(() => remove(e.id))}>Delete</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Keep</Button>
        </span>
      : <Button size="icon" variant="ghost" aria-label={`Delete ${e.name}`} onClick={() => setConfirming(true)}><Trash2 /></Button>}
  </li>;
}

export function ExpeditionsClient() {
  const { user, loading } = useAuth();
  const uid = useExpeditions((s) => s.uid);
  const list = useExpeditions((s) => s.list);
  const listStatus = useExpeditions((s) => s.listStatus);
  const activeId = useExpeditions((s) => s.activeId);
  const createNew = useExpeditions((s) => s.createNew);
  const openSignIn = useSignInDialog((s) => s.open);
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const id = await createNew(name);
    setCreating(false);
    if (id) router.push("/open-exploration");
  };

  if (loading || (user && !uid)) return <p className="text-muted-foreground" role="status">Loading…</p>;

  if (!user) {
    return <div className="max-w-2xl rounded-lg border border-line bg-charcoal/30 p-6">
      <p className="text-bone">You&apos;re exploring without an account, and that&apos;s fine: everything works, and your work autosaves in this browser.</p>
      <p className="mt-2 text-muted-foreground">Sign in only if you want named expeditions saved to your account and available on any device.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => openSignIn()}><LogIn />Sign in</Button>
        <Button asChild variant="outline"><Link href="/open-exploration"><Compass />Explore without an account</Link></Button>
      </div>
    </div>;
  }

  return <div className="space-y-8">
    <form onSubmit={(e) => void create(e)} className="flex max-w-xl gap-2">
      <label htmlFor="new-expedition" className="sr-only">New expedition name</label>
      <input id="new-expedition" value={name} maxLength={EXPEDITION_LIMITS.nameChars} onChange={(e) => setName(e.target.value)} placeholder="New expedition name" className="hud-input flex-1" />
      <Button type="submit" disabled={creating || !name.trim()}>{creating ? "Creating…" : "New expedition"}</Button>
    </form>
    {listStatus === "error" && <p role="alert" className="text-retro-red">Couldn&apos;t load your expeditions. Check your connection and reload.</p>}
    {listStatus === "loading" && list.length === 0 && <p role="status" className="text-muted-foreground">Loading your expeditions…</p>}
    {listStatus === "idle" && list.length === 0 && <p className="text-muted-foreground">No expeditions yet. Create one above, or open <Link href="/open-exploration" className="text-retro-purple underline-offset-2 hover:underline">Open Exploration</Link> and save your work from the Expedition panel.</p>}
    <ul className="space-y-3">{list.map((e) => <Row key={`${e.id}:${e.name}`} e={e} active={e.id === activeId} />)}</ul>
  </div>;
}
