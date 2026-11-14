import type { ChapterId } from "@/lib/model/types";

export type LessonScreen = "story" | "globe" | "orbit";
export type MissionPhase = "history" | "science" | "challenge" | "debrief";

export type GuidedLesson = {
  id: string;
  chapterId: ChapterId;
  screen: LessonScreen;
  phase: MissionPhase;
  title: string;
  kicker: string;
  body: string;
  objective?: string;
  takeaway?: string;
};

export const SCREEN_LABELS: Record<LessonScreen, string> = { story: "Mission briefing", globe: "Lunar map", orbit: "Orbit + Graphs" };

export const CHAPTER_LABELS: Record<ChapterId, { title: string; era: string; concept: string }> = {
  "ch1-first-landing": { title: "First Landing", era: "Apollo era", concept: "Sun angle and landing visibility" },
  "ch2-robotic-explorer": { title: "Robotic Explorers", era: "Modern exploration", concept: "Power and communication" },
  "ch3-lunar-base": { title: "Mining Lunar Base", era: "Artemis era", concept: "Sustained operations and potential resources" },
};

/** A lunar morning at Tranquility Base, inside Apollo 11's planned Sun-elevation range. */
export const GUIDED_START_UTC = "2026-11-15T23:00:00.000Z";

/** The three-act mission arc is deliberately expressed as the twelve pages from the project blueprint. */
export const GUIDED_LESSONS: readonly GuidedLesson[] = [
  { id: "apollo-history", chapterId: "ch1-first-landing", screen: "story", phase: "history", kicker: "Chapter 1 · 1969", title: "Humanity's first landing", body: "You are an Apollo-era mission planner. Reaching the Moon is no longer the only question: you must choose a place and time where astronauts can see the surface well enough to land safely." },
  { id: "apollo-science", chapterId: "ch1-first-landing", screen: "orbit", phase: "science", kicker: "Learn the science", title: "Understanding the lunar horizon", body: "With no atmosphere to soften the light, the lunar Sun creates sharp contrast. Move through the mission timeline to see how Sun elevation changes shadows and visibility.", objective: "Open Orbit + Graphs and move the mission clock to inspect the Sun’s changing elevation.", takeaway: "High Sun shortens shadows; low Sun reveals terrain but deepens contrast." },
  { id: "apollo-challenge", chapterId: "ch1-first-landing", screen: "orbit", phase: "challenge", kicker: "Landing challenge", title: "Choose a landing time", body: "Your spacecraft is approaching Tranquility Base. Select a moment when the Sun clears the horizon without washing away the terrain’s relief.", objective: "Scrub the timeline, then choose a landing condition after inspecting the Sun elevation.", takeaway: "Apollo 11 planners worked within a narrow 5°–14° Sun-elevation window." },
  { id: "apollo-debrief", chapterId: "ch1-first-landing", screen: "story", phase: "debrief", kicker: "Mission debrief", title: "Landing conditions analyzed", body: "Apollo planners balanced visibility against shadow length. You have learned why a safe landing is tied to the moving Sun — and why touching down is only the beginning." },
  { id: "robot-history", chapterId: "ch2-robotic-explorer", screen: "story", phase: "history", kicker: "Chapter 2 · Today", title: "The robotic frontier", body: "Now the goal is to remain useful after landing. As the planner for a robotic explorer, you must keep it powered, warm, and able to contact Earth while its environment changes." },
  { id: "robot-science", chapterId: "ch2-robotic-explorer", screen: "orbit", phase: "science", kicker: "Learn the science", title: "Power and communication", body: "Solar panels work only while the Sun is above the local terrain. Earth visibility is also shaped by the horizon. Follow both signals over time before you commit to operations.", objective: "Run or scrub the timeline and compare the Sun and Earth readouts.", takeaway: "A clear Earth line of sight is necessary for communication, but it is not a complete radio link budget." },
  { id: "robot-challenge", chapterId: "ch2-robotic-explorer", screen: "orbit", phase: "challenge", kicker: "Operations challenge", title: "Keep the explorer alive", body: "Plan a short robotic mission around light and contact windows. A long dark period or terrain-blocked Earth can end the mission before its science does.", objective: "Inspect both Sun and Earth conditions, then confirm the operational window you would use.", takeaway: "Mission duration depends on more than a successful landing." },
  { id: "robot-debrief", chapterId: "ch2-robotic-explorer", screen: "story", phase: "debrief", kicker: "Mission debrief", title: "A working spacecraft needs a window", body: "Modern missions show that operations depend on lighting, panel orientation, batteries, and communication opportunity. The next mission must sustain people and equipment for far longer." },
  { id: "base-history", chapterId: "ch3-lunar-base", screen: "story", phase: "history", kicker: "Chapter 3 · The Artemis era", title: "Plan a mining lunar base", body: "You are evaluating a future lunar south-pole base. It must support crews and equipment while remaining near areas that may hold water ice — without treating potential resources as guaranteed reserves." },
  { id: "base-science", chapterId: "ch3-lunar-base", screen: "globe", phase: "science", kicker: "Learn the science", title: "Build for a sustained presence", body: "Use the map layers to compare terrain, illumination, and permanently shadowed regions. PSRs are cold enough for ice to persist; they are not proof of extractable ice at a particular location.", objective: "Turn on elevation, illumination, or PSR layers and inspect an Artemis candidate region.", takeaway: "A long-term site trades sunlight, terrain safety, communication, and access to potential resources." },
  { id: "base-challenge", chapterId: "ch3-lunar-base", screen: "globe", phase: "challenge", kicker: "Base selection challenge", title: "Choose a mining base location", body: "Compare candidate locations and decide which trade-off you accept. The map can identify candidate conditions, but it cannot certify a resource reserve or an operational mining plan.", objective: "Compare at least two candidate sites, keep one selected, and record the criterion you prioritize.", takeaway: "A base location is a mission-specific decision, not a universal ranking." },
  { id: "base-debrief", chapterId: "ch3-lunar-base", screen: "story", phase: "debrief", kicker: "Final mission debrief", title: "From landing to lasting presence", body: "Your journey progressed from finding a safe place to land, to keeping a robotic explorer operating, to weighing the conditions for a mining lunar base. Continue in Mission Control to investigate the tools on your own." },
];

/** Retained for SurfaceDrive's optional guided mode. */
export const SURFACE_LESSON = GUIDED_LESSONS[10];
