/**
 * Loads data/seed/<collection>/<docId>.json (recursively; nested dirs are sub-collections)
 * into Firestore-ready values:
 *   - {"$bytes": "<base64>"} at any depth -> Buffer
 *   - top-level ISO strings in updatedAt / computedAt / generatedAt -> Timestamp
 *   - keys starting with "_" are dropped at any depth
 * Skips data/seed/_reports, data/seed/fixtures and any file or directory starting with "_".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Timestamp } from "firebase-admin/firestore";

export type SeedValue = null | boolean | number | string | Buffer | Timestamp | SeedValue[] | { [k: string]: SeedValue };
export type SeedData = { [k: string]: SeedValue };

export interface SeedDoc {
  /** Firestore document path, e.g. "sites/apollo-11-tranquility/terrain/v1" */
  path: string;
  /** top-level collection, e.g. "sites" */
  collection: string;
  /** collection group label for reporting, e.g. "sites/*\/terrain" */
  group: string;
  file: string;
  data: SeedData;
}

export interface LoadResult {
  docs: SeedDoc[];
  errors: string[];
}

const SKIP_TOP = new Set(["_reports", "fixtures"]);
const TIMESTAMP_KEYS = new Set(["updatedAt", "computedAt", "generatedAt"]);

function convert(value: unknown, where: string, errors: string[]): SeedValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${where}: non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((v, i) => convert(v, `${where}[${i}]`, errors));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === "$bytes") {
      const b64 = obj.$bytes;
      if (typeof b64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
        errors.push(`${where}: $bytes is not a base64 string`);
        return Buffer.alloc(0);
      }
      return Buffer.from(b64, "base64");
    }
    const out: { [k: string]: SeedValue } = {};
    for (const k of keys) {
      if (k.startsWith("_")) continue;
      out[k] = convert(obj[k], `${where}.${k}`, errors);
    }
    return out;
  }
  errors.push(`${where}: unsupported JSON value of type ${typeof value}`);
  return null;
}

function listJsonFiles(dir: string, rel: string[] = []): { file: string; rel: string[] }[] {
  const out: { file: string; rel: string[] }[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    if (rel.length === 0 && SKIP_TOP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJsonFiles(full, [...rel, name]));
    else if (name.endsWith(".json")) out.push({ file: full, rel: [...rel, name.slice(0, -5)] });
  }
  return out;
}

export function loadSeedDocs(seedDir: string): LoadResult {
  const errors: string[] = [];
  const docs: SeedDoc[] = [];
  for (const { file, rel } of listJsonFiles(seedDir)) {
    const relFile = path.relative(process.cwd(), file);
    if (rel.length % 2 !== 0) {
      errors.push(`${relFile}: path has ${rel.length} segments; documents need collection/doc[/sub/doc] (even count)`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${relFile}: invalid JSON (${(e as Error).message})`);
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      errors.push(`${relFile}: top level must be a JSON object`);
      continue;
    }
    const docPath = rel.join("/");
    const data = convert(parsed, docPath, errors) as SeedData;
    for (const key of TIMESTAMP_KEYS) {
      const v = data[key];
      if (typeof v === "string") {
        const t = Date.parse(v);
        if (Number.isNaN(t)) errors.push(`${docPath}.${key}: "${v}" is not an ISO date`);
        else data[key] = Timestamp.fromMillis(t);
      }
    }
    const group = rel.filter((_, i) => i % 2 === 0).join("/*/");
    docs.push({ path: docPath, collection: rel[0], group, file: relFile, data });
  }
  return { docs, errors };
}
