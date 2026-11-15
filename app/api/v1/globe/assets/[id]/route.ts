import { publicReadDb } from "@/lib/firebase/public-read-db";
import { GlobeAssetNotFound } from "@/lib/globe-asset-reader";
import { readCachedGlobeAsset } from "@/lib/globe-asset-cache";
import { errorJson } from "@/lib/api/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const hash = new URL(request.url).searchParams.get("sha256");
    const { asset, data } = await readCachedGlobeAsset(publicReadDb(), id, hash);
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(data.length),
      "Cache-Control": hash ? "public, max-age=31536000, immutable" : "public, max-age=60, s-maxage=3600",
      "ETag": `"${asset.sha256}"`,
      "X-Content-Type-Options": "nosniff",
      ...(asset.contentType === "application/gzip" ? { "Content-Disposition": 'attachment; filename="collected-scientific-data.json.gz"' } : {}),
    } });
  } catch (error) {
    if (error instanceof GlobeAssetNotFound) return errorJson(error.message, 404);
    console.error("Globe asset could not be reconstructed", error instanceof Error ? error.message : "Unknown error");
    return errorJson("Stored globe data is unavailable", 503);
  }
}
