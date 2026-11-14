import type { ChapterId } from "@/lib/model/types";

export type GuidedLesson = {
  /** Story chapter (storyChapters collection) this lesson belongs to. */
  chapterId: ChapterId;
  title: string;
  body: string;
  objective: string;
  takeaway: string;
};

/** Shown while the chapter records load, or if the catalog is unavailable. */
export const CHAPTER_LABELS: Record<ChapterId, { title: string; era: string; concept: string }> = {
  "ch1-first-landing": { title: "First Landing", era: "Apollo era", concept: "Sun angle and lighting" },
  "ch2-robotic-explorer": { title: "Robotic Explorer", era: "Commercial landers", concept: "Solar power, batteries and Earth comms" },
  "ch3-lunar-base": { title: "Lunar Base", era: "Artemis era", concept: "Ice, long-duration sunlight and survival" },
};

/** Lunar morning at Apollo 11 (Tranquility Base): the stored ephemeris puts the Sun about 10.7° above the eastern horizon, inside the 5°-14° Apollo planning range. */
export const GUIDED_START_UTC = "2026-11-15T23:00:00.000Z";

export const GUIDED_LESSONS: readonly GuidedLesson[] = [
  {
    chapterId: "ch1-first-landing",
    title: "Getting your bearings",
    body: "You are standing at a catalog landing site. Its coordinates select the stored JPL Horizons ephemeris and, where one exists, the site's LOLA horizon mask. The 3D surface around you is procedural and only there for orientation. The mission clock starts on a lunar morning with the Sun low in the east, the kind of lighting Apollo crews landed in. Look around, move across the surface, and try another camera view.",
    objective: "Look around, move with WASD or arrow keys, and switch camera view.",
    takeaway: "A landing coordinate is only the start: the horizon around it decides what a crew can see.",
  },
  {
    chapterId: "ch1-first-landing",
    title: "Reading the horizon",
    body: "The Moon has no atmospheric haze to soften the view. Ridges and crater rims form a terrain-defined horizon that can hide the Sun or Earth even when they sit above a level geometric horizon. The readout below is the horizon used for this site's visibility calculations.",
    objective: "Read the horizon source and its highest obstruction, then confirm you have compared it with the view.",
    takeaway: "Visibility follows the terrain horizon, not an ideal flat plane. A smooth-sphere fallback only gives upper bounds.",
  },
  {
    chapterId: "ch2-robotic-explorer",
    title: "Following the Sun",
    body: "Azimuth tells you the Sun's direction around the horizon; elevation tells you how high it appears. Low-angle light makes long shadows, and a lander's panels only produce power while the Sun clears the terrain. Change the simulation time and watch the Sun readout and scene respond.",
    objective: "Change the simulation time using the timeline or date controls.",
    takeaway: "A single lighting snapshot cannot describe a whole mission window.",
  },
  {
    chapterId: "ch2-robotic-explorer",
    title: "Finding Earth",
    body: "Earth's azimuth and elevation come from the same stored ephemeris. The visibility flag compares that position with the site's horizon, but a clear line of sight is still not a working radio link; antennas and link engineering matter too.",
    objective: "Read the Earth azimuth, elevation and horizon check, then acknowledge the distinction.",
    takeaway: "Line of sight is a necessary communication condition, not a complete link budget.",
  },
  {
    chapterId: "ch3-lunar-base",
    title: "Time is everything",
    body: "Mission planning needs a timeline, not just a snapshot. Run or scrub time and compare the instantaneous Sun and Earth geometry with the 24-hour sunlight and blackout metrics sampled for this site.",
    objective: "Run or scrub the simulation clock and inspect the changing readouts.",
    takeaway: "A site can look favorable now and still face a long dark or communication interval later.",
  },
  {
    chapterId: "ch3-lunar-base",
    title: "Choose a landing site",
    body: "Compare candidate locations with the same scene, telemetry and mission window. Weigh sunlight, Earth visibility and slope together, and check each site's horizon source before trusting a number. This is a learning exercise, not a mission recommendation.",
    objective: "Visit at least two candidate sites, compare their readouts, then keep your preferred location selected.",
    takeaway: "Site selection is a trade-off. The best choice depends on mission goals and validated data.",
  },
];
