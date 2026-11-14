import type { LayerId } from "@/lib/freeplay-store";

/** Overlay definitions. Identifiers and their provenance are recorded in data/SOURCES.md. */
export type OverlaySource =
  | { kind: "wmts"; layer: string; format: "image/png" | "image/jpeg"; maximumLevel: number; south?: number; north?: number }
  | { kind: "wms"; layers: string };

export const TREK_TEMPLATE = (layer: string, ext: "jpg" | "png") =>
  `https://trek.nasa.gov/tiles/Moon/EQ/${layer}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`;

export const LUNASERV_WMS = "https://wms.im-ldi.com/";

export const BASE_LAYER = { layer: "LRO_WAC_Mosaic_Global_303ppd_v02", maximumLevel: 8 } as const;

export type LayerDef = {
  id: LayerId;
  label: string;
  description: string;
  sources: OverlaySource[];
  /** CSS gradient or swatches for the legend. */
  legend: { kind: "ramp"; css: string; low: string; high: string } | { kind: "swatch"; color: string; text: string };
  credit: string;
};

export const LAYERS: LayerDef[] = [
  {
    id: "slope",
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
    id: "illumination",
    label: "Illumination % (polar)",
    description: "Share of time each spot is sunlit, poles only. Brighter = more sunlight.",
    sources: [{ kind: "wms", layers: "luna_polar_illumination_pct" }],
    legend: { kind: "ramp", css: "linear-gradient(90deg,#000,#fff)", low: "0%", high: "100%" },
    credit: "LROC WAC polar illumination · Lunaserv",
  },
  {
    id: "psr",
    label: "Permanently shadowed",
    description: "LOLA permanently shadowed regions, 81°S to the pole. Never sunlit, so no solar power, but may hold ice.",
    sources: [{ kind: "wms", layers: "luna_psr_81s" }],
    legend: { kind: "swatch", color: "#ff3fe0", text: "PSR outline" },
    credit: "LOLA PSR shapefile · Lunaserv",
  },
  {
    id: "elevation",
    label: "Elevation",
    description: "WAC GLD100 color-shaded relief.",
    sources: [{ kind: "wms", layers: "luna_wac_dtm" }],
    legend: { kind: "ramp", css: "linear-gradient(90deg,#7a3cff,#2f6bff,#22c7c7,#4fd65a,#f2e93a,#f2902a,#e02424)", low: "low", high: "high" },
    credit: "LROC WAC GLD100 · Lunaserv",
  },
];
