"use client";

import { Bot } from "lucide-react";
import type { ComponentProps } from "react";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "./assistant-panel";
import { useAssistant } from "@/lib/assistant/assistant-store";

type Props = Omit<ComponentProps<typeof AssistantPanel>, "variant" | "onClose"> & {
  launcherClassName?: string;
  panelClassName?: string;
};

/** A shared conversation, reachable without leaving the map, graphs, or surface setup. */
export function MissionAssistantBubble({ launcherClassName = "bottom-3 left-3 sm:left-5", panelClassName = "bottom-[4.75rem] left-3 sm:left-5 h-[min(560px,calc(100dvh-12rem))]", ...panel }: Props) {
  const open = useAssistant((state) => state.open);
  const setOpen = useAssistant((state) => state.setOpen);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus());
  };
  return <>
    {open && <div data-no-flight-controls role="dialog" aria-label="Mission Control conversation" className={`absolute z-40 w-[min(380px,calc(100vw-1.5rem))] ${panelClassName}`}>
      <AssistantPanel {...panel} variant="floating" onClose={close} />
    </div>}
    <button id={LAUNCHER_ID} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={open ? PANEL_ID : undefined}
      aria-label={open ? "Close Mission Control assistant" : "Open Mission Control assistant"} title="Mission Control · ask about your setup"
      className={`absolute z-40 grid size-12 place-items-center rounded-full border shadow-[0_10px_40px_rgba(4,2,18,.7)] transition ${launcherClassName} ${open ? "border-retro-purple bg-retro-purple text-void" : "border-retro-purple/60 bg-void/95 text-retro-purple hover:bg-retro-purple/15"}`}>
      <Bot size={22} />
    </button>
  </>;
}
