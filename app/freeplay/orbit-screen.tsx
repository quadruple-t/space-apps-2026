"use client";

import { TimeControls } from "@/components/freeplay/time-controls";

export function OrbitScreen() {
  return <div className="flex h-full flex-col gap-2 p-2 sm:p-3">
    <div className="hud-panel grid min-h-0 flex-1 place-items-center text-xs text-muted-foreground">Orbit diagram and graphs</div>
    <TimeControls />
  </div>;
}
