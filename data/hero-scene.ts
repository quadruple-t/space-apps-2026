/**
 * Shared configuration for the conceptual hero scene.
 *
 * The 3D scene and the HUD overlays read from the same object so the
 * numbers on screen match what is drawn. Every value here is ILLUSTRATIVE —
 * it describes a stylised scene, not computed ephemerides or LOLA terrain.
 */

export const HERO_SCENE = {
  /** Sun elevation above the local horizon, degrees. Near-grazing at the pole. */
  sunElevationDeg: 1.6,
  /** Sun azimuth relative to camera forward (0 = straight ahead, + = right). */
  sunAzimuthDeg: -30,
  /** Earth elevation above the local horizon, degrees. */
  earthElevationDeg: 6.4,
  earthAzimuthDeg: 12,
  /** Camera heading (yaw) for the hero shot, degrees. */
  cameraYawDeg: -8,
  /** Readout labels for the HUD. */
  site: {
    label: "Lunar south pole",
    latitude: "89.5° S",
    longitude: "222.7° E",
  },
  earth: {
    status: "Above horizon",
  },
  environment: {
    summary: "Grazing light",
    detail: "Long shadows · cold traps",
  },
} as const;

/** Convert horizon-relative angles into a direction vector (camera faces -Z). */
export function horizonDirection(azimuthDeg: number, elevationDeg: number) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return {
    x: Math.sin(az) * Math.cos(el),
    y: Math.sin(el),
    z: -Math.cos(az) * Math.cos(el),
  };
}
