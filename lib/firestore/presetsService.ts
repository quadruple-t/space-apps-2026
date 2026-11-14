import type { LanderPreset } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { landerPresetConverter } from "./converters";
import { fetchStaticCollection } from "./fetch";

export function listPresets(): Promise<LanderPreset[]> {
  return fetchStaticCollection(COLLECTIONS.landerPresets, landerPresetConverter);
}

export async function getPreset(id: string): Promise<LanderPreset | null> {
  return (await listPresets()).find((p) => p.id === id) ?? null;
}
