import type { FactSheet } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { factSheetConverter } from "./converters";
import { fetchStaticCollection, fetchStaticDoc } from "./fetch";

/** e.g. "impact-costs", "landing-record-2019-2026", "lunar-constants", "artemis-status". */
export function getFactSheet(id: string): Promise<FactSheet | null> {
  return fetchStaticDoc(`${COLLECTIONS.facts}/${id}`, factSheetConverter);
}

export function listFactSheets(): Promise<FactSheet[]> {
  return fetchStaticCollection(COLLECTIONS.facts, factSheetConverter);
}
