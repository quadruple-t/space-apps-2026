"use client";

import { usePathname } from "next/navigation";
import { Bot, X } from "lucide-react";
import { AssistantPanel, LAUNCHER_ID, PANEL_ID } from "@/components/freeplay/assistant-panel";
import { useCornerDrag, type Corner } from "@/components/freeplay/use-corner-drag";
import { useAssistant } from "@/lib/assistant/assistant-store";

/** Pages that render their own assistant (the Freeplay sidebar, the Walk on the Moon circle) and the landing page, which has none. */
const HIDDEN_ON = new Set(["/", "/freeplay", "/freeplay/drive"]);

export const CORNER_BUTTON: Record<Corner, string> = {
  tl: "left-4 top-20 sm:left-6", tr: "right-4 top-20 sm:right-6", bl: "bottom-4 left-4 sm:bottom-6 sm:left-6", br: "bottom-4 right-4 sm:bottom-6 sm:right-6",
};
export const CORNER_PANEL: Record<Corner, string> = {
  tl: "left-4 top-36 sm:left-6", tr: "right-4 top-36 sm:right-6", bl: "bottom-20 left-4 sm:bottom-24 sm:left-6", br: "bottom-20 right-4 sm:bottom-24 sm:right-6",
};

/** Mission Control as a draggable corner helper on pages that have no assistant of their own (decided by route, so it can never double up with a page's own). */
export function GlobalAssistant() {
  const open = useAssistant((state) => state.open);
  const setOpen = useAssistant((state) => state.setOpen);
  const pathname = usePathname();
  const { corner, style, handlers, dragging } = useCornerDrag("lunaris360-assistant-corner", "br");
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(LAUNCHER_ID)?.focus());
  };

  if (HIDDEN_ON.has(pathname)) return null;

  return <>
    {open && <div className={`fixed z-[70] h-[min(680px,calc(100dvh-11rem))] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-retro-purple/50 bg-void shadow-[0_18px_70px_rgba(4,2,18,.78)] ${CORNER_PANEL[corner]}`}>
      <AssistantPanel onClose={close} variant="floating" />
    </div>}
    <button id={LAUNCHER_ID} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={open ? PANEL_ID : undefined}
      aria-label={open ? "Close mission assistant" : "Open mission assistant"} title="Mission Control · drag to move, or Shift + arrow keys" style={style} {...handlers}
      className={`fixed z-[71] grid size-14 place-items-center rounded-full border border-retro-purple/60 bg-retro-purple text-void shadow-[0_6px_30px_rgba(169,134,255,.32)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-retro-blue ${dragging ? "cursor-grabbing" : `cursor-grab transition hover:scale-105 hover:bg-[#c2abff] ${CORNER_BUTTON[corner]}`}`}>
      {open ? <X size={21} /> : <Bot size={22} />}
      <span className="sr-only">Mission Control</span>
    </button>
  </>;
}
