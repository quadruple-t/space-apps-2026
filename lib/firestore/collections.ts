/** Firestore collection names (single source of truth for services, seed script and tests). */
export const COLLECTIONS = {
  sites: "sites",
  storyChapters: "storyChapters",
  missionProfiles: "missionProfiles",
  protectionZones: "protectionZones",
  landerPresets: "landerPresets",
  facts: "facts",
  validationChecks: "validationChecks",
  dataSources: "dataSources",
  ephemerisGlobal: "ephemerisGlobal",
  terrainGrid: "terrainGrid",
  psrLayer: "psrLayer",
  compositionGrid: "compositionGrid",
  demo: "demo",
  catalog: "catalog",
  users: "users",
} as const;

/** Public-read, client-write-denied collections seeded with the Admin SDK. */
export const STATIC_COLLECTIONS = [
  COLLECTIONS.sites,
  COLLECTIONS.storyChapters,
  COLLECTIONS.missionProfiles,
  COLLECTIONS.protectionZones,
  COLLECTIONS.landerPresets,
  COLLECTIONS.facts,
  COLLECTIONS.validationChecks,
  COLLECTIONS.dataSources,
  COLLECTIONS.ephemerisGlobal,
  COLLECTIONS.terrainGrid,
  COLLECTIONS.psrLayer,
  COLLECTIONS.compositionGrid,
  COLLECTIONS.demo,
  COLLECTIONS.catalog,
] as const;

/** sites/{siteId}/terrain/{TERRAIN_DOC_ID} */
export const TERRAIN_SUBCOLLECTION = "terrain";
export const TERRAIN_DOC_ID = "v1";
export const PROGRESS_DOC_ID = "state";
export const DEFAULT_PSR_LAYER_ID = "south-1km2";
