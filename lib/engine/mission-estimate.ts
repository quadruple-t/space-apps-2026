import { DEFAULT_ISP_S, DEFAULT_PAYLOAD_KG, deltaVBudget, type DeltaVBudget, type TrajectoryType } from "./deltav"
import { launchCostRange, type CostEstimate } from "./launch-costs"
import { stackMassKg } from "./rocket"

export type MissionEstimate = {
  budget: DeltaVBudget
  /** Mass in LEO at the first burn (kg) */
  leoMassKg: number
  propellantKg: number
  /** Propellant burned per phase, same order as budget.phases */
  phasePropellantKg: number[]
  /** null above the largest launch class in the config */
  cost: CostEstimate | null
  /** Same estimate using the low and high delta-v bounds */
  leoMassRangeKg: { low: number; high: number }
}

/**
 * Rocket-equation mass and launch-cost estimate. `landedDryKg` is the spacecraft dry mass that ends
 * up on the surface; propellant is everything burned from LEO to touchdown with one Isp.
 */
export function estimateMission(type: TrajectoryType, landedDryKg = DEFAULT_PAYLOAD_KG, ispS = DEFAULT_ISP_S): MissionEstimate {
  const budget = deltaVBudget(type)
  const burns = budget.phases.map((p) => p.kmS)
  const { leoMassKg, massBeforeBurnKg } = stackMassKg(landedDryKg, burns, ispS)
  const phasePropellantKg = massBeforeBurnKg.map((before, i) => before - (massBeforeBurnKg[i + 1] ?? landedDryKg))
  const low = stackMassKg(landedDryKg, budget.phases.map((p) => p.lowKmS), ispS).leoMassKg
  const high = stackMassKg(landedDryKg, budget.phases.map((p) => p.highKmS), ispS).leoMassKg
  return {
    budget, leoMassKg, propellantKg: leoMassKg - landedDryKg, phasePropellantKg,
    cost: launchCostRange(leoMassKg), leoMassRangeKg: { low, high },
  }
}
