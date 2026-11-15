"use client";

import { Bot } from "lucide-react";
import type { ComponentProps } from "react";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "./assistant-panel";
import { useCornerDrag, type Corner } from "./use-corner-drag";
import { useAssistant } from "@/lib/assistant/assistant-store";

type Props = Omit<ComponentProps<typeof AssistantPanel>, "variant" | "onClose"> & {
  /** Classes placing the launcher and its panel in each corner (offsets keep clear of the page's own controls). */
  launcherPositions?: Record<Corner, string>;
  panelPositions?: Record<Corner, string>;
  storageKey?: string;
};

const LAUNCHERS: Record<Corner, string> = { tl: "left-3 top-3 sm:left-5", tr: "right-3 top-3 sm:right-5", bl: "bottom-3 left-3 sm:left-5", br: "bottom-3 right-3 sm:right-5" };
const PANELS: Record<Corner, string> = {
  tl: "left-3 top-[4.75rem] sm:left-5 h-[min(560px,calc(100dvh-9rem))]", tr: "right-3 top-[4.75rem] sm:right-5 h-[min(560px,calc(100dvh-9rem))]",
  bl: "bottom-[4.75rem] left-3 sm:left-5 h-[min(560px,calc(100dvh-9rem))]", br: "bottom-[4.75rem] right-3 sm:right-5 h-[min(560px,calc(100dvh-9rem))]",
};

/** A shared conversation, reachable without leaving the surface setup. A draggable circle that snaps to the screen corners. */
export function MissionAssistantBubble({ launcherPositions = LAUNCHERS, panelPositions = PANELS, storageKey = "lunaris360-assistant-bubble-corner", ...panel }: Props) {
  const open = useAssistant((state) => state.open);
  const setOpen = useAssistant((state) => state.setOpen);
  const { corner, style, handlers, dragging } = useCornerDrag(storageKey, "bl");
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus());
  };
  return <>
    {open && <div data-no-flight-controls role="dialog" aria-label="Mission Control conversation" className={`fixed z-40 w-[min(380px,calc(100vw-1.5rem))] ${panelPositions[corner]}`}>
      <AssistantPanel {...panel} variant="floating" onClose={close} />
    </div>}
    <button id={LAUNCHER_ID} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={open ? PANEL_ID : undefined} data-no-flight-controls style={style} {...handlers}
      aria-label={open ? "Close Mission Control assistant" : "Open Mission Control assistant"} title="Mission Control · drag to move, or Shift + arrow keys"
      className={`fixed z-40 grid size-12 place-items-center rounded-full border shadow-[0_10px_40px_rgba(4,2,18,.7)] ${dragging ? "cursor-grabbing" : `cursor-grab transition ${launcherPositions[corner]}`} ${open ? "border-retro-purple bg-retro-purple text-void" : "border-retro-purple/60 bg-void/95 text-retro-purple hover:bg-retro-purple/15"}`}>
      <Bot size={22} />
    </button>
  </>;
}
