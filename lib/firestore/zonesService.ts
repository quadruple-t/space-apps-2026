import type { ProtectionZone, SiteId } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { protectionZoneConverter } from "./converters";
import { fetchStaticCollection } from "./fetch";

export function listZones(): Promise<ProtectionZone[]> {
  return fetchStaticCollection(COLLECTIONS.protectionZones, protectionZoneConverter);
}

export async function getZone(id: string): Promise<ProtectionZone | null> {
  return (await listZones()).find((z) => z.id === id) ?? null;
}

export async function getZonesForSite(siteId: SiteId): Promise<ProtectionZone[]> {
  return (await listZones()).filter((z) => z.siteId === siteId);
}

export async function listZonesByKind(kind: ProtectionZone["kind"]): Promise<ProtectionZone[]> {
  return (await listZones()).filter((z) => z.kind === kind);
}
