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

export type NavLink = { label: string; href: string; sectionId?: string };

/** Primary nav — anchors resolve against the landing page from any route. */
export const NAV_LINKS: NavLink[] = [
  { label: "Overview", href: "/#overview", sectionId: "overview" },
  { label: "The Mission", href: "/#mission", sectionId: "mission" },
  { label: "How It Works", href: "/#how-it-works", sectionId: "how-it-works" },
  { label: "Explore", href: "/#explore", sectionId: "explore" },
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
      "An interactive tutorial that teaches you how to read the lunar south pole the way a mission planner does.",
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
      "Select coordinates, move across the terrain, change the simulation date and analyse your own candidate landing locations.",
    cta: "Explore the Moon",
    href: "/explore",
  },
  {
    id: "compare",
    index: "03",
    title: "Mission Comparison",
    subtitle: "Find the strongest candidate.",
    description:
      "Compare multiple landing sites and dates side by side with synchronised 3D views and mission viability metrics.",
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
    { label: "Overview", href: "/#overview" },
    { label: "The science", href: "/science" },
    { label: "Data sources", href: "/science#data-sources" },
  ],
  resources: [
    { label: "LOLA data (PDS)", href: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm" },
    { label: "JPL Horizons", href: "https://ssd.jpl.nasa.gov/horizons/" },
    { label: "NASA Space Apps", href: "https://www.spaceappschallenge.org/" },
  ],
};
