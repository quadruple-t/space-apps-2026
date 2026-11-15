/**
 * Function declarations passed to the server prompt template chat (`startChat({ tools })`).
 *
 * Split of responsibilities (see docs/ai/prompt-templates/mission-control-v1-0-0.prompt):
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
import { SITE_FAMILIES } from "@/lib/model/types";
import { MAX_WINDOW_HOURS, MIN_WINDOW_HOURS, TOOL_NAMES, type ToolName } from "./constants";

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
};

/** Names and parameter schemas only; descriptions come from the template. */
export function toolDeclarations(): TemplateFunctionDeclaration[] {
  return TOOL_NAMES.map((name) => ({ name, parameters: DECLARATIONS[name] }));
}
