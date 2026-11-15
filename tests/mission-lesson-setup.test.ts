import { describe, expect, it } from "vitest";
import type { FreeplaySite } from "@/data/sites";
import { siteForLesson, viewForLesson } from "@/app/mission/lesson-setup";
import { COMPARISON_PRESET, GUIDED_LESSONS, STORY_STOPS } from "@/app/mission/tutorial-content";

const stop = (id: string, catalogId?: string): FreeplaySite => ({
  id, catalogId, name: id, latitudeDeg: 0, longitudeDeg: 0, coordinateReference: "test", provenance: "scientific", radiusKm: 5, kind: "catalog",
});
const apollo = stop("catalog-apollo-11-tranquility", "apollo-11-tranquility");
const luna = stop("catalog-luna-9", "luna-9");
const malapert = stop("catalog-artemis-malapert-massif", "artemis-malapert-massif");
const nobile = stop("catalog-artemis-nobile-rim-1", "artemis-nobile-rim-1");
const tourStops = [apollo, luna, malapert, nobile];
const candidateStops = [malapert, nobile];
const lesson = (id: string) => GUIDED_LESSONS.find((item) => item.id === id)!;
const setup = (target: string, fromChapter: string, currentSite: FreeplaySite | null) =>
  siteForLesson({ target: lesson(target), fromChapter: fromChapter as never, currentSite, tourStops, candidateStops });

describe("guided lesson setup", () => {
  it("selects a site when the site-picking lesson is skipped", () => {
    expect(setup("overlays", "ch1-first-landing", null)).toBe(apollo);
    expect(setup("pick-site", "ch1-first-landing", null)).toBeUndefined();
  });

  it("keeps the chosen site within a chapter", () => {
    expect(setup("overlays", "ch1-first-landing", luna)).toBeUndefined();
    expect(setup("earth", "ch2-robotic-explorer", luna)).toBeUndefined();
  });

  it("opens each new chapter at its first stop", () => {
    expect(setup("sun", "ch1-first-landing", luna)).toBe(apollo);
    expect(setup("pick-site", "ch3-lunar-base", malapert)).toBe(apollo);
  });

  it("always opens the comparison lesson at a candidate region", () => {
    expect(setup("candidates", "ch1-first-landing", null)).toBe(malapert);
    expect(setup("candidates", "ch2-robotic-explorer", luna)).toBe(malapert);
    expect(setup("candidates", "ch2-robotic-explorer", nobile)).toBeUndefined();
  });

  it("leaves the surface drive to the drive setup", () => {
    expect(setup("surface", "ch1-first-landing", null)).toBeUndefined();
  });

  it("maps lessons to the Open Exploration view they dock beside", () => {
    expect(viewForLesson(lesson("overlays"))).toBe("globe");
    expect(viewForLesson(lesson("sun"))).toBe("orbit");
  });

  it("gives every lesson a roadmap label", () => {
    for (const item of GUIDED_LESSONS) expect(item.short.length).toBeGreaterThan(0);
  });

  it("compares Malapert Massif with Luna 9 by their catalog ids", () => {
    const ids = COMPARISON_PRESET.stopIds.map((id) => STORY_STOPS.find((spec) => spec.id === id)?.catalogId);
    expect(ids).toEqual(["artemis-malapert-massif", "luna-9"]);
  });
});
