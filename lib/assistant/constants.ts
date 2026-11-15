/**
 * Mission Control assistant: limits and shared constants. Pure module (no browser or Firebase imports)
 * so the validators, result shapers and tests can use it directly.
 */

export const ASSISTANT_NAME = "Mission Control";

/** Server prompt template ID the code expects. Create it in the Firebase console (see docs/ai/prompt-templates). */
export const DEFAULT_TEMPLATE_ID = "mission-control-v1-0-0";

// Abuse and cost controls
export const MAX_INPUT_CHARS = 500;
/** Text messages (user + assistant) replayed to the model each turn. Tool payloads are never replayed. */
export const MAX_HISTORY_MESSAGES = 8;
export const MAX_HISTORY_MESSAGE_CHARS = 1500;
/** Rounds of tool execution allowed for one user message. */
export const MAX_TOOL_ROUNDS = 4;
export const MAX_CALLS_PER_ROUND = 4;
export const TOOL_TIMEOUT_MS = 15_000;
/** A turn with no progress at all (no text, no tool activity) for this long is stopped with an error. */
export const TURN_INACTIVITY_MS = 45_000;
export const MAX_TOOL_RESULT_CHARS = 7_000;
export const RATE_MIN_INTERVAL_MS = 2_500;
export const RATE_WINDOW_MS = 10 * 60_000;
export const RATE_MAX_IN_WINDOW = 15;

/** Stored JPL Horizons main series (docs/API.md). Mirrors MAIN_SERIES_START/END in lib/ephemeris. */
export const COVERAGE_START_ISO = "2026-01-01T00:00:00.000Z";
export const COVERAGE_END_ISO = "2030-12-31T23:00:00.000Z";
export const COVERAGE_LABEL = "Stored JPL Horizons ephemeris, 2026-01-01 to 2030-12-31 UTC";

export const MIN_WINDOW_HOURS = 1;
export const MAX_WINDOW_HOURS = 720;
export const DEFAULT_STEP_MINUTES = 10;

export const TOOL_NAMES = [
  "list_catalog_sites",
  "get_catalog_site",
  "list_story_chapters",
  "get_sun_earth_position",
  "get_horizon_profile",
  "get_sunlight_and_earth_visibility",
  "get_sun_earth_rise_set",
  "compare_sites",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_LABELS: Record<ToolName, string> = {
  list_catalog_sites: "Catalog sites",
  get_catalog_site: "Catalog site detail",
  list_story_chapters: "Story chapters",
  get_sun_earth_position: "Sun/Earth position",
  get_horizon_profile: "Horizon profile",
  get_sunlight_and_earth_visibility: "Sunlight and Earth visibility",
  get_sun_earth_rise_set: "Sun/Earth rise and set",
  compare_sites: "Site comparison",
};

/** Shown while a tool runs. */
export const TOOL_PROGRESS: Record<ToolName, string> = {
  list_catalog_sites: "Searching the site catalog…",
  get_catalog_site: "Reading catalog site data…",
  list_story_chapters: "Reading story chapters…",
  get_sun_earth_position: "Checking Sun and Earth position…",
  get_horizon_profile: "Checking horizon data…",
  get_sunlight_and_earth_visibility: "Checking sunlight and Earth visibility…",
  get_sun_earth_rise_set: "Checking rise and set times…",
  compare_sites: "Comparing sites…",
};

export function isToolName(name: unknown): name is ToolName {
  return typeof name === "string" && (TOOL_NAMES as readonly string[]).includes(name);
}

// Fixed wording. Tool results carry these as `mustSay`, and the UI shows them as notices regardless of model output.
export const FALLBACK_WORDING =
  "No terrain mask covers this location, so this uses a smooth-sphere horizon. It is not terrain-derived, and the sunlight and visibility shares are upper bounds.";
export const GRID_CELL_WORDING =
  "The horizon comes from the nearest LOLA polar grid cell, not a mask computed for this exact point.";
export const UNRECOGNISED_HORIZON_WORDING =
  "The horizon source label was not recognised, so this is not described as terrain-derived.";
export const NO_COVERAGE_WORDING =
  "That time is outside the stored JPL Horizons ephemeris (2026-01-01 to 2030-12-31 UTC), so there is no data for it.";
export const TOOL_LIMIT_WORDING =
  `I reached the limit of ${MAX_TOOL_ROUNDS} data lookups for one question, so this answer may be incomplete. Ask a narrower follow-up to continue.`;
export const INVALID_REQUEST_WORDING =
  "Mission Control couldn't form a valid data request for that question, so it has no data to answer from. Try rephrasing, or select a site first.";
export const UNGROUNDED_WORDING =
  "This reply did not use a data lookup. Check any figures against the app before relying on them.";
export function failureWording(message: string): string {
  return `I couldn't retrieve that from the Lunaris360 data service (${message}). I won't fill the gap from memory.`;
}
