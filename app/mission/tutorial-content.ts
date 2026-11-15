import type { ChapterId } from "@/lib/model/types";

export type LessonScreen = "globe" | "orbit" | "drive";

export type GuidedLesson = {
  id: "pick-site" | "overlays" | "sun" | "earth" | "candidates" | "surface";
  chapterId: ChapterId;
  screen: LessonScreen;
  title: string;
  /** One or two words for the lesson roadmap. */
  short: string;
  story: string;
  example: string;
  steps: string[];
  why: string;
};

export type StoryStopSpec = {
  id: string;
  catalogId?: string;
  name: string;
  group: "Historic landing" | "Unvisited region" | "Artemis III candidate";
  note: string;
  latitudeDeg?: number;
  longitudeDeg?: number;
};

/** Candidate and unvisited points are clearly presented as references, not landing records. */
export const STORY_STOPS: StoryStopSpec[] = [
  { id: "apollo-11", catalogId: "apollo-11-tranquility", name: "Apollo 11 · Mare Tranquillitatis", group: "Historic landing", note: "First crewed Moon landing, 1969." },
  { id: "luna-9", catalogId: "luna-9", name: "Luna 9 · Oceanus Procellarum area", group: "Historic landing", note: "First successful soft landing, 1966; location is approximate." },
  { id: "apollo-15", catalogId: "apollo-15-hadley-apennine", name: "Apollo 15 · Hadley–Apennine", group: "Historic landing", note: "A landing beside a winding valley and mountain range, 1971." },
  { id: "apollo-17", catalogId: "apollo-17-taurus-littrow", name: "Apollo 17 · Taurus–Littrow", group: "Historic landing", note: "Last crewed lunar landing, 1972." },
  { id: "schrodinger-basin", name: "Schrödinger Basin", group: "Unvisited region", note: "A far-side basin; approximate center, not a landing site.", latitudeDeg: -75, longitudeDeg: 132.4 },
  { id: "peary-crater", name: "Peary Crater", group: "Unvisited region", note: "A crater near the north pole; approximate center, not a landing site.", latitudeDeg: 88.6, longitudeDeg: 33 },
  { id: "haworth-crater", catalogId: "artemis-haworth", name: "Haworth Crater", group: "Unvisited region", note: "No historic landing; marker is an approximate region reference." },
  { id: "malapert-massif", catalogId: "artemis-malapert-massif", name: "Malapert Massif", group: "Artemis III candidate", note: "Candidate region, not a selected or confirmed landing site." },
  { id: "nobile-rim-1", catalogId: "artemis-nobile-rim-1", name: "Nobile Rim 1", group: "Artemis III candidate", note: "Candidate region, not a selected or confirmed landing site." },
  { id: "mons-mouton", catalogId: "artemis-mons-mouton", name: "Mons Mouton", group: "Artemis III candidate", note: "Candidate region, not a selected or confirmed landing site." },
];

export const SCREEN_LABELS: Record<LessonScreen, string> = {
  globe: "Moon map",
  orbit: "Sun & Earth",
  drive: "Moon surface",
};

export const CHAPTER_LABELS: Record<ChapterId, { title: string; era: string; concept: string }> = {
  "ch1-first-landing": { title: "First Landing", era: "Apollo era", concept: "Choosing a safe place to land" },
  "ch2-robotic-explorer": { title: "Robotic Explorers", era: "Modern exploration", concept: "Power and communication" },
  "ch3-lunar-base": { title: "Mining Lunar Base", era: "Artemis era", concept: "Long-term living and potential resources" },
};

export const GUIDED_START_UTC = "2026-11-15T23:00:00.000Z";

/** Six short lessons follow Apollo, robotic exploration, then future lunar-base planning. */
export const GUIDED_LESSONS: readonly GuidedLesson[] = [
  {
    id: "pick-site",
    chapterId: "ch1-first-landing",
    screen: "globe",
    title: "Choose a Moon stop",
    short: "Pick a stop",
    story: "Every mission starts with a place. Explore historic landing sites, unvisited regions, and Artemis candidate areas on the Moon.",
    example: "Apollo 11 landed in Mare Tranquillitatis. Candidate markers are possible regions, not confirmed landing sites.",
    steps: [],
    why: "Every place has different ground, sunlight, and views of Earth.",
  },
  {
    id: "overlays",
    chapterId: "ch1-first-landing",
    screen: "globe",
    title: "Look at the ground",
    short: "Ground",
    story: "A smooth-looking image can hide steep ground. Planners check slope before choosing where a lander can touch down safely.",
    example: "Apollo 15 explored beside Hadley Rille and the Apennine Mountains. The slope layer helps distinguish gentler ground from steep terrain.",
    steps: ["Turn on Slope in Layers.", "Find the flatter and steeper colors near your marker."],
    why: "Steep ground can make landing and moving around more difficult.",
  },
  {
    id: "sun",
    chapterId: "ch2-robotic-explorer",
    screen: "orbit",
    title: "Follow the sunlight",
    short: "Sunlight",
    story: "A landing site can be bright at one time and dark later. A robotic explorer needs sunlight for power and warmth.",
    example: "Apollo 11 was planned for a low morning Sun. Long shadows helped astronauts see rocks and craters, but the Sun still had to reach the landing area.",
    steps: ["Press Play or move the time slider.", "Watch the sunlight readout and graph change."],
    why: "A single moment cannot tell the team how long sunlight will last.",
  },
  {
    id: "earth",
    chapterId: "ch2-robotic-explorer",
    screen: "orbit",
    title: "Keep a view of Earth",
    short: "Earth view",
    story: "A lander needs to send information home. A nearby ridge can block the view of Earth, even when the sky looks open from another place.",
    example: "The Earth-visibility graph shows when terrain blocks the view. A clear view helps, but does not guarantee a working radio link.",
    steps: ["Choose Earth visibility.", "Move along the graph and notice when Earth is above the horizon."],
    why: "A mission needs both a clear path to Earth and working communications equipment.",
  },
  {
    id: "candidates",
    chapterId: "ch3-lunar-base",
    screen: "orbit",
    title: "Compare future base regions",
    short: "Compare",
    story: "Now plan for a possible long-term lunar base. A base may need steady sunlight, safe ground, communication, and access to places that could contain ice.",
    example: "Compare a south-polar highland, Malapert Massif, with Luna 9's landing area near the equator. Malapert Massif, Nobile Rim 1, and Mons Mouton are candidate regions; their map points are approximate references, not official landing coordinates or proof of resources.",
    steps: ["Choose a second candidate.", "Compare sunlight at both places over the same time."],
    why: "There is no single best place for every mission; each site involves trade-offs.",
  },
  {
    id: "surface",
    chapterId: "ch3-lunar-base",
    screen: "drive",
    title: "Explore the surface",
    short: "Surface",
    story: "You have compared places from above. Now visit your chosen stop and look around from the ground.",
    example: "From the surface, nearby hills can hide the Sun or Earth. The 3D terrain is an illustration for orientation; science readouts use the data source shown in the panel.",
    steps: ["Move the pointer to look around.", "Use WASD or the arrow keys to move.", "Try another camera view."],
    why: "The view from the ground can be different from the view on a map.",
  },
];

/**
 * The fixed example pair in the "Compare future base regions" lesson: two places whose sunlight
 * and Earth geometry differ for different reasons. Copy stays qualitative; the numbers come from
 * the app's own calculations in the comparison cards.
 *
 * Horizon sources as the app resolves them: Malapert Massif's catalog point is an approximate
 * region reference, so the API refuses it by id and the point falls back to its LOLA polar
 * terrain-grid cell (terrain-derived). Luna 9's Soviet-era coordinate is unverified, so it is also
 * refused by id, and at about 7°N it is outside the polar grid: it gets the labelled smooth-sphere
 * horizon, whose sunlight and Earth-visibility shares are upper bounds.
 */
export const COMPARISON_PRESET = {
  /** STORY_STOPS ids (catalog ids `artemis-malapert-massif` and `luna-9`). */
  stopIds: ["malapert-massif", "luna-9"] as const,
  label: "Malapert Massif vs Luna 9",
  lead: "Review this fixed example: a south-polar highland against an equatorial landing site. In the next section, compare any two stops from the earlier site tour.",
  sites: [
    {
      stopId: "malapert-massif",
      title: "Malapert Massif · south-polar highland",
      body: "A mountain massif about 86° south. Near the pole the Sun never climbs high; it circles low around the horizon, so high ground can stay sunlit for long stretches while nearby low ground stays in shadow. Earth sits low over the near-side horizon and wobbles up and down over the month (libration), so it can dip below the horizon or behind ridges at times.",
      caveat: "The marker is an approximate region reference, not a NASA landing coordinate, and not necessarily the sunniest high point. Its horizon comes from the LOLA polar terrain grid cell nearest that point.",
    },
    {
      stopId: "luna-9",
      title: "Luna 9 · Oceanus Procellarum, about 7°N 64°W",
      body: "The first soft landing, in 1966, on dark mare plains near the equator. Here the Sun rises, crosses high overhead and sets: roughly 14.75 Earth days of daylight, then roughly 14.75 days of night. From the near side, Earth stays in about the same part of the sky.",
      caveat: "Its Soviet-era coordinate has never been confirmed, so the app does not use a terrain horizon there. It uses a smooth-sphere horizon instead (not terrain-derived), so its sunlight and Earth-visibility shares are upper bounds.",
    },
  ],
  predict: "Predict first: which place do you expect to stay sunlit longer over one lunar day, and which keeps Earth in view more steadily? Then check the bars, calculated by the app for the same mission window.",
} as const;

export const SURFACE_LESSON = GUIDED_LESSONS[GUIDED_LESSONS.length - 1];
