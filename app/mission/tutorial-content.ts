import type { ChapterId } from "@/lib/model/types";

/** Freeplay screen a lesson runs on: the Moon globe, Orbit + Graphs, or the surface drive. */
export type LessonScreen = "globe" | "orbit" | "drive";

export type GuidedLesson = {
  id: "pick-site" | "overlays" | "sun" | "earth" | "candidates" | "surface";
  /** Story chapter (storyChapters collection) this lesson belongs to. */
  chapterId: ChapterId;
  screen: LessonScreen;
  title: string;
  body: string;
  objective: string;
  takeaway: string;
};

export const SCREEN_LABELS: Record<LessonScreen, string> = { globe: "Globe", orbit: "Orbit + Graphs", drive: "Surface drive" };

/** Shown while the chapter records load, or if the catalog is unavailable. */
export const CHAPTER_LABELS: Record<ChapterId, { title: string; era: string; concept: string }> = {
  "ch1-first-landing": { title: "First Landing", era: "Apollo era", concept: "Sun angle and lighting" },
  "ch2-robotic-explorer": { title: "Robotic Explorer", era: "Commercial landers", concept: "Solar power, batteries and Earth comms" },
  "ch3-lunar-base": { title: "Lunar Base", era: "Artemis era", concept: "Ice, long-duration sunlight and survival" },
};

/** Mission start for the tutorial: a lunar morning at Apollo 11 (Tranquility Base), where the stored ephemeris puts the Sun about 10.7° above the eastern horizon, inside the 5°-14° Apollo planning range. */
export const GUIDED_START_UTC = "2026-11-15T23:00:00.000Z";

/** The lessons follow Freeplay's own order: Globe, then Orbit + Graphs, then the surface drive. */
export const GUIDED_LESSONS: readonly GuidedLesson[] = [
  {
    id: "pick-site",
    chapterId: "ch1-first-landing",
    screen: "globe",
    title: "Pick a landing site",
    body: "Freeplay opens on the Moon globe with no site selected. Switch on Catalog sites in Layers to show past landings and Artemis candidates as stars, then click a star or anywhere on the Moon. A catalog site with a verified point brings its LOLA horizon mask with it; any other point uses a labelled smooth horizon.",
    objective: "Select a site on the globe. The button below jumps to this chapter's featured landing.",
    takeaway: "A landing coordinate is only the start: the horizon around it decides what a crew can see.",
  },
  {
    id: "overlays",
    chapterId: "ch1-first-landing",
    screen: "globe",
    title: "Read the surface",
    body: "The Layers panel adds LRO overlays to the base imagery: slope, polar illumination, permanently shadowed ground and elevation. The circle around your site is the region you are evaluating, and its radius is set in the site callout. The overlays are imagery for context; sunlight and Earth visibility are computed separately from the stored ephemeris and the site's horizon.",
    objective: "Switch on at least one overlay in Layers and look at the ground inside your site's circle.",
    takeaway: "Low sun is useful: long shadows make slopes, craters and boulders easier to read.",
  },
  {
    id: "sun",
    chapterId: "ch2-robotic-explorer",
    screen: "orbit",
    title: "Following the Sun",
    body: "Orbit + Graphs follows one site through a mission. The diagram places the Moon, Sun and Earth; the readouts give the Sun's elevation and the time until sunset or sunrise at your site. A lander's panels only produce power while the Sun clears the terrain. Press play or drag the mission-time slider and watch the readouts and the daily graphs move.",
    objective: "Open Orbit + Graphs (the tab, or View orbit in the site callout), then run or scrub the mission clock.",
    takeaway: "A single lighting snapshot cannot describe a whole mission window.",
  },
  {
    id: "earth",
    chapterId: "ch2-robotic-explorer",
    screen: "orbit",
    title: "Finding Earth",
    body: "Earth visible compares Earth's elevation with the terrain in that direction, and the line next to the graph tabs says which horizon was used. Until Earthset or Earthrise tells you how long the current state lasts. A clear line of sight is still not a working radio link; antennas and link engineering matter too.",
    objective: "Read Earth visible and the time until it changes, then acknowledge the distinction.",
    takeaway: "Line of sight is a necessary communication condition, not a complete link budget.",
  },
  {
    id: "candidates",
    chapterId: "ch3-lunar-base",
    screen: "orbit",
    title: "Choose a landing site",
    body: "A base has to survive more than one good day. Set Duration to a lunar day or a year, open the yearly graphs, and compare candidates over the same mission. Check each site's terrain line before trusting a number: a smooth horizon only gives upper bounds. Save to presets on the globe keeps a site for later. This is a learning exercise, not a mission recommendation.",
    objective: "Compare at least two sites, from the list below, your presets or the globe, then keep your preferred one selected.",
    takeaway: "Site selection is a trade-off. The best choice depends on mission goals and validated data.",
  },
  {
    id: "surface",
    chapterId: "ch3-lunar-base",
    screen: "drive",
    title: "Stand on the surface",
    body: "Surface drive puts you at your selected site at the current mission time. The 3D surface is procedural and only there for orientation; the Sun, Earth and horizon readouts come from the same stored ephemeris and LOLA masks as the graphs. Look around, move across the surface, and try another camera view.",
    objective: "Look around, move with WASD or arrow keys, switch camera view, then confirm you compared the horizon readout with the view.",
    takeaway: "Visibility follows the terrain horizon, not an ideal flat plane.",
  },
];

export const SURFACE_LESSON = GUIDED_LESSONS[GUIDED_LESSONS.length - 1];
