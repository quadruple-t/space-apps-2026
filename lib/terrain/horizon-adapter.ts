/**
 * Adapter from Firestore horizon masks to the existing HorizonModel in lib/horizon.ts,
 * the seam CLAUDE.md names for replacing createIllustrativeHorizon().
 */
import type { HorizonModel, HorizonSample } from "@/lib/horizon";
import type { HorizonMask } from "@/lib/model/types";
import { maskAt } from "./mask";

export function horizonMaskToModel(
  mask: HorizonMask,
  options: { step?: number; sunPath?: HorizonSample[]; earth?: HorizonSample } = {},
): HorizonModel {
  const step = options.step ?? 2;
  const samples: HorizonSample[] = [];
  for (let az = 0; az <= 360; az += step) {
    samples.push({ azimuth: az, elevation: maskAt(mask.maskElevationDeg, mask.binDeg, az) });
  }
  const sunPath = options.sunPath ?? [];
  const earth = options.earth ?? { azimuth: 0, elevation: Number.NaN };
  const maxElevation = Math.max(
    ...samples.map((s) => s.elevation),
    ...sunPath.map((s) => s.elevation),
    Number.isFinite(earth.elevation) ? earth.elevation : -Infinity,
  );
  return { mask: samples, sunPath, earth, maxElevation };
}
