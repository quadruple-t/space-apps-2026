/** Collect reproducible display snapshots and archive the app's collected data as Firestore Bytes.
 * Preparation makes no cloud writes. --upload runs the existing seed workflow; --verify reads back hashes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { BASE_LAYER, LAYERS, LUNASERV_WMS, TREK_TEMPLATE, type OverlaySource } from "../scenes/cesium/moon-layers";
import { GLOBE_ARCHIVE_DOC, GLOBE_CHUNK_BYTES, globeAssetPath, type GlobeArchive, type GlobeAsset } from "../lib/globe-archive";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "scripts/data-pipeline/.cache/globe-assets");
const SEED = path.join(ROOT, "data/seed");
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const manifestFile = path.join(ROOT, "scripts/data-pipeline/globe-archive.lock.json");
const projectId = JSON.parse(readFileSync(path.join(ROOT, ".firebaserc"), "utf8")).projects.default as string;
const generatedAt = new Date().toISOString();

function jsonFile(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 1) + "\n");
}
async function download(url: string): Promise<Buffer> {
  const file = path.join(CACHE, "downloads", sha(url));
  if (existsSync(file)) return readFileSync(file);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 16 * 1024 * 1024) throw new Error("Snapshot response exceeds 16 MiB");
      await sharp(data).metadata(); // reject service exceptions and broken images
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data);
      return data;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Download failed");
}

async function snapshot(src: OverlaySource): Promise<{ data: Buffer; rectangle: [number, number, number, number]; source: Record<string, unknown> }> {
  if (src.kind === "wms") {
    const rectangle: [number, number, number, number] = [-180, -90, 180, 90];
    const url = new URL(LUNASERV_WMS);
    url.search = new URLSearchParams({ service: "WMS", version: "1.1.1", request: "GetMap", layers: src.layers, styles: "", srs: "EPSG:4326", bbox: rectangle.join(","), width: "2048", height: "1024", format: "image/png", transparent: "true" }).toString();
    return { data: await download(url.href), rectangle, source: { ...src, url: url.href, requestedWidth: 2048, requestedHeight: 1024 } };
  }
  // Keep the original Moon Trek tiles, mosaicked at a bounded overview resolution.
  const level = Math.min(src.maximumLevel, src.south !== undefined ? 3 : 2);
  const cols = 2 ** (level + 1), rows = 2 ** level;
  const first = Math.max(0, Math.floor((90 - (src.north ?? 90)) / 180 * rows));
  const last = Math.min(rows - 1, Math.ceil((90 - (src.south ?? -90)) / 180 * rows) - 1);
  const urls: string[] = [];
  const pieces: { input: Buffer; left: number; top: number }[] = [];
  // Four workers bound upstream traffic and preserve original tile bytes in the source archive.
  const jobs = Array.from({ length: (last - first + 1) * cols }, (_, i) => ({ row: first + Math.floor(i / cols), col: i % cols }));
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < jobs.length) {
      const { row, col } = jobs[cursor++];
      const url = TREK_TEMPLATE(src.layer, src.format === "image/png" ? "png" : "jpg").replace("{Style}", "default").replace("{TileMatrixSet}", "default028mm").replace("{TileMatrix}", String(level)).replace("{TileRow}", String(row)).replace("{TileCol}", String(col));
      urls.push(url);
      const input = await download(url);
      pieces.push({ input, left: col * 256, top: (row - first) * 256 });
    }
  }));
  const data = await sharp({ create: { width: cols * 256, height: (last - first + 1) * 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(pieces).png().toBuffer();
  return { data, rectangle: [-180, 90 - (last + 1) * 180 / rows, 180, 90 - first * 180 / rows], source: { ...src, tileLevel: level, urls: urls.sort() } };
}

function emit(id: string, data: Buffer, contentType: GlobeAsset["contentType"], source: Record<string, unknown>, extra: Partial<GlobeAsset> = {}): GlobeAsset {
  if (data.length > 64 * 1024 * 1024) throw new Error(`Asset ${id} exceeds the 64 MiB archive limit`);
  const hash = sha(data);
  const chunks: string[] = [];
  for (let offset = 0, i = 0; offset < data.length; offset += GLOBE_CHUNK_BYTES, i++) {
    const name = `globe-chunk-${id}-${hash.slice(0, 16)}-${i}`;
    chunks.push(name);
    jsonFile(path.join(SEED, "catalog", `${name}.json`), { kind: "globe-asset-chunk", assetId: id, sha256: hash, index: i, data: { $bytes: data.subarray(offset, offset + GLOBE_CHUNK_BYTES).toString("base64") } });
  }
  const asset: GlobeAsset = { id, kind: "globe-asset", contentType, bytes: data.length, sha256: hash, chunks, source, ...extra };
  jsonFile(path.join(SEED, `${globeAssetPath(id)}.json`), asset);
  return asset;
}
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

async function prepare() {
  mkdirSync(CACHE, { recursive: true });
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) as GlobeArchive : null;
  const assets: GlobeAsset[] = [];
  const jobs = [
    { id: "base", layerId: "base", sourceIndex: 0, src: { kind: "wmts", layer: BASE_LAYER.layer, format: "image/jpeg", maximumLevel: BASE_LAYER.maximumLevel } as OverlaySource },
    ...LAYERS.flatMap((layer) => layer.sources.map((src, i) => ({ id: `${layer.id}-${i}`, layerId: layer.id, sourceIndex: i, src }))),
  ];
  for (const job of jobs) {
    console.log(`Collecting ${job.id}…`);
    const result = await snapshot(job.src);
    const dimensions = await sharp(result.data).metadata();
    const file = path.join(CACHE, "snapshots", `${job.id}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, result.data);
    assets.push(emit(job.id, result.data, "image/png", { ...result.source, retrievedAt: generatedAt }, { layerId: job.layerId, sourceIndex: job.sourceIndex, width: dimensions.width, height: dimensions.height, rectangle: result.rectangle }));
    console.log(`  ${dimensions.width}×${dimensions.height}, ${Math.ceil(result.data.length / 1024)} KiB`);
  }
  const inputFiles = [
    ...filesUnder(SEED).filter((file) => !path.basename(file).startsWith("globe-")),
    ...filesUnder(path.join(ROOT, "scripts/data-pipeline/curated")),
    ...filesUnder(path.join(ROOT, "scripts/data-pipeline/.cache/globe")),
    ...filesUnder(path.join(CACHE, "downloads")),
    path.join(ROOT, "scripts/data-pipeline/manifest.lock.json"),
    path.join(ROOT, "docs/SOURCES.md"), path.join(ROOT, "README.md"),
  ].sort();
  const files = inputFiles.map((file) => ({ path: path.relative(ROOT, file), sha256: sha(readFileSync(file)), encoding: "base64", data: readFileSync(file).toString("base64") }));
  const archiveData = gzipSync(JSON.stringify({ version: 1, generatedAt, files }), { level: 9 });
  assets.push(emit("collected-data", archiveData, "application/gzip", { description: "Collected static seed data, curated inputs, cached source responses, globe snapshots, and citations. Excludes credentials, user data, and full-resolution upstream archives not present locally.", fileCount: files.length }));
  const archive: GlobeArchive = { version: 1, generatedAt, assets, scope: "Complete globe display snapshots at recorded resolution plus all locally collected scientific app inputs. Not full-resolution upstream archives." };
  jsonFile(path.join(SEED, `${GLOBE_ARCHIVE_DOC}.json`), archive);
  jsonFile(manifestFile, archive);
  const keep = new Set(assets.flatMap((asset) => [path.basename(globeAssetPath(asset.id)), ...asset.chunks]));
  // Remove only obsolete local chunks enumerated by this importer's previous manifest.
  for (const asset of previous?.assets ?? []) for (const chunk of asset.chunks) {
    if (!keep.has(chunk)) {
      const file = path.join(SEED, "catalog", `${chunk}.json`);
      if (existsSync(file)) unlinkSync(file);
    }
  }
  const metaFile = path.join(SEED, "catalog/meta.json");
  const meta = JSON.parse(readFileSync(metaFile, "utf8"));
  meta.counts.catalog = filesUnder(path.join(SEED, "catalog")).filter((file) => file.endsWith(".json")).length;
  meta.counts.dataSources = filesUnder(path.join(SEED, "dataSources")).filter((file) => file.endsWith(".json")).length;
  jsonFile(metaFile, meta);
  console.log(`Prepared ${assets.length} assets; ${(assets.reduce((n, a) => n + a.bytes, 0) / 1048576).toFixed(1)} MiB total. No cloud writes performed.`);
}

async function verify() {
  const archive = JSON.parse(readFileSync(manifestFile, "utf8")) as GlobeArchive;
  const db = getFirestore(initializeApp({ projectId, credential: applicationDefault() }, "verify-globe"));
  for (const asset of archive.assets) {
    const stored = await db.doc(globeAssetPath(asset.id)).get();
    if (!stored.exists || stored.get("sha256") !== asset.sha256) throw new Error(`Missing/incorrect manifest: ${asset.id}`);
    const buffers: Buffer[] = [];
    for (let i = 0; i < asset.chunks.length; i += 50) {
      const chunks = await db.getAll(...asset.chunks.slice(i, i + 50).map((id) => db.doc(`catalog/${id}`)));
      for (const chunk of chunks) {
        if (!chunk.exists) throw new Error(`Missing chunk ${chunk.id}`);
        buffers.push(Buffer.from(chunk.get("data")));
      }
    }
    const data = Buffer.concat(buffers);
    if (data.length !== asset.bytes || sha(data) !== asset.sha256) throw new Error(`Readback checksum mismatch: ${asset.id}`);
    console.log(`Verified ${asset.id}: ${data.length} bytes, SHA-256 matches`);
  }
  await db.terminate();
}

async function main() {
  if (!process.argv.includes("--verify")) await prepare();
  if (process.argv.includes("--upload")) {
    const result = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts/seed-firestore.ts"), "--prod", "--yes"], { cwd: ROOT, stdio: "inherit" });
    if (result.status !== 0) throw new Error("Validated seed upload failed");
    await verify();
  } else if (process.argv.includes("--verify")) await verify();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
