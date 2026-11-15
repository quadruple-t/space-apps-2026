import { G0_M_S2 } from "./deltav"

/** Tsiolkovsky: m_wet = m_dry * exp(dv / (Isp * g0)). dv in km/s, Isp in s, masses in kg. */
export function wetMassKg(dryKg: number, deltaVKmS: number, ispS: number): number {
  if (!(dryKg >= 0) || !(deltaVKmS >= 0) || !(ispS > 0)) throw new RangeError("dryKg and deltaV must be >= 0 and Isp > 0")
  return dryKg * Math.exp((deltaVKmS * 1000) / (ispS * G0_M_S2))
}

export function propellantKg(dryKg: number, deltaVKmS: number, ispS: number): number {
  return wetMassKg(dryKg, deltaVKmS, ispS) - dryKg
}

/**
 * Mass in LEO needed to land `landedDryKg`, burning phases in order (first entry is the first burn).
 * Works backwards: the mass after a burn is the mass before the next one.
 */
export function stackMassKg(landedDryKg: number, burnsKmS: number[], ispS: number): { leoMassKg: number; massBeforeBurnKg: number[] } {
  const before: number[] = new Array(burnsKmS.length)
  let m = landedDryKg
  for (let i = burnsKmS.length - 1; i >= 0; i--) {
    m = wetMassKg(m, burnsKmS[i], ispS)
    before[i] = m
  }
  return { leoMassKg: m, massBeforeBurnKg: before }
}
