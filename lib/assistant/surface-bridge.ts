"use client";

/**
 * Lets the assistant edit the open surface drive. The drive owns its placements and terrain, so it registers
 * a bridge while its explore view is mounted; with no bridge the tool reports the drive is not open.
 */
import type { Placement } from "@/lib/drive-placements";
import type { UiChange } from "./tool-results";
import type { SurfacePlan } from "./tool-validation";

export type SurfaceSnapshot = { placements: Placement[]; viewMode: "first-person" | "birds-eye" };
export type SurfaceBridge = {
  apply: (plan: SurfacePlan) => UiChange | null;
  capture: () => SurfaceSnapshot;
  restore: (snapshot: SurfaceSnapshot) => void;
};

let bridge: SurfaceBridge | null = null;

export function registerSurfaceBridge(next: SurfaceBridge): () => void {
  bridge = next;
  return () => { if (bridge === next) bridge = null; };
}
export const surfaceBridgeOpen = () => bridge !== null;
export const applySurfacePlan = (plan: SurfacePlan): UiChange | null => bridge?.apply(plan) ?? null;
export const captureSurface = (): SurfaceSnapshot | null => bridge?.capture() ?? null;
export const restoreSurface = (snapshot: SurfaceSnapshot): boolean => { if (!bridge) return false; bridge.restore(snapshot); return true; };
