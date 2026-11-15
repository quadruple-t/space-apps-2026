/** Public catalog documents for bounded, versioned globe snapshots and scientific input archives. */
export const GLOBE_ARCHIVE_DOC = "catalog/globe-assets-v1";
export const GLOBE_CHUNK_BYTES = 240 * 1024;
export type GlobeAsset = {
  id: string;
  kind: "globe-asset";
  contentType: "image/png" | "image/jpeg" | "application/gzip";
  bytes: number;
  sha256: string;
  chunks: string[];
  width?: number;
  height?: number;
  rectangle?: [number, number, number, number];
  layerId?: string;
  sourceIndex?: number;
  source: Record<string, unknown>;
};
export type GlobeArchive = { version: 1; generatedAt: string; assets: GlobeAsset[]; scope: string };
export const globeAssetPath = (id: string) => `catalog/globe-asset-${id}`;
export const globeAssetUrl = (asset: Pick<GlobeAsset, "id" | "sha256">) =>
  `/api/v1/globe/assets/${asset.id}?sha256=${asset.sha256}`;

export function validateGlobeAsset(value: unknown, expectedId: string): GlobeAsset {
  const asset = value as GlobeAsset | null;
  if (!asset || asset.kind !== "globe-asset" || asset.id !== expectedId || !/^[a-zA-Z0-9_-]{1,80}$/.test(asset.id)
    || !["image/png", "image/jpeg", "application/gzip"].includes(asset.contentType)
    || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 64 * 1024 * 1024
    || !/^[a-f0-9]{64}$/.test(asset.sha256)
    || !Array.isArray(asset.chunks) || asset.chunks.length !== Math.ceil(asset.bytes / GLOBE_CHUNK_BYTES)
    || asset.chunks.some((chunk, i) => chunk !== `globe-chunk-${asset.id}-${asset.sha256.slice(0, 16)}-${i}`)) {
    throw new Error("Invalid stored globe asset manifest");
  }
  return asset;
}
