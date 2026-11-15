/**
 * Delta-v budget per mission phase. Every number carries a `sourceId` that is defined in
 * docs/SOURCES.md section 8 (enforced by tests/trajectory-sources.test.ts).
 * Impulsive-burn, patched-conic values: planning approximations, not mission design.
 */

export type TrajectoryType = "direct" | "low-energy"
export type PhaseId = "tli" | "loi" | "descent"

export type DeltaVValue = {
  /** km/s */
  lowKmS: number
  nominalKmS: number
  highKmS: number
  sourceId: string
}

export const PHASE_LABELS: Record<PhaseId, string> = {
  tli: "Trans-lunar injection (from LEO)",
  loi: "Lunar orbit insertion",
  descent: "Descent and landing (from low lunar orbit)",
}

export const TRAJECTORY_LABELS: Record<TrajectoryType, string> = {
  direct: "Direct transfer",
  "low-energy": "Low-energy transfer",
}

/** Standard gravity used in the rocket equation (exact by definition). SOURCES: CONST-G0. */
export const G0_M_S2 = 9.80665
/** SOURCES: ISP-1. Apollo LM descent engine, vacuum, full thrust. */
export const DEFAULT_ISP_S = 311
/** Landed dry mass default (kg). SOURCES: ASM-2. */
export const DEFAULT_PAYLOAD_KG = 500

/** Low-energy ballistic capture reduces lunar orbit insertion; TLI and descent are unchanged. */
export const DELTA_V: Record<TrajectoryType, Record<PhaseId, DeltaVValue>> = {
  direct: {
    tli: { lowKmS: 3.1, nominalKmS: 3.15, highKmS: 3.2, sourceId: "DV-1" },
    loi: { lowKmS: 0.8, nominalKmS: 0.9, highKmS: 0.9, sourceId: "DV-2" },
    descent: { lowKmS: 1.87, nominalKmS: 1.95, highKmS: 2.2, sourceId: "DV-3" },
  },
  "low-energy": {
    tli: { lowKmS: 3.1, nominalKmS: 3.15, highKmS: 3.2, sourceId: "DV-1" },
    // Direct LOI minus the ballistic-capture saving (0.1 to 0.4 km/s, nominal 0.15). SOURCES: DV-4.
    loi: { lowKmS: 0.5, nominalKmS: 0.75, highKmS: 0.8, sourceId: "DV-4" },
    descent: { lowKmS: 1.87, nominalKmS: 1.95, highKmS: 2.2, sourceId: "DV-3" },
  },
}

export const PHASES: PhaseId[] = ["tli", "loi", "descent"]

export type DeltaVBudget = {
  phases: { id: PhaseId; label: string; kmS: number; lowKmS: number; highKmS: number; sourceId: string }[]
  totalKmS: number
  totalLowKmS: number
  totalHighKmS: number
}

export function deltaVBudget(type: TrajectoryType): DeltaVBudget {
  const phases = PHASES.map((id) => {
    const v = DELTA_V[type][id]
    return { id, label: PHASE_LABELS[id], kmS: v.nominalKmS, lowKmS: v.lowKmS, highKmS: v.highKmS, sourceId: v.sourceId }
  })
  const sum = (k: "kmS" | "lowKmS" | "highKmS") => phases.reduce((s, p) => s + p[k], 0)
  return { phases, totalKmS: sum("kmS"), totalLowKmS: sum("lowKmS"), totalHighKmS: sum("highKmS") }
}
