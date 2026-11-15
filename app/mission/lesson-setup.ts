import type { FreeplaySite } from "@/data/sites";
import type { ChapterId } from "@/lib/model/types";
import type { GuidedLesson } from "./tutorial-content";

const sameStop = (a: FreeplaySite, b: FreeplaySite) => a.id === b.id || Boolean(a.catalogId && a.catalogId === b.catalogId);

/**
 * The site a planner lesson should open with, whether reached with Next/Back or by jumping from
 * the roadmap. Returns `undefined` to keep the current selection.
 *
 * - Starting a new chapter opens at that chapter's first stop (Apollo 11, or the first Artemis
 *   candidate for the lunar-base chapter), as the lessons' examples assume.
 * - The candidate comparison always opens at a candidate region.
 * - Every lesson after "Choose a Moon stop" needs a selected site, so skipping that lesson
 *   selects the first tour stop.
 * - The surface drive is set up separately, from whatever site is selected when it opens.
 */
export function siteForLesson({ target, fromChapter, currentSite, tourStops, candidateStops }: {
  target: GuidedLesson;
  fromChapter: ChapterId;
  currentSite: FreeplaySite | null;
  tourStops: readonly FreeplaySite[];
  candidateStops: readonly FreeplaySite[];
}): FreeplaySite | undefined {
  if (target.screen === "drive") return undefined;
  const firstStop = tourStops[0];
  if (target.id === "candidates") {
    if (currentSite && candidateStops.some((stop) => sameStop(stop, currentSite))) return undefined;
    return candidateStops[0] ?? firstStop;
  }
  if (target.chapterId !== fromChapter) return target.chapterId === "ch3-lunar-base" ? candidateStops[0] ?? firstStop : firstStop;
  if (!currentSite && target.id !== "pick-site") return firstStop;
  return undefined;
}

/** The Open Exploration view a planner lesson is docked beside. */
export const viewForLesson = (lesson: GuidedLesson) => (lesson.screen === "orbit" ? "orbit" : "globe") as "orbit" | "globe";
