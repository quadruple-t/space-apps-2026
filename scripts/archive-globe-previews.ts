/**
 * Build smaller, complete-globe display images from the archived snapshots.
 * Run after archive:globe has prepared the original snapshots. The original
 * Firebase assets are never modified. --upload --yes writes only preview docs,
 * verifies their bytes, then publishes the separate display manifest.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GLOBE_ARCHIVE_DOC, GLOBE_CHUNK_BYTES, GLOBE_DISPLAY_DOC, globeAssetPath, type GlobeArchive, type GlobeAsset } from "../lib/globe-archive";

const root = path.resolve(import.meta.dirname, "..");
const seed = path.join(root, "data/seed");
const snapshots = path.join(root, "scripts/data-pipeline/.cache/globe-assets/snapshots");
const archive = JSON.parse(readFileSync(path.join(root, "scripts/data-pipeline/globe-archive.lock.json"), "utf8")) as GlobeArchive;
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const write = (docPath: string, data: unknown) => {
  const file = path.join(seed, `${docPath}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
};

async function main() {
  const assets: GlobeAsset[] = [];
  const chunks: { id: string; data: { kind: string; assetId: string; sha256: string; index: number; data: Buffer } }[] = [];
  for (const original of archive.assets.filter((asset) => asset.contentType.startsWith("image/"))) {
    const data = readFileSync(path.join(snapshots, `${original.id}.png`));
    if (hash(data) !== original.sha256 || !original.width || !original.height) throw new Error(`Original snapshot does not match: ${original.id}`);
    const width = Math.ceil(original.width / 2), height = Math.ceil(original.height / 2);
    const resize = () => sharp(data).resize(width, height, { kernel: "nearest" }).ensureAlpha();
    const image = await resize().webp({ lossless: true, exact: true, effort: 4 }).toBuffer();
    const expected = await resize().raw().toBuffer();
    const decoded = await sharp(image).ensureAlpha().raw().toBuffer();
    if (!decoded.equals(expected)) throw new Error(`Preview pixels changed during encoding: ${original.id}`);
    const sha256 = hash(image), id = `preview-${original.id}`;
    const names: string[] = [];
    for (let offset = 0, index = 0; offset < image.length; offset += GLOBE_CHUNK_BYTES, index++) {
      const name = `globe-chunk-${id}-${sha256.slice(0, 16)}-${index}`;
      const bytes = image.subarray(offset, offset + GLOBE_CHUNK_BYTES);
      names.push(name);
      chunks.push({ id: name, data: { kind: "globe-asset-chunk", assetId: id, sha256, index, data: bytes } });
      write(`catalog/${name}`, { kind: "globe-asset-chunk", assetId: id, sha256, index, data: { $bytes: bytes.toString("base64") } });
    }
    const asset: GlobeAsset = {
      id, kind: "globe-asset", contentType: "image/webp", bytes: image.length, sha256, chunks: names,
      layerId: original.layerId, sourceIndex: original.sourceIndex, width, height, rectangle: original.rectangle,
      source: { originalId: original.id, originalSha256: original.sha256, method: "Nearest-neighbor half-resolution overview, lossless WebP encoding", originalSource: original.source },
    };
    assets.push(asset);
    write(globeAssetPath(id), asset);
    console.log(`${id}: ${original.bytes} → ${image.length} bytes`);
  }
  const manifest = { version: 1, generatedAt: new Date().toISOString(), assets, scope: "Full-coverage display overviews derived from the unchanged archived snapshots." };
  write(GLOBE_DISPLAY_DOC, manifest);
  console.log(`Prepared ${assets.length} overviews and ${chunks.length} chunks; ${(assets.reduce((sum, a) => sum + a.bytes, 0) / 1048576).toFixed(1)} MiB.`);

  if (!process.argv.includes("--upload")) return;
  if (!process.argv.includes("--yes")) throw new Error("--upload requires --yes");
  const projectId = JSON.parse(readFileSync(path.join(root, ".firebaserc"), "utf8")).projects.default as string;
  const db = getFirestore(initializeApp({ projectId, credential: applicationDefault() }, "globe-previews"));
  try {
    const remote = await db.doc(GLOBE_ARCHIVE_DOC).get();
    const remoteAssets = remote.data()?.assets as GlobeAsset[] | undefined;
    if (!remoteAssets || archive.assets.some((asset) => !remoteAssets.some((item) => item.id === asset.id && item.sha256 === asset.sha256))) {
      throw new Error("Firebase originals differ from the local archive; no previews were uploaded.");
    }
    const docs = [
      ...chunks.map((chunk) => ({ path: `catalog/${chunk.id}`, data: chunk.data, size: chunk.data.data.length })),
      ...assets.map((asset) => ({ path: globeAssetPath(asset.id), data: asset, size: 4096 })),
    ];
    for (let start = 0; start < docs.length;) {
      const batch = db.batch(); let size = 0, count = 0;
      while (start < docs.length && count < 100 && size + docs[start].size < 8 * 1024 * 1024) {
        const doc = docs[start++];
        batch.set(db.doc(doc.path), doc.data); size += doc.size; count++;
      }
      if (!count) throw new Error("Preview document exceeds the batch limit");
      await batch.commit();
    }
    for (const asset of assets) {
      const docs = await db.getAll(...asset.chunks.map((name) => db.doc(`catalog/${name}`)));
      const reconstructed = Buffer.concat(docs.map((doc, index) => {
        if (!doc.exists || doc.get("assetId") !== asset.id || doc.get("sha256") !== asset.sha256 || doc.get("index") !== index) throw new Error(`Missing preview chunk: ${asset.id}`);
        return Buffer.from(doc.get("data"));
      }));
      if (reconstructed.length !== asset.bytes || hash(reconstructed) !== asset.sha256) throw new Error(`Preview verification failed: ${asset.id}`);
      console.log(`Verified ${asset.id}`);
    }
    await db.doc(GLOBE_DISPLAY_DOC).set(manifest);
    console.log("Published the verified overview manifest. Original snapshots were unchanged.");
  } finally {
    await db.terminate();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
