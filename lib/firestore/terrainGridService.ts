import type { TerrainGridTile } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { terrainGridTileConverter } from "./converters";
import { fetchStaticDoc } from "./fetch";

/** terrainGrid/{tileId}, or null when the tile was not generated (outside the polar grid). */
export function getTerrainGridTile(tileId: string): Promise<TerrainGridTile | null> {
  return fetchStaticDoc(`${COLLECTIONS.terrainGrid}/${tileId}`, terrainGridTileConverter);
}
