"use client";

import { Flag } from "lucide-react";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import { useSaveStatus } from "./save-status";

export const EXPEDITION_PANEL_ID = "expedition-panel";
export const EXPEDITION_LAUNCHER_ID = "expedition-launcher";

/** Freeplay toolbar button: the open expedition (or unsaved work) and its save state. */
export function ExpeditionControl({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const name = useExpeditions((s) => s.activeName);
  const { label, tone } = useSaveStatus();
  return <button id={EXPEDITION_LAUNCHER_ID} type="button" onClick={onToggle} aria-expanded={open} aria-controls={EXPEDITION_PANEL_ID}
    aria-label={`${open ? "Close" : "Open"} expedition panel. ${name ?? "Unsaved work"}: ${label}`}
    className={`inline-flex h-8 max-w-[15rem] items-center gap-2 rounded border px-3 type-data text-[0.62rem] uppercase ${open ? "border-retro-purple/60 bg-retro-purple/15 text-bone" : "border-line text-muted-foreground hover:border-retro-purple/50 hover:text-bone"}`}>
    <Flag size={14} className="shrink-0" />
    <span className="truncate">{name ?? "Expedition"}</span>
    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone === "error" ? "bg-retro-red" : tone === "ok" ? "bg-retro-blue" : "bg-muted-foreground"}`} />
  </button>;
}
