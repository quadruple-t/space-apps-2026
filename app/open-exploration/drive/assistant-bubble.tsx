"use client";

import { MissionAssistantBubble } from "@/components/freeplay/assistant-bubble";
import type { FreeplaySnapshot } from "@/lib/assistant/context";

const SUGGESTIONS = [
  "Review my setup and tell me what to improve.",
  "Which of my solar arrays is doing worst, and where should I move it?",
  "Are my communication windows long enough? How can I improve them?",
  "Is my base well placed for power and Earth contact?",
];

// The drive's own controls sit along the bottom (and a telemetry panel on the right), so bottom corners start higher on small screens.
const LAUNCHERS = {
  tl: "left-3 top-[5.25rem] sm:left-5", tr: "right-3 top-[5.25rem] sm:right-5",
  bl: "bottom-[11.25rem] left-3 sm:bottom-3 sm:left-5", br: "bottom-[11.25rem] right-3 sm:bottom-3 sm:right-5",
};
const PANELS = {
  tl: "left-3 top-[9rem] sm:left-5 h-[min(560px,calc(100dvh-12rem))]", tr: "right-3 top-[9rem] sm:right-5 h-[min(560px,calc(100dvh-12rem))]",
  bl: "bottom-[15rem] left-3 h-[min(560px,calc(100dvh-20rem))] sm:bottom-[4.75rem] sm:left-5 sm:h-[min(560px,calc(100dvh-9rem))]",
  br: "bottom-[15rem] right-3 h-[min(560px,calc(100dvh-20rem))] sm:bottom-[4.75rem] sm:right-5 sm:h-[min(560px,calc(100dvh-9rem))]",
};

export function DriveAssistantBubble({ contextLabel, getContext, getSnapshot }: {
  contextLabel: string; getContext: () => string | undefined; getSnapshot: () => FreeplaySnapshot;
}) {
  return <MissionAssistantBubble suggestions={SUGGESTIONS} suggestionsTitle="Ask about your setup" starterActions={null}
    contextLabel={contextLabel} getContext={getContext} getSnapshot={getSnapshot} placeholder="Ask how to improve your setup…"
    launcherPositions={LAUNCHERS} panelPositions={PANELS} />;
}
