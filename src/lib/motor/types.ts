// Motor Thermal Digital Twin — Type Definitions
// All engineering types used across the application

/** Insulation temperature classes per IEC 60034-1 */
export type InsulationClass = 'A' | 'B' | 'F' | 'H';

/** Enclosure cooling types */
export type EnclosureType = 'TEFC' | 'ODP' | 'WP-II' | 'TEAO' | 'TEBV';

/** Mounting arrangements per IEC 60034-7 / NEMA MG-1 §4.
 *  - HORIZONTAL_FOOT  : IM B3 / NEMA F1 — foot-mounted, horizontal shaft
 *  - VERTICAL_FOOT    : IM V5 / NEMA W1 — foot-mounted, shaft vertical down
 *  - FLANGE           : IM B5 / NEMA C-face — flange on drive end
 *  - WALL_MOUNT       : IM B35 — foot + flange, wall/panel mounted
 */
export type MountingType = 'HORIZONTAL_FOOT' | 'VERTICAL_FOOT' | 'FLANGE' | 'WALL_MOUNT';

/** Risk severity levels */
export type RiskLevel = 'healthy' | 'monitor' | 'warning' | 'critical' | 'emergency';

/** Motor nameplate parameters — the "known" data */
export interface MotorNameplate {
  ratedPower: number;       // kW (shaft output at rated load)
  ratedVoltage: number;     // V (line-to-line, RMS)
  ratedCurrent: number;     // A (line, RMS)
  ratedSpeed: number;       // RPM (at rated load)
  ratedFrequency: number;   // Hz (typically 50 or 60)
  poles: number;            // Number of poles (must be even)
  efficiency: number;       // Decimal (e.g., 0.935 for 93.5%)
  powerFactor: number;      // Decimal (e.g., 0.85) at rated load
  insulationClass: InsulationClass;
  enclosureType: EnclosureType;
  mountingType: MountingType;
  serviceFactor: number;    // Typically 1.0 or 1.15
  phase: number;            // 3 for three-phase
  /** Stator winding connection (affects phase vs line quantities) */
  statorConnection?: 'star' | 'delta';  // default: star
}

/** Operating conditions — real-time input data */
export interface OperatingConditions {
  voltage: number;          // V (line-to-line average)
  current: number;          // A (line average)
  frequency: number;        // Hz
  speed: number;            // RPM (measured or estimated from slip)
  ambientTemp: number;     // °C
  /** Optional: voltage imbalance percentage (NEMA definition) */
  voltageImbalance?: number;
  /** Optional: current imbalance percentage */
  currentImbalance?: number;
  /** Optional: starts per hour for thermal cycling */
  startsPerHour?: number;
  /** Optional: load torque percentage (if known) */
  loadTorquePercent?: number;
  /** Operating mode: normal VFD, constant V/f, direct-on-line */
  vfdMode?: 'none' | 'constant_vf' | 'sensorless_vector' | 'field_weakening';
}

/**
 * Segregated loss components (watts) — IEEE 112 / IEC 60034-2-1
 *
 * Power flow in an induction motor:
 *   P_in (electrical) → P_cu_s (stator copper) → P_core (iron) → P_ag (air-gap)
 *   P_ag → P_cu_r (rotor copper) → P_mech_dev → P_fw (friction+windage)
 *   P_mech_dev − P_fw − P_stray = P_shaft (output)
 *
 * Balance: P_in = P_shaft + P_cu_s + P_cu_r + P_core + P_fw + P_stray
 */
export interface SegregatedLosses {
  /** Stator copper loss: 3 × I_phase² × R_s (W) */
  statorCopperLoss: number;
  /** Rotor copper loss: s × P_airgap (W) */
  rotorCopperLoss: number;
  /** Core (iron) loss: hysteresis + eddy current (W) */
  coreLoss: number;
  /** Friction + windage loss (W) */
  mechanicalLoss: number;
  /** Stray-load loss (W) */
  strayLoadLoss: number;
  /** Additional heating from voltage imbalance (W) */
  imbalanceHeating: number;
  /** Total losses = sum of all above (W) */
  totalLosses: number;
  /** Input electrical power (W) = √3 × V × I × PF */
  inputPower: number;
  /** Air-gap power (W) = P_in − P_cu_s − P_core */
  airGapPower: number;
  /** Mechanical power developed (W) = (1−s) × P_ag */
  mechanicalPower: number;
  /** Shaft output power (W) = P_mech_dev − P_fw − P_stray */
  outputPower: number;
  /** Slip (per-unit) */
  slip: number;
  /** Power balance error (%) — should be <1% for a valid model */
  balanceError: number;
  /**
   * @deprecated Use statorCopperLoss + rotorCopperLoss.
   * Kept for backward compatibility with older UI components.
   */
  copperLoss: number;
  /** @deprecated Use mechanicalLoss. Kept for backward compat. */
  frictionWindageLoss?: number;
}

/** Thermal state of the motor at any point in time.
 *  Multi-node model: winding (fast), core (medium), frame (slow).
 */
export interface ThermalState {
  // ── Primary winding temperature (backward-compat field) ──
  windingTemp: number;       // °C — stator winding (average)
  frameTemp: number;         // °C — external frame surface
  ambientTemp: number;       // °C
  tempRise: number;          // °C — winding rise above ambient
  steadyStateRise: number;   // °C — predicted steady-state rise
  thermalUtilization: number; // 0-1 fraction of thermal limit
  thermalMargin: number;     // °C — remaining margin to trip
  timeToTrip: number;        // minutes — estimated time to reach trip
  timeConstant: number;      // minutes — dominant thermal τ
  insulationLifeFactor: number; // 1.0 = normal, <1 = reduced
  coolingEffectiveness: number;  // 0-1
  hotResistance: number;     // Ω — R at current winding temp
  // ── Multi-node additions ──
  statorCoreTemp?: number;   // °C — stator iron (lagged)
  rotorTemp?: number;        // °C — rotor (est. from slip loss)
  bearingTemp?: number;      // °C — bearings (est. from shaft temp)
  hotSpotTemp?: number;      // °C — winding hot-spot (avg + allowance)
  // ── Per-node time constants (for transparency) ──
  tauWinding?: number;       // minutes
  tauCore?: number;          // minutes
  tauFrame?: number;         // minutes
}

/** Root cause with probability and recommendation */
export interface RootCause {
  name: string;
  probability: number;       // 0-100%
  severity: RiskLevel;
  description: string;
  recommendation: string;
  icon: string;              // Lucide icon name
}

/** Confidence scoring result */
export interface ConfidenceResult {
  score: number;             // 0-100%
  factors: ConfidenceFactor[];
  missing: string[];
  explanation: string;
}

export interface ConfidenceFactor {
  name: string;
  contributed: boolean;
  points: number;
  description: string;
}

/** KPI data for dashboard display */
export interface KPIData {
  windingTemp: number;
  frameTemp: number;
  thermalUtilization: number;
  totalLosses: number;
  efficiency: number;
  powerFactor: number;
  riskLevel: RiskLevel;
  healthScore: number;
  confidenceScore: number;
  timeToTrip: number;
  insulationLifeFactor: number;
  loadPercent: number;
}

/** Simulation data point for trend charts */
export interface SimulationPoint {
  time: number;              // minutes
  windingTemp: number;
  frameTemp: number;
  thermalUtilization: number;
  losses: number;
  current: number;
  voltage: number;
  healthScore: number;
}

/** Full calculation result */
export interface CalculationResult {
  losses: SegregatedLosses;
  thermal: ThermalState;
  rootCauses: RootCause[];
  confidence: ConfidenceResult;
  kpi: KPIData;
  calculations: CalculationDetail[];
}

/** Engineering transparency — step-by-step calculations */
export interface CalculationDetail {
  id: string;
  title: string;
  equation: string;
  inputs: Record<string, number | string>;
  result: number | string;
  unit?: string;
  reference: string;
}

/** Risk level thresholds */
export const RISK_THRESHOLDS = {
  healthy: 60,    // thermal utilization < 60%
  monitor: 75,    // 60-75%
  warning: 85,    // 75-85%
  critical: 95,   // 85-95%
  emergency: 100, // >95%
} as const;

/** Insulation class temperature limits (°C) per IEC 60034-1 */
export const INSULATION_LIMITS: Record<InsulationClass, number> = {
  A: 105,
  B: 130,
  F: 155,
  H: 180,
};

/** Default operating conditions */
export const DEFAULT_OPERATING: OperatingConditions = {
  voltage: 400,
  current: 130,
  frequency: 50,
  speed: 1470,
  ambientTemp: 40,
  voltageImbalance: 0,
  currentImbalance: 0,
  startsPerHour: 0,
  vfdMode: 'none',
};

/** Default motor nameplate (75kW TEFC Class F, star-connected) */
export const DEFAULT_MOTOR: MotorNameplate = {
  ratedPower: 75,
  ratedVoltage: 400,
  ratedCurrent: 130,
  ratedSpeed: 1470,
  ratedFrequency: 50,
  poles: 4,
  efficiency: 0.935,
  powerFactor: 0.85,
  insulationClass: 'F',
  enclosureType: 'TEFC',
  mountingType: 'HORIZONTAL_FOOT',
  serviceFactor: 1.0,
  phase: 3,
  statorConnection: 'star',
};