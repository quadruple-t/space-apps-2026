import type { LayerId } from "@/lib/freeplay-store";
import { rampCss, type ColorRamp } from "./colorize";

/** Overlay definitions. Identifiers and their provenance are recorded in docs/SOURCES.md §7. */
export type OverlaySource =
  | { kind: "wmts"; layer: string; format: "image/png" | "image/jpeg"; maximumLevel: number; south?: number; north?: number }
  | { kind: "wms"; layers: string };

export const TREK_TEMPLATE = (layer: string, ext: "jpg" | "png") =>
  `https://trek.nasa.gov/tiles/Moon/EQ/${layer}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`;

export const LUNASERV_WMS = "https://wms.im-ldi.com/";

export const BASE_LAYER = { layer: "LRO_WAC_Mosaic_Global_303ppd_v02", maximumLevel: 8 } as const;


/** Polar illumination share: violet (rarely sunlit) to coral and pale gold (most often sunlit). */
const ILLUMINATION_RAMP: ColorRamp = [
  [0, "#140c34"], [0.2, "#4a2394"], [0.45, "#b23596"], [0.65, "#ff5364"], [0.85, "#ffb36b"], [1, "#fff3c4"],
];

export type LayerDef = {
  id: LayerId;
  category: string;
  label: string;
  description: string;
  sources: OverlaySource[];
  /** Single-band (gray) source: the globe recolours it with this false-colour ramp. */
  colorize?: ColorRamp;
  /** CSS gradient or swatches for the legend. */
  legend: { kind: "ramp"; css: string; low: string; high: string } | { kind: "swatch"; color: string; text: string };
  credit: string;
};

export const LAYERS: LayerDef[] = [
  {
    id: "slope", category: "terrain",
    label: "Slope",
    description: "LOLA surface slope. Steep ground is a landing hazard.",
    sources: [
      { kind: "wmts", layer: "LRO_LOLA_ClrSlope_Global_16ppd", format: "image/png", maximumLevel: 2 },
      { kind: "wmts", layer: "LRO_LOLA_ClrSlope_SPole75S_120m_EQ", format: "image/png", maximumLevel: 6, south: -90, north: -68.9 },
    ],
    legend: { kind: "ramp", css: "linear-gradient(90deg,#4646d8,#2fb84a,#e8e83a,#f0902a,#e8486a)", low: "flat", high: "steep" },
    credit: "NASA Moon Trek · LRO LOLA",
  },
  {
    id: "illumination", category: "weather",
    label: "Illumination % (polar)",
    description: "Share of time each spot is sunlit, poles only. False colour: violet = rarely sunlit, coral to pale gold = most often sunlit.",
    sources: [{ kind: "wms", layers: "luna_polar_illumination_pct" }],
    colorize: ILLUMINATION_RAMP,
    legend: { kind: "ramp", css: rampCss(ILLUMINATION_RAMP), low: "0% sunlit", high: "100%" },
    credit: "LROC WAC polar illumination · Lunaserv",
  },
  {
    id: "psr", category: "water",
    label: "Permanently shadowed",
    description: "LOLA permanently shadowed regions, 81°S to the pole. Never sunlit, so no solar power, but may hold ice.",
    sources: [{ kind: "wms", layers: "luna_psr_81s" }],
    legend: { kind: "swatch", color: "#ff3fe0", text: "PSR outline" },
    credit: "LOLA PSR shapefile · Lunaserv",
  },
  {
    id: "elevation", category: "terrain",
    label: "Elevation",
    description: "WAC GLD100 color-shaded relief.",
    sources: [{ kind: "wms", layers: "luna_wac_dtm" }],
    legend: { kind: "ramp", css: "linear-gradient(90deg,#7a3cff,#2f6bff,#22c7c7,#4fd65a,#f2e93a,#f2902a,#e02424)", low: "low", high: "high" },
    credit: "LROC WAC GLD100 · Lunaserv",
  },
];

export const LAYER_CATEGORIES = [
  { id: "weather", label: "Weather & Environment", description: "Meteoroid impacts, thermal conditions, and sunlight." },
  { id: "human", label: "Human Activity", description: "Exploration history and artifact protection." },
  { id: "water", label: "Water & Ice", description: "Shadow and cold-trap indicators, not confirmed ice deposits." },
  { id: "mining", label: "Mining & Resources", description: "Resource prospecting context, not reserves or active mines." },
  { id: "terrain", label: "Terrain", description: "Surface relief and landing hazards." },
];

const vectorLayer = (id: LayerId, category: string, label: string, description: string, color: string, text: string): LayerDef => ({
  id, category, label, description, sources: [],
  legend: { kind: "swatch", color, text }, credit: "Lunaris360 catalog · curated source data",
});
LAYERS.push(
  vectorLayer("landings", "human", "Landing sites", "Crewed and robotic landing locations in the catalog. Approximate coordinates remain approximate.", "#f0ebf7", "Landing location"),
  vectorLayer("impacts", "human", "Impact & rover sites", "Cataloged impacts and rover final positions.", "#ff9955", "Impact / rover location"),
  vectorLayer("heritage", "human", "Heritage boundaries", "Source-backed artifact protection boundaries. Zoom in to see their true scale.", "#ffcf66", "Heritage boundary"),
  vectorLayer("coldTraps", "water", "Cold-trap regions", "Stored PSR polygons with a nonzero Diviner cold-trap fraction (annual maximum below 110 K). Color does not imply confirmed ice.", "#55ddee", "Cold-trap candidate"),
  vectorLayer("resources", "mining", "Resource prospecting regions", "Stored shadowed-region footprints for ice prospecting context. No ore grade, reserve estimate, or extraction suitability is available.", "#69e6aa", "PSR resource context"),
  vectorLayer("artemis", "mining", "Artemis candidate regions", "Catalog reference points for candidate exploration regions, not precise landing targets or mining sites.", "#a986ff", "Candidate reference point"),
);

/** Identifiers and coverage verified against Lunaserv GetCapabilities, 2026-11-14. */
const scienceMap = (id: LayerId, category: string, label: string, layer: string, description: string, credit: string, legend: LayerDef["legend"]): LayerDef => ({
  id, category, label, description, sources: [{ kind: "wms", layers: layer }], credit, legend,
});
const nativePalette = (text: string): LayerDef["legend"] => ({ kind: "swatch", color: "#a986ff", text });
LAYERS.push(
  scienceMap("titanium", "mining", "Titanium oxide · TiO₂", "luna_wac_tio2_color",
    "LROC WAC surface TiO₂ abundance estimate (weight %), 70°S–70°N. Derived from UV/visible reflectance; not a reserve estimate.",
    "LROC WAC · Sato et al. (2017) · Lunaserv", nativePalette("Source colors · 1% abundance bins")),
  scienceMap("iron", "mining", "Iron oxide · FeO", "luna_kaguya_feo",
    "Kaguya surface FeO abundance estimate (weight %), 50°S–50°N. Mineral-bound iron, not a map of metallic iron deposits.",
    "JAXA SELENE/Kaguya · Lemelin et al. (2016) · Lunaserv",
    { kind: "ramp", css: "linear-gradient(90deg,#000080,#ffff00)", low: "≤2.5 wt%", high: ">22.5 wt%" }),
  scienceMap("thorium", "mining", "Thorium abundance", "luna_lp_deconvolved_thorium",
    "Lunar Prospector gamma-ray thorium abundance, spatially deconvolved at 2 pixels per degree. A regional composition indicator; does not establish extractability.",
    "Lunar Prospector · Lawrence et al. (2007) · Lunaserv",
    { kind: "ramp", css: "linear-gradient(90deg,#101010,#1010f0,#5010b0,#f01010,#f0b010,#f0f010,#fff)", low: "0", high: "17 ppm" }),
  scienceMap("olivine", "mining", "Olivine abundance", "luna_kaguya_olivine",
    "Kaguya surface olivine abundance, 50°S–50°N. A magnesium/iron silicate mineral indicator; source palette retained.",
    "JAXA SELENE/Kaguya · Lemelin et al. (2016) · Lunaserv", nativePalette("Dark blue: lower · yellow: higher")),
  scienceMap("plagioclase", "mining", "Plagioclase abundance", "luna_kaguya_plagioclase",
    "Kaguya surface plagioclase abundance, 50°S–50°N. Composition context for calcium/aluminum-bearing silicates, not recoverable metal quantities.",
    "JAXA SELENE/Kaguya · Lemelin et al. (2016) · Lunaserv", nativePalette("Dark blue: lower · yellow: higher")),
  scienceMap("pyroxene", "mining", "Clinopyroxene abundance", "luna_kaguya_clinopyroxene",
    "Kaguya surface clinopyroxene abundance, 50°S–50°N. Mineral composition context rather than extraction suitability.",
    "JAXA SELENE/Kaguya · Lemelin et al. (2016) · Lunaserv", nativePalette("Source mineral-abundance palette")),
  scienceMap("silicates", "mining", "Silicate mineralogy", "luna_diviner_silicate",
    "Diviner Christiansen-feature wavelength, a bulk silicate composition proxy. This is a spectral measurement, not an abundance or ore-grade map.",
    "LRO Diviner · Greenhagen et al. (2010) · Lunaserv",
    { kind: "ramp", css: "linear-gradient(90deg,#0000ff,#ff0000)", low: "7.80 µm", high: "8.55 µm" }),
  scienceMap("iceDepth", "mining", "Ice-stability depth · south pole", "luna_diviner_sp_ice_depth_today",
    "Modeled depth at which ice is thermally stable under the current pole orientation, 240 m/pixel. Stable conditions do not confirm ice is present. Static model, not simulation-time conditions.",
    "LRO Diviner · Siegler et al. (2016) · Lunaserv", nativePalette("Source ice-stability depth palette")),
  scienceMap("temperatureMax", "weather", "Maximum temperature anomaly", "luna_diviner_tbol_max",
    "Historical Diviner maximum-temperature anomaly relative to the mean at each latitude, 2 pixels/degree. Not absolute temperature or a live forecast.",
    "LRO Diviner · Williams et al. (2017) · Lunaserv",
    { kind: "ramp", css: "linear-gradient(90deg,#1010f0,#10b0f0,#10f0f0,#90f070,#f0f010,#f09010,#f01010,#901010)", low: "−25 K anomaly", high: "+25 K" }),
  scienceMap("temperatureMin", "weather", "Minimum temperature anomaly", "luna_diviner_tbol_min",
    "Historical Diviner minimum-temperature anomaly relative to the mean at each latitude, 2 pixels/degree. Static observations, independent of simulation date.",
    "LRO Diviner · Williams et al. (2017) · Lunaserv",
    { kind: "ramp", css: "linear-gradient(90deg,#1010f0,#10b0f0,#10f0f0,#90f070,#f0f010,#f09010,#f01010,#901010)", low: "−10 K anomaly", high: "+10 K" }),
  scienceMap("impactHistory", "weather", "Meteoroid impact history · craters", "luna_copernican_craters",
    "Natural impact craters larger than 10 km and younger than ~1.1 billion years, 60°S–60°N. Shows long-term impact history, not current meteor-storm hotspots or future impact probability.",
    "LROC · Ravi et al. (2016) · Lunaserv", nativePalette("Mapped Copernican-age crater features")),
);

LAYERS.push({
  ...vectorLayer("meteorStreams", "weather", "Meteor showers · exposure model",
    "Select a published 2026 shower snapshot to see the hemisphere facing its incoming stream. Approximate geometry, not a map of recurring storms or measured impact rates.", "#ff8833", "Stream-facing hemisphere · modeled"),
  credit: "TUM 2026 radiants · NASA/JPL NAIF lunar orientation",
});
