/** Cached reads for static content through the versioned server API. */
import type { FirestoreDataConverter, QueryDocumentSnapshot } from "firebase/firestore";
import { cached } from "./cache";
import { DocumentNotFoundError } from "./errors";

const COLLECTION_ROUTES: Record<string, string> = {
  sites: "sites", storyChapters: "chapters", missionProfiles: "profiles", protectionZones: "zones",
  landerPresets: "presets", facts: "facts", validationChecks: "validations", dataSources: "sources",
  ephemerisGlobal: "ephemeris", terrainGrid: "terrain", psrLayer: "psr", demo: "demos", catalog: "catalog",
};

function apiPath(path: string): string {
  if (path === "catalog/siteIndex") return "catalog/sites";
  if (path === "catalog/meta") return "catalog/meta";
  const [collection, ...rest] = path.split("/");
  const route = COLLECTION_ROUTES[collection];
  if (!route) throw new Error(`No REST route for static resource ${collection}`);
  return [route, ...rest].join("/");
}

async function request(path: string): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await fetch(`/api/v1/${path}`, { headers: { Accept: "application/json" } });
  const body = await response.json() as Record<string, unknown>;
  return { response, body };
}

function convert<T>(converter: FirestoreDataConverter<T>, path: string, data: Record<string, unknown>): T {
  const id = path.split("/").at(-1)!;
  const snapshot = { id, ref: { path }, data: () => data } as unknown as QueryDocumentSnapshot;
  return converter.fromFirestore(snapshot);
}

/** Fetch one static document once; resolves null when it does not exist. */
export function fetchStaticDoc<T>(path: string, converter: FirestoreDataConverter<T>): Promise<T | null> {
  return cached(`doc:${path}`, async () => {
    const { response, body } = await request(apiPath(path));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Static data request failed (${response.status}) for ${path}`);
    if (path === "catalog/siteIndex") {
      const data = { ...body, updatedAt: body.generatedAt ?? null };
      return convert(converter, path, data);
    }
    const data = body.site && path.startsWith("sites/") && path.split("/").length === 2
      ? body.site as Record<string, unknown>
      : body;
    return convert(converter, path, data);
  });
}

/** Like fetchStaticDoc but rejects with DocumentNotFoundError when missing. */
export async function fetchRequiredStaticDoc<T>(path: string, converter: FirestoreDataConverter<T>): Promise<T> {
  const value = await fetchStaticDoc(path, converter);
  if (value === null) throw new DocumentNotFoundError(path);
  return value;
}

/** Fetch a complete static collection using bounded API pages. */
export function fetchStaticCollection<T>(name: string, converter: FirestoreDataConverter<T>): Promise<T[]> {
  return cached(`col:${name}`, async () => {
    const route = COLLECTION_ROUTES[name];
    if (!route) throw new Error(`No REST route for static collection ${name}`);
    const all: T[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: "250" });
      if (cursor) params.set("cursor", cursor);
      const { response, body } = await request(`${route}?${params.toString()}`);
      if (!response.ok) throw new Error(`Static collection request failed (${response.status}) for ${name}`);
      const items = Array.isArray(body.items) ? body.items as Record<string, unknown>[] : [];
      all.push(...items.map((item) => convert(converter, `${name}/${String(item.id)}`, item)));
      cursor = body.hasMore === true && typeof body.nextCursor === "string" ? body.nextCursor : null;
    } while (cursor);
    return all;
  });
}
