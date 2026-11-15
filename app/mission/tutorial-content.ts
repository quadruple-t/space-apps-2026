import type { ChapterId } from "@/lib/model/types";

export type LessonScreen = "globe" | "orbit" | "drive";

export type GuidedLesson = {
  id: "pick-site" | "overlays" | "sun" | "earth" | "candidates" | "surface";
  chapterId: ChapterId;
  screen: LessonScreen;
  title: string;
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
    story: "It is 1969. Apollo 11 is preparing to land. Before a mission can begin, the team must choose where to go. We will visit four historic landing places, three regions with no historic landing, and three Artemis III candidate regions.",
    example: "Apollo 11 landed in Mare Tranquillitatis. Its marker is one of the bright points on the Moon. The other markers show the nine places we will explore next.",
    steps: [],
    why: "Every place has different ground, sunlight, and views of Earth.",
  },
  {
    id: "overlays",
    chapterId: "ch1-first-landing",
    screen: "globe",
    title: "Look at the ground",
    story: "The Apollo team needed a place where the lander could touch down safely. A smooth-looking image can hide steep ground, so planners check the slope before choosing a landing area.",
    example: "Apollo 15 explored Hadley–Apennine, where a valley runs beside steep mountains. A slope map colors the ground to show which areas are flatter or steeper.",
    steps: ["Turn on Slope in Layers.", "Find the flatter and steeper colors near your marker."],
    why: "Steep ground can make landing and moving around more difficult.",
  },
  {
    id: "sun",
    chapterId: "ch2-robotic-explorer",
    screen: "orbit",
    title: "Follow the sunlight",
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
    story: "Now plan for a possible long-term lunar base. A base may need steady sunlight, safe ground, communication, and access to places that could contain ice.",
    example: "Malapert Massif, Nobile Rim 1, and Mons Mouton are candidate regions. Their map points are approximate references, not official landing coordinates or proof of resources.",
    steps: ["Choose a second candidate.", "Compare sunlight at both places over the same time."],
    why: "There is no single best place for every mission; each site involves trade-offs.",
  },
  {
    id: "surface",
    chapterId: "ch3-lunar-base",
    screen: "drive",
    title: "Explore the surface",
    story: "You have compared places from above. Now visit your chosen stop and look around from the ground.",
    example: "From the surface, nearby hills can hide the Sun or Earth. The 3D terrain is an illustration for orientation; science readouts use the data source shown in the panel.",
    steps: ["Move the pointer to look around.", "Use WASD or the arrow keys to move.", "Try another camera view."],
    why: "The view from the ground can be different from the view on a map.",
  },
];

export const SURFACE_LESSON = GUIDED_LESSONS[GUIDED_LESSONS.length - 1];
