import type { FactSheet } from "@/lib/model/types";

export type MeteorStream = { name: string; referenceUtc: string; latitudeDeg: number; longitudeDeg: number };

/** Read the pipeline's sourced/derived facts, using the same API-backed collection as other facts. */
export function meteorStreamsFromFacts(sheet: FactSheet): MeteorStream[] {
  const grouped = new Map<string, Map<string, string | number>>();
  for (const row of sheet.rows) {
    if (!grouped.has(row.label)) grouped.set(row.label, new Map());
    grouped.get(row.label)!.set(row.unit ?? "", row.value);
  }
  return [...grouped].map(([name, rows]) => {
    const referenceUtc = rows.get("UTC"), latitudeDeg = rows.get("latitude deg"), longitudeDeg = rows.get("longitude deg");
    if (typeof referenceUtc !== "string" || !Number.isFinite(Date.parse(referenceUtc))
      || typeof latitudeDeg !== "number" || !Number.isFinite(latitudeDeg) || Math.abs(latitudeDeg) > 90
      || typeof longitudeDeg !== "number" || !Number.isFinite(longitudeDeg) || Math.abs(longitudeDeg) > 180) {
      throw new Error("Invalid meteor-stream reference data");
    }
    return { name, referenceUtc, latitudeDeg, longitudeDeg };
  });
}

/** Parallel-stream incidence on a smooth sphere; not a flux, probability, or storm forecast. */
export function streamIncidence(latitudeDeg: number, longitudeDeg: number, stream: MeteorStream): number {
  const rad = Math.PI / 180;
  const phi = latitudeDeg * rad, delta = stream.latitudeDeg * rad;
  return Math.max(0, Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos((longitudeDeg - stream.longitudeDeg) * rad));
}
