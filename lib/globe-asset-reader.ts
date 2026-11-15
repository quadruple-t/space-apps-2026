import { createHash } from "node:crypto";
import { GLOBE_CHUNK_BYTES, globeAssetPath, validateGlobeAsset, type GlobeAsset } from "./globe-archive";

type ReadDb = { doc(path: string): { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }> } };
export class GlobeAssetNotFound extends Error {}
function bytes(value: unknown): Buffer {
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value && typeof value === "object" && "toUint8Array" in value && typeof value.toUint8Array === "function") return Buffer.from(value.toUint8Array());
  throw new Error("Stored globe chunk has no binary data");
}

export async function readGlobeAsset(db: ReadDb, id: string, requestedHash?: string | null): Promise<{ asset: GlobeAsset; data: Buffer }> {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new GlobeAssetNotFound("Unknown globe asset");
  const snapshot = await db.doc(globeAssetPath(id)).get();
  if (!snapshot.exists) throw new GlobeAssetNotFound("Globe snapshot is not stored yet");
  const asset = validateGlobeAsset(snapshot.data(), id);
  if (requestedHash && requestedHash !== asset.sha256) throw new GlobeAssetNotFound("This globe snapshot version is unavailable");
  const buffers: Buffer[] = [];
  // Bounded reads; paths are validated against this asset's content hash.
  for (let offset = 0; offset < asset.chunks.length; offset += 8) {
    const chunks = await Promise.all(asset.chunks.slice(offset, offset + 8).map((chunk) => db.doc(`catalog/${chunk}`).get()));
    for (let i = 0; i < chunks.length; i++) {
      const record = chunks[i].data();
      const index = offset + i;
      if (!record || record.assetId !== id || record.sha256 !== asset.sha256 || record.index !== index) throw new Error("Missing or mismatched globe chunk");
      const buffer = bytes(record.data);
      const expected = Math.min(GLOBE_CHUNK_BYTES, asset.bytes - index * GLOBE_CHUNK_BYTES);
      if (buffer.length !== expected) throw new Error("Incomplete globe chunk");
      buffers.push(buffer);
    }
  }
  const data = Buffer.concat(buffers);
  if (data.length !== asset.bytes || createHash("sha256").update(data).digest("hex") !== asset.sha256) throw new Error("Globe snapshot checksum mismatch");
  return { asset, data };
}
