/**
 * Function declarations passed to the server prompt template chat (`startChat({ tools })`).
 *
 * Split of responsibilities (see docs/ai/prompt-templates/mission-control-v1-2-0.prompt):
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
  MAX_SURFACE_OPS, MIN_ISP_S, MIN_PANEL_AREA_M2, MIN_PAYLOAD_KG, MIN_RADIUS_KM, MIN_WINDOW_HOURS, SURFACE_ACTIONS, SURFACE_TYPES, SURFACE_VIEW_MODES, TOOL_NAMES, UI_COMPARE_GRAPHS, UI_GRAPH_TABS, UI_LAYERS,
  UI_PAGES, UI_SCREENS, UI_SPEEDS, UI_TRAJECTORY_TYPES, type ToolName,
} from "./constants";

const METRIC_KEYS = METRICS.map((m) => m.key);

const locationProps = {
  useCurrentSite: Schema.boolean({ description: "true to use the site currently selected in Open Exploration ('this site')." }),
  siteId: Schema.string({ description: "Catalog site id from list_catalog_sites, for a named catalog site. Not for the current Open Exploration site unless it is a catalog site." }),
  latDeg: Schema.number({ description: "Planetocentric latitude in degrees, -90 to 90. Use with lonDeg for a custom point." }),
  lonDeg: Schema.number({ description: "East-positive longitude in degrees, -180 to 360. Use with latDeg." }),
};
const locationOptional = Object.keys(locationProps);

const timeProp = (name: string, what: string) => ({
  [name]: Schema.string({ description: `${what} as ISO 8601 UTC, for example 2027-03-01T12:00:00Z. Must be within 2026-01-01 to 2030-12-31. Omit to use the Open Exploration mission time.` }),
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
  list_saved_sites: Schema.object({ properties: {} }),
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
      durationHours: Schema.number({ description: `Window length in hours, ${MIN_WINDOW_HOURS} to ${MAX_WINDOW_HOURS}. Omit to use the Open Exploration mission duration (capped).` }),
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
      siteIds: Schema.array({ items: Schema.string({ description: "Catalog site id, a saved preset id from list_saved_sites, or 'current' for the selected Open Exploration site when it is a catalog site." }), description: "Two or three site ids (catalog ids, saved preset ids or 'current')." }),
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
  get_launch_plan: Schema.object({
    properties: {
      ...timeProp("launchTime", "Launch instant"),
      trajectoryType: Schema.enumString({ enum: [...UI_TRAJECTORY_TYPES], description: "direct for an Apollo-style 3 to 5 day transfer, low-energy for the illustrative long loop. Omit for the planner setting." }),
      payloadKg: Schema.number({ description: `Landed dry mass in kg, ${MIN_PAYLOAD_KG} to ${MAX_PAYLOAD_KG}. Omit for the planner setting.` }),
      ispS: Schema.number({ description: `Engine specific impulse in seconds, ${MIN_ISP_S} to ${MAX_ISP_S}. Omit for the planner setting.` }),
      includeArtemisReference: Schema.boolean({ description: "true to include the Artemis I shape reference, as the planner overlay does." }),
    },
    optionalProperties: ["launchTime", "trajectoryType", "payloadKg", "ispS", "includeArtemisReference"],
  }),
  get_solar_power: Schema.object({
    properties: {
      ...locationProps,
      ...timeProp("start", "Start of the window"),
      durationHours: Schema.number({ description: `Window length in hours, ${MIN_WINDOW_HOURS} to ${MAX_WINDOW_HOURS}.` }),
      panelAreaM2: Schema.number({ description: `Panel area in m², ${MIN_PANEL_AREA_M2} to ${MAX_PANEL_AREA_M2}. Omit for the panel setting in Open Exploration.` }),
      panelEfficiency: Schema.number({ description: "Panel efficiency as a fraction, 0.01 to 1. Omit for the panel setting in Open Exploration." }),
    },
    optionalProperties: [...locationOptional, "start", "durationHours", "panelAreaM2", "panelEfficiency"],
  }),
  get_meteor_stream_exposure: Schema.object({
    properties: {
      stream: Schema.string({ description: "Meteor-stream name from the stored 2026 reference sheet, for example Geminids. Omit to list every stored stream." }),
      ...locationProps,
    },
    optionalProperties: ["stream", ...locationOptional],
  }),
  show_in_freeplay: Schema.object({
    properties: {
      screen: Schema.enumString({ enum: [...UI_SCREENS], description: "Open Exploration screen to show: globe (Moon map), orbit (graphs), launch (launch window planner) or compare (Mission comparison)." }),
      page: Schema.enumString({ enum: [...UI_PAGES], description: "Offer a button to the surface drive for the selected site and time. Does not leave the chat." }),
      siteId: Schema.string({ description: "Catalog site id from list_catalog_sites to select on the globe and fly to." }),
      savedSiteId: Schema.string({ description: "Saved preset id from list_saved_sites to select. Use instead of siteId or latDeg/lonDeg." }),
      latDeg: Schema.number({ description: "Latitude in degrees, -90 to 90, to select a custom point. Use with lonDeg, never with siteId or savedSiteId." }),
      lonDeg: Schema.number({ description: "East-positive longitude in degrees, -180 to 360. Use with latDeg." }),
      time: Schema.string({ description: "Mission time to show, ISO 8601 UTC, within 2026-01-01 to 2030-12-31. Moves the Sun and Earth in the orbit view." }),
      playing: Schema.boolean({ description: "true to play the mission clock, false to pause it." }),
      speed: Schema.integer({ description: `Playback speed multiplier, one of ${UI_SPEEDS.join(", ")}.` }),
      durationHours: Schema.number({ description: `Mission window length in hours, 1 to ${MAX_MISSION_HOURS}.` }),
      radiusKm: Schema.number({ description: `Analysis radius around the selected site in km, ${MIN_RADIUS_KM} to ${MAX_RADIUS_KM}.` }),
      layersOn: Schema.array({ items: Schema.enumString({ enum: [...UI_LAYERS] }), description: "Globe layers to switch on." }),
      layersOff: Schema.array({ items: Schema.enumString({ enum: [...UI_LAYERS] }), description: "Globe layers to switch off." }),
      showCatalog: Schema.boolean({ description: "Show or hide the Lunaris360 catalog site pins on the globe." }),
      graphTab: Schema.enumString({ enum: [...UI_GRAPH_TABS], description: "Graph tab to show on the orbit screen." }),
      meteorStream: Schema.string({ description: "Meteor-stream name to select for the meteor-shower exposure layer, for example Geminids." }),
      panelAreaM2: Schema.number({ description: `Solar panel area in m², ${MIN_PANEL_AREA_M2} to ${MAX_PANEL_AREA_M2}.` }),
      panelEfficiency: Schema.number({ description: "Solar panel efficiency as a fraction, 0.01 to 1." }),
      launchTime: Schema.string({ description: "Launch window instant to show in the planner, ISO 8601 UTC, within 2026-01-01 to 2030-12-31." }),
      trajectoryType: Schema.enumString({ enum: [...UI_TRAJECTORY_TYPES], description: "Trajectory type in the launch planner." }),
      payloadKg: Schema.number({ description: `Landed dry mass in kg, ${MIN_PAYLOAD_KG} to ${MAX_PAYLOAD_KG}.` }),
      ispS: Schema.number({ description: `Engine specific impulse in seconds, ${MIN_ISP_S} to ${MAX_ISP_S}.` }),
      showArtemisReference: Schema.boolean({ description: "Show or hide the Artemis I shape overlay in the launch planner." }),
      compareSiteA: Schema.string({ description: "Saved preset id for comparison slot A." }),
      compareSiteB: Schema.string({ description: "Saved preset id for comparison slot B." }),
      compareGraph: Schema.enumString({ enum: [...UI_COMPARE_GRAPHS], description: "Which quantity the comparison graph draws." }),
      compareMetrics: Schema.array({ items: Schema.enumString({ enum: METRIC_KEYS }), description: "Comparison table metric rows to show, replacing the current selection." }),
    },
    optionalProperties: [
      "screen", "page", "siteId", "savedSiteId", "latDeg", "lonDeg", "time", "playing", "speed", "durationHours", "radiusKm",
      "layersOn", "layersOff", "showCatalog", "graphTab", "meteorStream", "panelAreaM2", "panelEfficiency",
      "launchTime", "trajectoryType", "payloadKg", "ispS", "showArtemisReference",
      "compareSiteA", "compareSiteB", "compareGraph", "compareMetrics",
    ],
  }),
  edit_surface_setup: Schema.object({
    properties: {
      operations: Schema.array({
        description: `Up to ${MAX_SURFACE_OPS} edits, applied in order. Targets are resolved against the setup as it was before this call.`,
        items: Schema.object({
          properties: {
            action: Schema.enumString({ enum: [...SURFACE_ACTIONS], description: "place a new object, move or rotate a placed one, or remove one." }),
            type: Schema.enumString({ enum: [...SURFACE_TYPES], description: "What to place (place only): solar array, rover buggy, dome habitat, modules outpost, inflatable habitat or comms mast." }),
            target: Schema.string({ description: "Label of the placed object exactly as listed in the setup, for example Solar panel array 2 (move and remove only)." }),
            eastM: Schema.number({ description: "Metres east of the site centre (negative is west). Give with northM." }),
            northM: Schema.number({ description: "Metres north of the site centre (negative is south). Give with eastM." }),
            headingDeg: Schema.number({ description: "Facing in degrees, 0 to 360 (optional; move can use it alone to rotate)." }),
          },
          optionalProperties: ["type", "target", "eastM", "northM", "headingDeg"],
        }),
      }),
      clearAll: Schema.boolean({ description: "true to remove every placed object first; only place operations may follow it." }),
      viewMode: Schema.enumString({ enum: [...SURFACE_VIEW_MODES], description: "first-person to walk the surface, birds-eye for the overhead view." }),
      goTo: Schema.string({ description: "Label of a placed object to bring the camera to." }),
    },
    optionalProperties: ["operations", "clearAll", "viewMode", "goTo"],
  }),
};

/** Names and parameter schemas only; descriptions come from the template. */
export function toolDeclarations(): TemplateFunctionDeclaration[] {
  return TOOL_NAMES.map((name) => ({ name, parameters: DECLARATIONS[name] }));
}
