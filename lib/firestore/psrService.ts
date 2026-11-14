import type { PsrLayer } from "@/lib/model/types";
import { COLLECTIONS, DEFAULT_PSR_LAYER_ID } from "./collections";
import { psrLayerConverter } from "./converters";
import { fetchStaticCollection, fetchStaticDoc } from "./fetch";

/** psrLayer/{id} (default "south-1km2"), or null if not seeded yet. */
export function getPsrLayer(id: string = DEFAULT_PSR_LAYER_ID): Promise<PsrLayer | null> {
  return fetchStaticDoc(`${COLLECTIONS.psrLayer}/${id}`, psrLayerConverter);
}

/** Every psrLayer doc (for when the layer is split into tiles). */
export function listPsrLayers(): Promise<PsrLayer[]> {
  return fetchStaticCollection(COLLECTIONS.psrLayer, psrLayerConverter);
}
