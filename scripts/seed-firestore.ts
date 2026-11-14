/**
 * Seed Firestore static content from data/seed/ with the Admin SDK.
 *
 *   npx tsx scripts/seed-firestore.ts --emulator [--only sites,catalog] [--dry-run]
 *   npx tsx scripts/seed-firestore.ts --prod --yes [--only ...]
 *   npx tsx scripts/seed-firestore.ts --dry-run          (validate + size table, no target)
 *
 * --emulator  FIRESTORE_EMULATOR_HOST defaults to 127.0.0.1:8080; project shadowline-2t12.
 * --prod      Application Default Credentials (gcloud auth application-default login);
 *             project must resolve from .firebaserc and --yes is required.
 * --only      comma-separated top-level collections (sub-collections come with their parent).
 *
 * Validates everything before writing; aborts on any error. Idempotent (set() overwrites).
 * Batches are <= 500 writes and <= ~9 MB. Never writes users/*.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { applicationDefault, initializeApp, type AppOptions } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadSeedDocs, type SeedDoc } from "./seed/load";
import { documentSize } from "./seed/size";
import { validateSeed } from "./seed/validate";

const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, "data", "seed");
const EMULATOR_PROJECT = "shadowline-2t12";
const MAX_BATCH_OPS = 500;
const MAX_BATCH_BYTES = 9 * 1024 * 1024;

interface Args {
  emulator: boolean;
  prod: boolean;
  yes: boolean;
  dryRun: boolean;
  only: string[] | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { emulator: false, prod: false, yes: false, dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--emulator") args.emulator = true;
    else if (a === "--prod") args.prod = true;
    else if (a === "--yes") args.yes = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--only" || a.startsWith("--only=")) {
      const v = a === "--only" ? argv[++i] : a.slice("--only=".length);
      if (!v) fail("--only needs a comma-separated list of collections");
      args.only = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else fail(`Unknown argument: ${a}`);
  }
  if (args.emulator && args.prod) fail("Choose one of --emulator or --prod.");
  if (!args.emulator && !args.prod && !args.dryRun) fail("Specify --emulator, --prod (with --yes) or --dry-run.");
  if (args.prod && !args.yes && !args.dryRun) fail("Refusing to write to production without --yes.");
  return args;
}

function fail(msg: string): never {
  console.error(`seed-firestore: ${msg}`);
  process.exit(1);
}

function projectFromFirebaserc(): string | null {
  try {
    const rc = JSON.parse(readFileSync(path.join(ROOT, ".firebaserc"), "utf8")) as { projects?: { default?: unknown } };
    return typeof rc.projects?.default === "string" && rc.projects.default ? rc.projects.default : null;
  } catch {
    return null;
  }
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`;
}

function printTable(docs: SeedDoc[]): void {
  const rows = new Map<string, { count: number; bytes: number; max: number }>();
  for (const d of docs) {
    const size = documentSize(d.path, d.data);
    const row = rows.get(d.group) ?? { count: 0, bytes: 0, max: 0 };
    row.count++;
    row.bytes += size;
    row.max = Math.max(row.max, size);
    rows.set(d.group, row);
  }
  const header = ["collection", "docs", "total", "largest"];
  const body = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, r]) => [g, String(r.count), kb(r.bytes), kb(r.max)]);
  const total = docs.reduce((n, d) => n + documentSize(d.path, d.data), 0);
  body.push(["TOTAL", String(docs.length), kb(total), ""]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  body.forEach((r, i) => {
    if (i === body.length - 1) console.log(widths.map((w) => "-".repeat(w)).join("  "));
    console.log(line(r));
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const { docs: allDocs, errors: loadErrors } = loadSeedDocs(SEED_DIR);
  if (allDocs.length === 0 && loadErrors.length === 0) fail(`No seed documents found under ${path.relative(ROOT, SEED_DIR)}/`);

  const present = [...new Set(allDocs.map((d) => d.collection))].sort();
  console.log(`Found ${allDocs.length} docs in ${present.length} collections: ${present.join(", ")}`);

  const errors = [...loadErrors, ...validateSeed(allDocs)];
  if (errors.length) {
    console.error(`\nValidation failed with ${errors.length} error(s); nothing was written:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  let docs = allDocs;
  if (args.only) {
    const unknown = args.only.filter((c) => !present.includes(c));
    if (unknown.length) console.warn(`--only: no seed data for ${unknown.join(", ")} (skipped)`);
    docs = allDocs.filter((d) => args.only?.includes(d.collection));
  }
  if (docs.some((d) => d.collection === "users")) fail("internal: refusing to write users/*");

  console.log("");
  printTable(docs);

  if (args.dryRun) {
    console.log("\nDry run: validation passed, nothing written.");
    return;
  }

  const options: AppOptions = {};
  if (args.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    options.projectId = projectFromFirebaserc() ?? EMULATOR_PROJECT;
    console.log(`\nTarget: Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST} (project ${options.projectId})`);
  } else {
    if (process.env.FIRESTORE_EMULATOR_HOST) fail("FIRESTORE_EMULATOR_HOST is set; unset it for --prod.");
    const projectId = projectFromFirebaserc();
    if (!projectId) fail("Could not resolve the project id from .firebaserc (projects.default); refusing --prod.");
    options.projectId = projectId;
    options.credential = applicationDefault();
    console.log(`\nTarget: PRODUCTION Firestore, project ${projectId} (Application Default Credentials)`);
  }

  const db = getFirestore(initializeApp(options, "seed"));
  let batch = db.batch();
  let ops = 0;
  let bytes = 0;
  let written = 0;
  let commits = 0;
  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    commits++;
    written += ops;
    process.stdout.write(`  committed batch ${commits} (${ops} docs, ${kb(bytes)}); ${written}/${docs.length}\n`);
    batch = db.batch();
    ops = 0;
    bytes = 0;
  };
  for (const d of docs) {
    const size = documentSize(d.path, d.data);
    if (ops + 1 > MAX_BATCH_OPS || bytes + size > MAX_BATCH_BYTES) await commit();
    batch.set(db.doc(d.path), d.data);
    ops++;
    bytes += size;
  }
  await commit();
  console.log(`\nDone: wrote ${written} docs in ${commits} batch(es).`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
