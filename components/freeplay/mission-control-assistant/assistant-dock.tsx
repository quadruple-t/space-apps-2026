"use client";

import { MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { useAssistant } from "@/lib/assistant/assistant-store";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "./assistant-panel";
import { useIsDesktop } from "./use-is-desktop";

/** Header button that opens the assistant. Lives in the Freeplay header so it never covers globe controls. */
export function AssistantLauncher() {
  const open = useAssistant((s) => s.open);
  const setOpen = useAssistant((s) => s.setOpen);
  return <button id={LAUNCHER_ID} type="button" aria-expanded={open} aria-controls={PANEL_ID} onClick={() => setOpen(!open)}
    className={`type-data flex items-center gap-1.5 rounded border px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.1em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${open ? "border-retro-purple/60 bg-retro-purple/20 text-bone" : "border-line text-muted-foreground hover:border-retro-purple/50 hover:text-bone"}`}>
    <MessageSquare size={13} aria-hidden />{ASSISTANT_NAME}
  </button>;
}

function returnFocusToLauncher() {
  requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus());
}

/**
 * The panel. At md and up it docks beside the globe as a non-modal column, so the user can keep picking
 * sites while asking about them. On small screens it is a bottom sheet so nothing overlaps the globe controls.
 */
export function AssistantDock() {
  const open = useAssistant((s) => s.open);
  const setOpen = useAssistant((s) => s.setOpen);
  const desktop = useIsDesktop();
  const close = () => { setOpen(false); returnFocusToLauncher(); };
  if (!open) return null;

  if (desktop) {
    return <aside className="flex w-[22rem] shrink-0 border-l border-line lg:w-96" aria-label={`${ASSISTANT_NAME} panel`}>
      <AssistantPanel onClose={close} className="w-full" />
    </aside>;
  }
  return <Sheet open onOpenChange={(next) => { if (!next) close(); }}>
    <SheetContent side="bottom" showCloseButton={false} className="h-[78dvh] max-h-[78dvh] gap-0 p-0">
      <SheetTitle className="sr-only">{ASSISTANT_NAME}</SheetTitle>
      <SheetDescription className="sr-only">Ask about your Freeplay mission or lunar terrain</SheetDescription>
      <AssistantPanel onClose={close} className="h-full" />
    </SheetContent>
  </Sheet>;
}
