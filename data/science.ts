/**
 * Methodology copy shared by the landing page and /science.
 * Describes the PLANNED pipeline — nothing here is implemented yet.
 */

export const METHOD_STEPS = [
  {
    title: "Sample the terrain",
    body: "Read elevations around the site from LOLA polar digital elevation models.",
  },
  {
    title: "Build the horizon mask",
    body: "For every compass direction, find the highest angle at which terrain blocks the sky.",
  },
  {
    title: "Test the Sun and Earth",
    body: "Compare their apparent positions from JPL Horizons against the mask, moment by moment.",
  },
];

export const SCIENCE_TOPICS = [
  {
    title: "Lunar topography and horizon obstruction",
    body: "Crater rims and massifs, not latitude alone, decide what a site can see.",
  },
  {
    title: "Solar elevation and illumination",
    body: "Whether the Sun's disc clears the local horizon, and for how long.",
  },
  {
    title: "Earth visibility and line of sight",
    body: "Whether Earth stands above the terrain for direct-to-Earth communication.",
  },
];
