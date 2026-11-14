import type { SiteId, ValidationCheck } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { validationCheckConverter } from "./converters";
import { fetchStaticCollection } from "./fetch";

export function listValidationChecks(): Promise<ValidationCheck[]> {
  return fetchStaticCollection(COLLECTIONS.validationChecks, validationCheckConverter);
}

export async function getValidationCheck(id: string): Promise<ValidationCheck | null> {
  return (await listValidationChecks()).find((c) => c.id === id) ?? null;
}

export async function getValidationChecksForSite(siteId: SiteId): Promise<ValidationCheck[]> {
  return (await listValidationChecks()).filter((c) => c.siteId === siteId);
}
