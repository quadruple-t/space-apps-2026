"use client";

import { useRef } from "react";
import { Bot, X } from "lucide-react";
import { AssistantPanel, LAUNCHER_ID } from "@/components/freeplay/assistant-panel";
import { useAssistant } from "@/lib/assistant/assistant-store";

/** Mission Control stays available as a floating helper throughout the app. */
export function GlobalAssistant() {
  const open = useAssistant((state) => state.open);
  const setOpen = useAssistant((state) => state.setOpen);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus());
  };

  return <>
    {open && <div className="fixed bottom-20 right-4 z-[70] h-[min(680px,calc(100dvh-7rem))] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-retro-purple/50 bg-void shadow-[0_18px_70px_rgba(4,2,18,.78)] sm:bottom-24 sm:right-6">
      <AssistantPanel onClose={close} />
    </div>}
    <button ref={button} id={LAUNCHER_ID} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mission-control-panel" aria-label={open ? "Close mission assistant" : "Open mission assistant"}
      className="fixed bottom-4 right-4 z-[71] grid size-14 place-items-center rounded-full border border-retro-purple/60 bg-retro-purple text-void shadow-[0_6px_30px_rgba(169,134,255,.32)] transition hover:scale-105 hover:bg-[#c2abff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-retro-blue sm:bottom-6 sm:right-6">
      {open ? <X size={21} /> : <Bot size={22} />}
      <span className="sr-only">Mission Control</span>
    </button>
  </>;
}
