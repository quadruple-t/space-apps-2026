"use client";

/**
 * Connects optional sign-in to expeditions, once for the whole app: tells the expedition store
 * when someone signs in or out, and right after an explicit sign-in offers to keep the work
 * done while signed out. Nothing here blocks the page for signed-out visitors.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/useAuth";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import { EXPEDITION_LIMITS } from "@/lib/expeditions/types";

export function ExpeditionBridge() {
  const { user, loading } = useAuth();
  const uid = user?.uid ?? null;
  const sawSignedOut = useRef(false);

  useEffect(() => {
    const store = useExpeditions.getState();
    store.init();
    if (loading) return;
    if (!uid) {
      sawSignedOut.current = true;
      if (store.uid) void store.setUser(null, "signedOut");
      return;
    }
    // A sign-in after this page saw no user is explicit; otherwise the session was restored on load.
    void store.setUser(uid, sawSignedOut.current ? "signedIn" : "restored");
  }, [uid, loading]);

  return <ImportOfferDialog />;
}

function ImportOfferDialog() {
  const open = useExpeditions((s) => s.importOffer);
  const dismiss = useExpeditions((s) => s.dismissImport);
  const save = useExpeditions((s) => s.saveCurrentAsExpedition);
  const [name, setName] = useState("My first expedition");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const id = await save(name);
    setSaving(false);
    if (!id) setError(useExpeditions.getState().error ?? "Couldn't save the expedition.");
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
    <DialogContent>
      <form onSubmit={(e) => void submit(e)}>
        <DialogHeader>
          <DialogTitle>Save your current work as an expedition?</DialogTitle>
          <DialogDescription>
            Your saved sites, comparisons, notes and Mission Control chat from before you signed in are still in this browser.
            Save them to your account to open them on any device.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 grid gap-1.5">
          <Label htmlFor="import-expedition-name">Expedition name</Label>
          <Input id="import-expedition-name" value={name} maxLength={EXPEDITION_LIMITS.nameChars} onChange={(e) => setName(e.target.value)} autoFocus />
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>Keep as unsaved draft</Button>
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save as expedition"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
