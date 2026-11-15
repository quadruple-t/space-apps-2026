"use client";

import { AlertTriangle, Check, CloudOff, HardDrive, Loader2 } from "lucide-react";
import { useExpeditions } from "@/lib/expeditions/expedition-store";

/** One short line describing where work is being saved, shared by the toolbar and the panel. */
export function useSaveStatus() {
  const uid = useExpeditions((s) => s.uid);
  const activeId = useExpeditions((s) => s.activeId);
  const status = useExpeditions((s) => s.status);
  const pendingSync = useExpeditions((s) => s.pendingSync);
  const error = useExpeditions((s) => s.error);

  if (!activeId) {
    return { tone: "muted" as const, Icon: HardDrive, label: uid ? "Unsaved work · in this browser" : "Saved in this browser", detail: null };
  }
  if (status === "error") return { tone: "error" as const, Icon: AlertTriangle, label: "Couldn't save", detail: error };
  if (status === "saving") return { tone: "muted" as const, Icon: Loader2, label: "Saving…", detail: null };
  if (pendingSync) return { tone: "muted" as const, Icon: CloudOff, label: "Saved on this device · syncing", detail: "Changes upload when the connection returns." };
  return { tone: "ok" as const, Icon: Check, label: "Saved", detail: null };
}

export function SaveStatusLine({ className = "" }: { className?: string }) {
  const { tone, Icon, label, detail } = useSaveStatus();
  const color = tone === "error" ? "text-retro-red" : tone === "ok" ? "text-retro-blue" : "text-muted-foreground";
  return <p role="status" aria-live="polite" className={`type-data flex items-center gap-1.5 text-[0.58rem] ${color} ${className}`} title={detail ?? undefined}>
    <Icon size={11} aria-hidden className={label === "Saving…" ? "motion-safe:animate-spin" : undefined} />{label}
  </p>;
}
