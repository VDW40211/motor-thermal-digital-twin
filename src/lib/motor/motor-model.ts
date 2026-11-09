// Motor Thermal Digital Twin — Motor Parameter Estimation
// Estimates internal motor parameters from nameplate data
// All approximations are documented with engineering rationale

import type {
  MotorNameplate,
  SegregatedLosses,
  InsulationClass,
  EnclosureType,
} from './types';
import { INSULATION_LIMITS } from './types';

/**
 * Segregate total losses into components from rated power and efficiency.
 * When only efficiency is known, losses are split using typical ratios:
 *   Copper: 60%, Core: 20%, Mechanical: 10%, Stray: 10%
 * Reference: Industry approximation for general-purpose induction motors
 */
export function segregateLosses(
  ratedPower: number,    // kW
  efficiency: number     // decimal, e.g. 0.935
): { copper: number; core: number; mechanical: number; stray: number; total: number } {
  const outputW = ratedPower * 1000;
  const inputW = outputW / efficiency;
  const totalLoss = inputW - outputW;

  return {
    copper: totalLoss * 0.60,
    core: totalLoss * 0.20,
    mechanical: totalLoss * 0.10,
    stray: totalLoss * 0.10,
    total: totalLoss,
  };
}

/**
 * Estimate stator winding resistance from rated copper loss
 * R = P_cu_rated / (3 × I_rated²)
 * This gives the resistance per phase at rated (hot) condition
 */
export function estimateResistance(
  copperLossRated: number,  // W
  ratedCurrent: number       // A
): number {
  if (ratedCurrent <= 0) return 0;
  return copperLossRated / (3 * Math.pow(ratedCurrent, 2));
}

/**
 * Estimate thermal time constant (τ) from motor power rating
 * Based on motor thermal mass — larger motors have larger τ
 * Reference: Industry approximation
 *   Small (<10kW): 15-20 min
 *   Medium (10-100kW): 25-35 min
 *   Large (>100kW): 40-60 min
 */
export function estimateThermalTimeConstant(powerKW: number): number {
  if (powerKW <= 0) return 20;
  if (powerKW < 10) return 15 + (powerKW / 10) * 5;           // 15-20 min
  if (powerKW <= 100) return 25 + ((powerKW - 10) / 90) * 10;  // 25-35 min
  return 40 + Math.min(20, ((powerKW - 100) / 400) * 20);     // 40-60 min
}

/**
 * Calculate thermal conductance G_th from rated conditions
 * G_th = P_rated_losses / ΔT_rated
 * where ΔT_rated is the typical temperature rise for the insulation class
 */
export function estimateThermalConductance(
  ratedLosses: number,    // W
  ratedTempRise: number   // °C
): number {
  if (ratedTempRise <= 0) return 1; // Prevent division by zero
  return ratedLosses / ratedTempRise;
}

/**
 * Get insulation class temperature limit per IEC 60034-1
 */
export function getInsulationLimit(insClass: InsulationClass): number {
  return INSULATION_LIMITS[insClass];
}

/**
 * Calculate typical rated temperature rise for an insulation class
 * Typical margins: 10-15°C below the absolute limit for hot-spot allowance
 */
export function calculateRatedTempRise(
  insClass: InsulationClass,
  ambientTemp: number = 40
): number {
  const limit = getInsulationLimit(insClass);
  // Typical rated rise is 10°C below the absolute limit
  // to account for hot-spot temperature differential
  return limit - ambientTemp - 10;
}

/**
 * Apply service factor to rated parameters
 * NEMA MG-1: Motor can operate continuously at SF × rated load
 */
export function applyServiceFactor(
  ratedValue: number,
  serviceFactor: number
): number {
  return ratedValue * serviceFactor;
}

/**
 * Calculate the trip temperature (absolute limit for the motor)
 */
export function getTripTemperature(insClass: InsulationClass): number {
  return getInsulationLimit(insClass);
}

/**
 * Get SF-adjusted trip temperature
 */
export function getAdjustedTripTemperature(
  insClass: InsulationClass,
  serviceFactor: number
): number {
  const limit = getInsulationLimit(insClass);
  if (serviceFactor > 1.0) {
    // SF motors can run hotter by a small margin
    return limit + (serviceFactor - 1.0) * 20; // ~20°C per 0.1 SF
  }
  return limit;
}

/**
 * Estimate synchronous speed from frequency and poles
 */
export function synchronousSpeed(frequency: number, poles: number): number {
  if (poles <= 0) return 0;
  return (120 * frequency) / poles;
}

/**
 * Estimate slip from rated and synchronous speed
 */
export function estimateSlip(ratedSpeed: number, syncSpeed: number): number {
  if (syncSpeed <= 0) return 0;
  return (syncSpeed - ratedSpeed) / syncSpeed;
}

/**
 * Get motor size category for display
 */
export function getMotorSizeCategory(powerKW: number): string {
  if (powerKW < 1) return 'Fractional';
  if (powerKW < 10) return 'Small';
  if (powerKW < 100) return 'Medium';
  if (powerKW < 1000) return 'Large';
  return 'Very Large';
}

/**
 * Build complete segregated losses object from operating conditions
 */
export function computeLosses(
  ratedPower: number,
  ratedVoltage: number,
  ratedCurrent: number,
  ratedFrequency: number,
  ratedSpeed: number,
  efficiency: number,
  currentVoltage: number,
  currentFrequency: number,
  currentSpeed: number,
  currentCurrent: number,
  voltageImbalance: number = 0
): SegregatedLosses {
  // Get rated loss segregation
  const rated = segregateLosses(ratedPower, efficiency);

  // Current resistance (at operating temp — approximated)
  const R = estimateResistance(rated.copper, ratedCurrent);

  // Copper loss scales with I²
  const pCopper = 3 * Math.pow(currentCurrent, 2) * R;

  // Core loss: Steinmetz scaling
  const vRatio = currentVoltage / ratedVoltage;
  const fRatio = currentFrequency / ratedFrequency;
  const pCore = rated.core * Math.pow(vRatio, 2) * Math.pow(fRatio, 1.6);

  // Mechanical loss: proportional to speed
  const nRatio = Math.max(0, currentSpeed / ratedSpeed);
  const pMech = rated.mechanical * nRatio;

  // Stray load loss: proportional to I²
  const iRatio = currentCurrent / ratedCurrent;
  const pStray = rated.stray * Math.pow(iRatio, 2);

  // Additional heating from voltage imbalance
  // NEMA: V imbalance adds roughly (V_imb%)² × I² × R derating
  const imbalanceHeating = Math.pow(voltageImbalance / 100, 2) * pCopper;

  return {
    copperLoss: pCopper + imbalanceHeating,
    coreLoss: pCore,
    mechanicalLoss: pMech,
    strayLoadLoss: pStray,
    totalLosses: pCopper + imbalanceHeating + pCore + pMech + pStray,
  };
}