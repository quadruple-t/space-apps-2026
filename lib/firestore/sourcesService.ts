import type { DataSourceManifest } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { dataSourceConverter } from "./converters";
import { fetchStaticCollection } from "./fetch";

export async function listDataSources(): Promise<DataSourceManifest[]> {
  const sources = await fetchStaticCollection(COLLECTIONS.dataSources, dataSourceConverter);
  return [...sources].sort((a, b) => a.label.localeCompare(b.label));
}

export async function getDataSource(id: string): Promise<DataSourceManifest | null> {
  return (await listDataSources()).find((s) => s.id === id) ?? null;
}
