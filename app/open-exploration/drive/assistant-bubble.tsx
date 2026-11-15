"use client";

import { MissionAssistantBubble } from "@/components/freeplay/assistant-bubble";
import type { FreeplaySnapshot } from "@/lib/assistant/context";

const SUGGESTIONS = [
  "Review my setup and tell me what to improve.",
  "Which of my solar arrays is doing worst, and where should I move it?",
  "Are my communication windows long enough? How can I improve them?",
  "Is my base well placed for power and Earth contact?",
];

// The playback bar runs along the bottom centre (about 12rem tall) and spans nearly the full width below lg,
// so bottom-corner launchers sit above it until there is room beside it, and open panels always sit above it.
// The bottom-right launcher clears the controls hint that sits just above the bar on the right.
const LAUNCHERS = {
  tl: "left-3 top-[5.25rem] sm:left-5", tr: "right-3 top-[5.25rem] sm:right-5",
  bl: "bottom-[12.75rem] left-3 sm:left-5 lg:bottom-3", br: "bottom-[15.5rem] right-3 sm:right-5 lg:bottom-3",
};
const ABOVE_BAR = "h-[min(560px,calc(100dvh-23rem))] lg:bottom-[13rem] lg:h-[min(560px,calc(100dvh-19rem))]";
const PANELS = {
  tl: "left-3 top-[9rem] sm:left-5 h-[min(560px,calc(100dvh-22rem))]", tr: "right-3 top-[9rem] sm:right-5 h-[min(560px,calc(100dvh-22rem))]",
  bl: `bottom-[17rem] left-3 sm:left-5 ${ABOVE_BAR}`,
  br: `bottom-[19.75rem] right-3 sm:right-5 ${ABOVE_BAR}`,
};

export function DriveAssistantBubble({ contextLabel, getContext, getSnapshot }: {
  contextLabel: string; getContext: () => string | undefined; getSnapshot: () => FreeplaySnapshot;
}) {
  return <MissionAssistantBubble suggestions={SUGGESTIONS} suggestionsTitle="Ask about your setup" starterActions={null}
    contextLabel={contextLabel} getContext={getContext} getSnapshot={getSnapshot} placeholder="Ask how to improve your setup…"
    launcherPositions={LAUNCHERS} panelPositions={PANELS} />;
}
