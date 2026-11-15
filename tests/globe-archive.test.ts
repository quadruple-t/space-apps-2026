import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { Bytes } from "firebase/firestore";
import { GLOBE_CHUNK_BYTES, globeAssetPath, globeAssetUrl, globeDisplayAsset, validateGlobeAsset, type GlobeArchive, type GlobeAsset } from "@/lib/globe-archive";
import { GlobeAssetNotFound, readGlobeAsset } from "@/lib/globe-asset-reader";
import { readCachedGlobeAsset } from "@/lib/globe-asset-cache";

function fixture(data: Buffer) {
  const sha256 = createHash("sha256").update(data).digest("hex");
  const id = "temperatureMax-0";
  const chunks = Array.from({ length: Math.ceil(data.length / GLOBE_CHUNK_BYTES) }, (_, i) => `globe-chunk-${id}-${sha256.slice(0, 16)}-${i}`);
  const asset: GlobeAsset = { id, kind: "globe-asset", contentType: "image/png", bytes: data.length, sha256, chunks, source: {} };
  const records = new Map<string, Record<string, unknown>>([[globeAssetPath(id), asset]]);
  chunks.forEach((chunk, index) => records.set(`catalog/${chunk}`, { assetId: id, sha256, index, data: Bytes.fromUint8Array(data.subarray(index * GLOBE_CHUNK_BYTES, (index + 1) * GLOBE_CHUNK_BYTES)) }));
  const db = { doc: (path: string) => ({ get: async () => ({ exists: records.has(path), data: () => records.get(path) }) }) };
  return { db, asset, records };
}

describe("Firebase globe archive", () => {
  test("reassembles multiple binary documents exactly using public SDK Bytes", async () => {
    const original = Buffer.alloc(GLOBE_CHUNK_BYTES * 2 + 71, 201);
    original[0] = 137;
    const { db, asset } = fixture(original);
    const read = await readGlobeAsset(db, asset.id, asset.sha256);
    expect(read.data.equals(original)).toBe(true);
    expect(globeAssetUrl(asset)).toContain(`sha256=${asset.sha256}`);
  });
  test("detects altered image bytes before serving them", async () => {
    const { db, asset, records } = fixture(Buffer.from("verified image"));
    records.get(`catalog/${asset.chunks[0]}`)!.data = Bytes.fromUint8Array(Buffer.from("altered image!"));
    await expect(readGlobeAsset(db, asset.id)).rejects.toThrow(/checksum|Incomplete/);
  });
  test("rejects missing parts and stale versions", async () => {
    const { db, asset, records } = fixture(Buffer.from("image"));
    await expect(readGlobeAsset(db, asset.id, "a".repeat(64))).rejects.toBeInstanceOf(GlobeAssetNotFound);
    records.delete(`catalog/${asset.chunks[0]}`);
    await expect(readGlobeAsset(db, asset.id)).rejects.toThrow("Missing or mismatched");
  });
  test("never follows arbitrary chunk document paths", () => {
    const { asset } = fixture(Buffer.from("image"));
    expect(() => validateGlobeAsset({ ...asset, chunks: ["users/private"] }, asset.id)).toThrow();
  });
  test("uses bounded batch reads and preserves the original chunk order", async () => {
    const original = Buffer.alloc(GLOBE_CHUNK_BYTES * 11 + 1, 83);
    const { db, asset } = fixture(original);
    const sizes: number[] = [];
    const batched = { ...db, readCatalogBatch: async (paths: string[]) => {
      sizes.push(paths.length);
      return Promise.all(paths.map((path) => db.doc(path).get()));
    } };
    expect((await readGlobeAsset(batched, asset.id)).data.equals(original)).toBe(true);
    expect(sizes).toEqual([10, 2]);
  });
  test("shares verified immutable images across concurrent requests", async () => {
    const { db, asset } = fixture(Buffer.from("a unique cached image"));
    let reads = 0;
    const counted = { doc: (path: string) => ({ get: async () => { reads++; return db.doc(path).get(); } }) };
    const [a, b] = await Promise.all([readCachedGlobeAsset(counted, asset.id, asset.sha256), readCachedGlobeAsset(counted, asset.id, asset.sha256)]);
    expect(a.data.equals(b.data)).toBe(true);
    expect(reads).toBe(2); // one manifest and one chunk
    await readCachedGlobeAsset(counted, asset.id, asset.sha256);
    expect(reads).toBe(2);
  });
  test("only selects a preview derived from the current original snapshot", () => {
    const { asset } = fixture(Buffer.from("the original"));
    const preview = { ...asset, id: `preview-${asset.id}`, source: { originalSha256: asset.sha256 } };
    const archive: GlobeArchive = { version: 1, generatedAt: "", assets: [asset], displayAssets: [preview], scope: "" };
    expect(globeDisplayAsset(archive, asset)).toBe(preview);
    expect(globeDisplayAsset(archive, { ...asset, sha256: "a".repeat(64) })).toEqual({ ...asset, sha256: "a".repeat(64) });
  });
  test("rejects unknown IDs and unsupported formats", async () => {
    const { db, asset } = fixture(Buffer.from("image"));
    await expect(readGlobeAsset(db, "../users/private")).rejects.toBeInstanceOf(GlobeAssetNotFound);
    expect(() => validateGlobeAsset({ ...asset, contentType: "text/html" }, asset.id)).toThrow();
  });
});
