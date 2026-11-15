/**
 * Function declarations passed to the server prompt template chat (`startChat({ tools })`).
 *
 * Split of responsibilities (see docs/ai/prompt-templates/mission-control-v1-1-0.prompt):
 *  - the template's frontmatter `tools:` lists each function name and its description (the SDK types
 *    forbid `description` on template function declarations, so descriptions live server-side);
 *  - these declarations supply only the parameter schemas, which override any schema in the template.
 * Keeping parameters here puts the enums and bounds next to the validators in tool-validation.ts.
 *
 * Only attributes Firebase documents as supported for function declarations are used (type, description,
 * properties, items, enum, nullable, format). `minimum`, `maximum`, `default`, `optional` and `oneOf` are
 * documented as unsupported, so numeric and array bounds are stated in descriptions and enforced by the validators.
 */
import { Schema, type TemplateFunctionDeclaration } from "firebase/ai";
import { METRICS } from "@/lib/comparison";
import { SITE_FAMILIES } from "@/lib/model/types";
import { RANK_CRITERIA } from "@/lib/science/rank";
import {
  MAX_ISP_S, MAX_MISSION_HOURS, MAX_PANEL_AREA_M2, MAX_PAYLOAD_KG, MAX_RADIUS_KM, MAX_RANK_SITE_IDS, MAX_RANK_WINDOWS, MAX_WINDOW_HOURS,
  MIN_ISP_S, MIN_PANEL_AREA_M2, MIN_PAYLOAD_KG, MIN_RADIUS_KM, MIN_WINDOW_HOURS, TOOL_NAMES, UI_COMPARE_GRAPHS, UI_GRAPH_TABS, UI_LAYERS,
  UI_PAGES, UI_SCREENS, UI_SPEEDS, UI_TRAJECTORY_TYPES, type ToolName,
} from "./constants";

const METRIC_KEYS = METRICS.map((m) => m.key);

const locationProps = {
  useCurrentSite: Schema.boolean({ description: "true to use the site currently selected in Freeplay ('this site')." }),
  siteId: Schema.string({ description: "Catalog site id from list_catalog_sites, for a named catalog site. Not for the current Freeplay site unless it is a catalog site." }),
  latDeg: Schema.number({ description: "Planetocentric latitude in degrees, -90 to 90. Use with lonDeg for a custom point." }),
  lonDeg: Schema.number({ description: "East-positive longitude in degrees, -180 to 360. Use with latDeg." }),
};
const locationOptional = Object.keys(locationProps);

const timeProp = (name: string, what: string) => ({
  [name]: Schema.string({ description: `${what} as ISO 8601 UTC, for example 2027-03-01T12:00:00Z. Must be within 2026-01-01 to 2030-12-31. Omit to use the Freeplay mission time.` }),
});

const DECLARATIONS: Record<ToolName, TemplateFunctionDeclaration["parameters"]> = {
  list_catalog_sites: Schema.object({
    properties: {
      query: Schema.string({ description: "Case-insensitive text matched against site name or mission, at most 60 characters." }),
      family: Schema.enumString({ enum: [...SITE_FAMILIES], description: "Exact site family filter." }),
    },
    optionalProperties: ["query", "family"],
  }),
  get_catalog_site: Schema.object({
    properties: { siteId: Schema.string({ description: "Catalog site id." }) },
  }),
  list_story_chapters: Schema.object({ properties: {} }),
  get_sun_earth_position: Schema.object({
    properties: { ...locationProps, ...timeProp("time", "Instant to evaluate") },
    optionalProperties: [...locationOptional, "time"],
  }),
  get_horizon_profile: Schema.object({
    properties: { ...locationProps },
    optionalProperties: locationOptional,
  }),
  get_sunlight_and_earth_visibility: Schema.object({
    properties: {
      ...locationProps,
      ...timeProp("start", "Start of the window"),
      durationHours: Schema.number({ description: `Window length in hours, ${MIN_WINDOW_HOURS} to ${MAX_WINDOW_HOURS}. Omit to use the Freeplay mission duration (capped).` }),
    },
    optionalProperties: [...locationOptional, "start", "durationHours"],
  }),
  get_sun_earth_rise_set: Schema.object({
    properties: {
      ...locationProps,
      ...timeProp("start", "Start of a 24-hour window"),
      stepMinutes: Schema.integer({ description: "Sampling step in minutes, 1 to 60. Rise and set times are accurate to one step. Default 10." }),
    },
    optionalProperties: [...locationOptional, "start", "stepMinutes"],
  }),
  compare_sites: Schema.object({
    properties: {
      siteIds: Schema.array({ items: Schema.string({ description: "Catalog site id, or 'current' for the selected Freeplay site when it is a catalog site." }), description: "Two or three catalog site ids." }),
      ...timeProp("start", "Start of the window"),
      durationHours: Schema.number({ description: `Window length in hours, ${MIN_WINDOW_HOURS} to ${MAX_WINDOW_HOURS}.` }),
    },
    optionalProperties: ["start", "durationHours"],
  }),
  rank_sites: Schema.object({
    properties: {
      ...timeProp("start", "Start of the first window"),
      durationHours: Schema.number({ description: `Length of each window in hours, ${MIN_WINDOW_HOURS} to ${MAX_WINDOW_HOURS}. Omit for ${MAX_WINDOW_HOURS} (about one lunar day).` }),
      windows: Schema.integer({ description: `Number of windows, 1 to ${MAX_RANK_WINDOWS}, each starting about three months after the previous. Use ${MAX_RANK_WINDOWS} for consistent or year-round lighting.` }),
      family: Schema.enumString({ enum: [...SITE_FAMILIES], description: "Only rank sites of this family." }),
      siteIds: Schema.array({ items: Schema.string({ description: "Catalog site id." }), description: `Only rank these catalog sites (up to ${MAX_RANK_SITE_IDS}). Omit to rank the whole catalog.` }),
      weights: Schema.object({
        properties: Object.fromEntries(RANK_CRITERIA.map((c) => [c, Schema.number({ description: `Weight 0 to 10 for ${c}.` })])),
        optionalProperties: [...RANK_CRITERIA],
        description: "How much each criterion matters, 0 to 10. sunlight (more Sun), darkness (shorter longest darkness), earth (more Earth visibility), slope (flatter), ice (closer cold trap), iron (FeO), titanium (TiO2), aluminium (Al2O3), calcium (CaO). Omit for sunlight, darkness, earth and slope equally.",
      }),
    },
    optionalProperties: ["start", "durationHours", "windows", "family", "siteIds", "weights"],
  }),
  get_surface_composition: Schema.object({
    properties: { ...locationProps },
    optionalProperties: locationOptional,
  }),
  show_in_freeplay: Schema.object({
    properties: {
      screen: Schema.enumString({ enum: [...UI_SCREENS], description: "Freeplay screen to show: globe (Moon map) or orbit (Sun/Earth orbit view with graphs)." }),
      page: Schema.enumString({ enum: [...UI_PAGES], description: "Offer a button to the surface drive for the selected site and time. Does not leave the chat." }),
      siteId: Schema.string({ description: "Catalog site id from list_catalog_sites to select on the globe and fly to." }),
      latDeg: Schema.number({ description: "Latitude in degrees, -90 to 90, to select a custom point. Use with lonDeg, never with siteId." }),
      lonDeg: Schema.number({ description: "East-positive longitude in degrees, -180 to 360. Use with latDeg." }),
      time: Schema.string({ description: "Mission time to show, ISO 8601 UTC, within 2026-01-01 to 2030-12-31. Moves the Sun and Earth in the orbit view." }),
      playing: Schema.boolean({ description: "true to play the mission clock, false to pause it." }),
      speed: Schema.integer({ description: `Playback speed multiplier, one of ${UI_SPEEDS.join(", ")}.` }),
      layersOn: Schema.array({ items: Schema.enumString({ enum: [...UI_LAYERS] }), description: "Globe layers to switch on." }),
      layersOff: Schema.array({ items: Schema.enumString({ enum: [...UI_LAYERS] }), description: "Globe layers to switch off." }),
      showCatalog: Schema.boolean({ description: "Show or hide the Lunaris360 catalog site pins on the globe." }),
      graphTab: Schema.enumString({ enum: [...UI_GRAPH_TABS], description: "Graph tab to show on the orbit screen." }),
    },
    optionalProperties: ["screen", "page", "siteId", "latDeg", "lonDeg", "time", "playing", "speed", "layersOn", "layersOff", "showCatalog", "graphTab"],
  }),
};

/** Names and parameter schemas only; descriptions come from the template. */
export function toolDeclarations(): TemplateFunctionDeclaration[] {
  return TOOL_NAMES.map((name) => ({ name, parameters: DECLARATIONS[name] }));
}
