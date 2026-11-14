export const GUIDED_LESSONS = [
  {
    era: "FIRST LANDING · APOLLO ERA",
    title: "Getting your bearings",
    body: "You are standing at a reference site near the lunar south pole. Its coordinates identify the point where this local terrain tile is anchored. Look around, move across the surface, and try another camera view.",
    objective: "Look around, move with WASD or arrow keys, and switch camera view.",
    takeaway: "A landing coordinate is only the start: local relief shapes what a crew can see and reach.",
  },
  {
    era: "FIRST LANDING · APOLLO ERA",
    title: "Reading the horizon",
    body: "The Moon has no atmospheric haze to soften the view. Ridges and crater rims form a terrain-defined horizon that can hide an object even when it sits above a perfectly level geometric horizon.",
    objective: "Inspect the terrain, then confirm you have compared the horizon with the local relief.",
    takeaway: "The visible horizon follows the terrain, not an ideal flat plane.",
  },
  {
    era: "ROBOTIC EXPLORERS · MODERN ERA",
    title: "Following the Sun",
    body: "Azimuth tells you the Sun’s direction around the horizon; elevation tells you how high it appears. Low-angle light makes long shadows. Change the simulation time and watch the Sun readout and scene respond.",
    objective: "Change the simulation time using the timeline or date controls.",
    takeaway: "A single lighting snapshot cannot describe a whole mission window.",
  },
  {
    era: "ROBOTIC EXPLORERS · MODERN ERA",
    title: "Finding Earth",
    body: "Earth’s azimuth and elevation describe its apparent direction. A positive geometric elevation alone does not prove terrain clearance or a working radio link; terrain and link engineering still matter.",
    objective: "Read the Earth azimuth and elevation in Local conditions, then acknowledge the distinction.",
    takeaway: "Line of sight is a necessary communication condition, not a complete link budget.",
  },
  {
    era: "LUNAR BASE · ARTEMIS ERA",
    title: "Time is everything",
    body: "Mission planning needs a timeline, not just a snapshot. Run or scrub time and compare instantaneous Sun and Earth geometry with the longer-window sunlight and blackout metrics.",
    objective: "Run or scrub the simulation clock and inspect the changing readouts.",
    takeaway: "A site can look favorable now and still face a long dark or communication interval later.",
  },
  {
    era: "LUNAR BASE · ARTEMIS ERA",
    title: "Choose a landing site",
    body: "Compare candidate locations using the map and the same scene, telemetry, and mission window. Weigh terrain, sunlight, and Earth visibility together; the illustrative demo values do not establish a scientifically optimal site.",
    objective: "Visit at least two map nodes, compare their readouts, then keep your preferred location selected.",
    takeaway: "Site selection is a trade-off. The best choice depends on mission goals and validated data.",
  },
] as const;
