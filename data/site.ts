/**
 * Site-wide content and navigation.
 * Keep copy here so pages, nav and footer stay in sync.
 */

export const SITE = {
  name: "Lunaris360",
  tagline: "Where lunar exploration meets mission intelligence.",
  description:
    "An interactive 3D mission-planning environment for the lunar south pole: see how terrain shapes sunlight and Earth visibility at candidate landing sites.",
  hackathon: "NASA Space Apps Challenge 2026",
} as const;

export type NavLink = { label: string; href: string };

/** Primary navigation between the four main product areas. */
export const NAV_LINKS: NavLink[] = [
  { label: "Overview", href: "/" },
  { label: "Mission Control", href: "/mission-control" },
  { label: "Mission", href: "/mission" },
  { label: "Explore", href: "/explore" },
];

export const LAUNCH_HREF = "/explore";

export type Experience = {
  id: "mission" | "explore" | "compare";
  index: string;
  title: string;
  subtitle: string;
  description: string;
  topics?: string[];
  cta: string;
  href: string;
};

export const EXPERIENCES: Experience[] = [
  {
    id: "mission",
    index: "01",
    title: "Guided Mission",
    subtitle: "Understand the environment.",
    description:
      "A planned step-by-step tutorial on sunlight, terrain obstruction, Earth visibility and mission windows. The chapter experience is not interactive yet.",
    topics: [
      "Solar elevation",
      "Terrain obstruction",
      "Earth visibility",
      "Communication windows",
      "Mission lighting conditions",
    ],
    cta: "Begin Tutorial",
    href: "/mission",
  },
  {
    id: "explore",
    index: "02",
    title: "Free Exploration",
    subtitle: "Discover your own landing site.",
    description:
      "Choose a lunar region or coordinates, move around the scene, and change the date and time. Freeplay reads JPL Horizons positions and available LOLA horizon data; the rendered surface remains procedural.",
    cta: "Explore the Moon",
    href: "/explore",
  },
  {
    id: "compare",
    index: "03",
    title: "Mission Comparison",
    subtitle: "Find the strongest candidate.",
    description:
      "The comparison workspace is in progress. Its current page shows the empty layout; adding and analysing multiple missions is not available yet.",
    cta: "Compare Missions",
    href: "/compare",
  },
];

export type DataSource = {
  name: string;
  short: string;
  provider: string;
  role: string;
  href: string;
};

/** Scientific foundation. Status: planned integrations — none are wired in yet. */
export const DATA_SOURCES: DataSource[] = [
  {
    name: "Lunar Orbiter Laser Altimeter",
    short: "LOLA",
    provider: "NASA LRO · PDS Geosciences Node",
    role: "Polar digital elevation models for terrain geometry and horizon computation.",
    href: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
  },
  {
    name: "JPL Horizons",
    short: "Horizons",
    provider: "NASA JPL Solar System Dynamics",
    role: "Ephemerides for the apparent position of the Sun and Earth from a lunar surface site.",
    href: "https://ssd.jpl.nasa.gov/horizons/",
  },
];

export const FOOTER_LINKS = {
  experiences: [
    { label: "Guided Mission", href: "/mission" },
    { label: "Free Exploration", href: "/explore" },
    { label: "Mission Comparison", href: "/compare" },
  ],
  project: [
    { label: "Overview", href: "/" },
    { label: "Mission Control", href: "/mission-control" },
    { label: "Data sources", href: "/mission-control#data-sources" },
  ],
  resources: [
    { label: "LOLA data (PDS)", href: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm" },
    { label: "JPL Horizons", href: "https://ssd.jpl.nasa.gov/horizons/" },
    { label: "NASA Space Apps", href: "https://www.spaceappschallenge.org/" },
  ],
};
