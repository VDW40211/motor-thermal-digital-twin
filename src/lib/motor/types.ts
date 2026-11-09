// Motor Thermal Digital Twin — Type Definitions
// All engineering types used across the application

/** Insulation temperature classes per IEC 60034-1 */
export type InsulationClass = 'A' | 'B' | 'F' | 'H';

/** Enclosure cooling types */
export type EnclosureType = 'TEFC' | 'ODP' | 'WP-II' | 'TEAO' | 'TEBV';

/** Risk severity levels */
export type RiskLevel = 'healthy' | 'monitor' | 'warning' | 'critical' | 'emergency';

/** Motor nameplate parameters — the "known" data */
export interface MotorNameplate {
  ratedPower: number;       // kW
  ratedVoltage: number;     // V (line-to-line)
  ratedCurrent: number;     // A
  ratedSpeed: number;       // RPM
  ratedFrequency: number;   // Hz (typically 50 or 60)
  poles: number;            // Number of poles
  efficiency: number;       // Decimal (e.g., 0.935 for 93.5%)
  powerFactor: number;      // Decimal (e.g., 0.85)
  insulationClass: InsulationClass;
  enclosureType: EnclosureType;
  serviceFactor: number;    // Typically 1.0 or 1.15
  phase: number;            // 3 for three-phase
}

/** Operating conditions — real-time input data */
export interface OperatingConditions {
  voltage: number;          // V (line-to-line average)
  current: number;          // A (average)
  frequency: number;        // Hz
  speed: number;            // RPM (measured or estimated from freq)
  ambientTemp: number;      // °C
  /** Optional: voltage imbalance percentage */
  voltageImbalance?: number;
  /** Optional: current imbalance percentage */
  currentImbalance?: number;
  /** Optional: starts per hour for thermal cycling */
  startsPerHour?: number;
  /** Optional: load torque percentage (if known) */
  loadTorquePercent?: number;
}

/** Segregated loss components (watts) */
export interface SegregatedLosses {
  copperLoss: number;
  coreLoss: number;
  mechanicalLoss: number;
  strayLoadLoss: number;
  totalLosses: number;
}

/** Thermal state of the motor at any point in time */
export interface ThermalState {
  windingTemp: number;       // °C — current winding temperature
  frameTemp: number;         // °C — estimated frame temperature
  ambientTemp: number;       // °C
  tempRise: number;          // °C — temperature rise above ambient
  steadyStateRise: number;   // °C — predicted steady-state rise
  thermalUtilization: number; // 0-1 fraction of thermal limit
  thermalMargin: number;     // °C — remaining margin to trip
  timeToTrip: number;        // minutes — estimated time to reach trip temp
  timeConstant: number;      // minutes — thermal time constant τ
  insulationLifeFactor: number; // 1.0 = normal, <1 = reduced
  coolingEffectiveness: number;  // 0-1
  hotResistance: number;     // Ω — resistance at current temperature
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
};

/** Default motor nameplate (75kW TEFC Class F) */
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
  serviceFactor: 1.0,
  phase: 3,
};