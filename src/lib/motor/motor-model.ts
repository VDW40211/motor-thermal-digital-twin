// ═══════════════════════════════════════════════════════════════════════════
// Motor Thermal Digital Twin — Motor Parameter Estimation & Loss Computation
// ═══════════════════════════════════════════════════════════════════════════
//
// This module estimates internal motor parameters from nameplate data and
// computes the full loss segregation per IEEE 112 / IEC 60034-2-1.
//
// POWER FLOW (induction machine)
// ───────────────────────────────
//   P_in  = √3 × V_line × I_line × PF                    (electrical input)
//   P_ag  = P_in − P_cu_s − P_core                       (air-gap power)
//   P_cu_r = s × P_ag                                    (rotor copper loss)
//   P_mech_dev = (1 − s) × P_ag                          (mechanical developed)
//   P_shaft = P_mech_dev − P_fw − P_stray                (shaft output)
//
// BALANCE CHECK: P_in ≈ P_shaft + P_cu_s + P_cu_r + P_core + P_fw + P_stray
//
// The legacy `segregateLosses()` function used FIXED RATIOS (60/20/10/10)
// to split total losses. This is an INDUSTRY APPROXIMATION valid only when
// no nameplate efficiency is available. When efficiency IS available, we
// use the input-output method (IEEE 112 Method A) and derive components
// from physical equations rather than fixed ratios.
//
// ASSUMPTIONS REGISTER (documented per the engineering mission)
// ─────────────────────────────────────────────────────────────────────────
// [A1] Stator winding is STAR-connected unless nameplate says otherwise.
//      (Most LV induction motors ≤ 500 kW are star for starting, delta for
//      running; we assume star as the safe default.)
// [A2] Power factor at the operating load equals the rated power factor.
//      (In reality PF varies with load; this is an approximation.)
// [A3] Stator resistance at 25°C is derived from rated copper loss and
//      rated current. (In production, this should be measured via DC
//      resistance test per IEEE 112.)
// [A4] Core loss split: 60% hysteresis + 40% eddy current at rated freq.
//      (Empirical; actual split depends on lamination thickness & grade.)
// [A5] Mechanical (friction+windage) loss at rated speed is 10% of total
//      rated losses. (IEEE 112 typical range 5–15%.)
// [A6] Stray-load loss at rated load is 1.8% of rated output (IEC 60034-2-1
//      assumption for 1–125 kW machines).
// [A7] Reference temperature for resistance is 25°C (cold). IEC 60034-2-1
//      uses 95°C for hot-rated Class F; we use 25°C for the cold measurement.
//
// ═══════════════════════════════════════════════════════════════════════════

import type {
  MotorNameplate,
  OperatingConditions,
  SegregatedLosses,
  InsulationClass,
} from './types';
import { INSULATION_LIMITS } from './types';
import {
  SQRT3,
  threePhasePower,
  statorCopperLoss,
  rotorCopperLoss,
  slipFromSpeed,
  synchronousSpeed,
  coreLossSeparated,
  mechanicalLoss,
  strayLoadLoss,
  hotResistance,
  coolingEffectiveness,
  voltageImbalanceDerating,
  imbalanceHeating,
  safeDiv,
  powerBalanceError,
} from './physics';

// ─────────────────────────────────────────────────────────────────────────────
// A. Rated-parameter estimation (from nameplate)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate per-phase stator resistance at REFERENCE temperature (25°C).
 *
 * From the rated copper loss and rated current:
 *   R_s_25 = P_cu_s_rated / (3 × I_phase_rated²)
 *
 * ASSUMPTION: rated copper loss = 60% of total rated losses (industry approx).
 * In production, R_s should be measured via DC resistance test (IEEE 112 §5.2).
 *
 * @param ratedCopperLoss  Rated stator copper loss (W)
 * @param ratedCurrentLine  Rated line current (A)
 * @param connection        Stator connection (star/delta)
 * @returns                 Per-phase stator resistance at 25°C (Ω)
 */
export function estimateResistance(
  ratedCopperLoss: number,
  ratedCurrentLine: number,
  connection: 'star' | 'delta' = 'star',
): number {
  if (ratedCurrentLine <= 0) return 0;
  // I_phase depends on connection
  const iPhase = connection === 'star'
    ? ratedCurrentLine
    : ratedCurrentLine / SQRT3;
  if (iPhase <= 0) return 0;
  return ratedCopperLoss / (3 * iPhase * iPhase);
}

/**
 * Estimate thermal time constant (τ) from motor power rating.
 *
 * Larger motors have more thermal mass → larger τ.
 *
 *   < 1 kW:     8–12 min   (very fast response)
 *   1–10 kW:    15–20 min
 *   10–100 kW:  25–35 min
 *   100–1000 kW: 45–60 min
 *   > 1000 kW:  60–90 min
 *
 * These are INDUSTRY-TYPICAL values for the WINDING time constant.
 * The frame time constant is typically 3–5× larger.
 *
 * Reference: Motor manufacturer data sheets; Bolton, "Mechanical Science."
 */
export function estimateThermalTimeConstant(powerKW: number): number {
  if (powerKW <= 0) return 15;
  if (powerKW < 1) return 8 + (powerKW) * 4;              // 8–12 min
  if (powerKW < 10) return 12 + ((powerKW - 1) / 9) * 8;  // 12–20 min
  if (powerKW <= 100) return 25 + ((powerKW - 10) / 90) * 10; // 25–35 min
  if (powerKW <= 1000) return 45 + ((powerKW - 100) / 900) * 15; // 45–60 min
  return 60 + Math.min(30, ((powerKW - 1000) / 4000) * 30); // 60–90 min
}

/**
 * Estimate frame (external) thermal time constant.
 * Typically 3–5× the winding τ.
 */
export function estimateFrameTimeConstant(powerKW: number): number {
  return estimateThermalTimeConstant(powerKW) * 4;
}

/**
 * Estimate stator-core thermal time constant.
 * Typically 2× the winding τ (more mass, less direct heat).
 */
export function estimateCoreTimeConstant(powerKW: number): number {
  return estimateThermalTimeConstant(powerKW) * 2;
}

/**
 * Thermal conductance from rated losses and rated temperature rise.
 *
 *   G_th = P_loss_rated / ΔT_rated
 *
 * where ΔT_rated is the rated winding temperature rise above ambient.
 *
 * For a multi-node model, this is the OVERALL conductance (winding → ambient).
 * The inter-node conductances (winding→core→frame→ambient) are estimated
 * separately based on typical thermal resistance ratios.
 */
export function estimateThermalConductance(
  ratedLosses: number,
  ratedTempRise: number,
): number {
  if (ratedTempRise <= 0) return 1;
  return ratedLosses / ratedTempRise;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Insulation class helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getInsulationLimit(insClass: InsulationClass): number {
  return INSULATION_LIMITS[insClass];
}

/**
 * Rated temperature RISE above ambient for an insulation class.
 *
 * Per IEC 60034-1, the rated rise is the class limit minus ambient (40°C)
 * minus a hot-spot allowance (5–15°C depending on class).
 *
 *   ΔT_rated = T_class − T_ambient − T_hotspot_allowance
 *
 * Example for Class F: 155 − 40 − 15 = 100°C rise
 */
export function calculateRatedTempRise(
  insClass: InsulationClass,
  ambientTemp: number = 40,
): number {
  const limit = getInsulationLimit(insClass);
  const hotspotAllowance: Record<InsulationClass, number> = {
    A: 5, B: 10, F: 15, H: 15,
  };
  return limit - ambientTemp - hotspotAllowance[insClass];
}

/**
 * Trip temperature = insulation class limit.
 * Above this, insulation degrades rapidly.
 */
export function getTripTemperature(insClass: InsulationClass): number {
  return getInsulationLimit(insClass);
}

/**
 * Service-factor-adjusted trip temperature.
 *
 * NEMA MG-1 permits SF motors to operate slightly above class limit
 * at SF load. Approximate: +20°C per 0.1 SF above 1.0.
 */
export function getAdjustedTripTemperature(
  insClass: InsulationClass,
  serviceFactor: number,
): number {
  const limit = getInsulationLimit(insClass);
  if (serviceFactor > 1.0) {
    return limit + (serviceFactor - 1.0) * 20;
  }
  return limit;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Speed, slip, synchronous-speed helpers
// ─────────────────────────────────────────────────────────────────────────────

export { synchronousSpeed, slipFromSpeed };

/**
 * Estimate slip from rated and synchronous speed.
 * (Re-exported from physics for backward compat.)
 */
export function estimateSlip(ratedSpeed: number, syncSpeed: number): number {
  return slipFromSpeed(ratedSpeed, syncSpeed);
}

export function applyServiceFactor(
  ratedValue: number,
  serviceFactor: number,
): number {
  return ratedValue * serviceFactor;
}

export function getMotorSizeCategory(powerKW: number): string {
  if (powerKW < 1) return 'Fractional';
  if (powerKW < 10) return 'Small';
  if (powerKW < 100) return 'Medium';
  if (powerKW < 1000) return 'Large';
  return 'Very Large';
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Rated loss segregation (from nameplate efficiency)
// ─────────────────────────────────────────────────────────────────────────────

/** Result of rated loss segregation. */
export interface RatedLossBreakdown {
  /** Total rated losses (W) = P_in − P_out */
  total: number;
  /** Stator copper loss (W) — estimated */
  statorCopper: number;
  /** Rotor copper loss (W) — estimated from slip */
  rotorCopper: number;
  /** Core (iron) loss (W) — hysteresis + eddy */
  core: number;
  /** Core loss split: hysteresis portion (W) */
  coreHysteresis: number;
  /** Core loss split: eddy-current portion (W) */
  coreEddy: number;
  /** Mechanical (friction + windage) loss (W) */
  mechanical: number;
  /** Stray-load loss (W) */
  stray: number;
  /** Per-phase stator resistance at 25°C (Ω) */
  statorResistance25: number;
  /** Synchronous speed (rpm) */
  syncSpeed: number;
  /** Rated slip (per-unit) */
  slip: number;
  /** Air-gap power at rated (W) */
  airGapPower: number;
  /** Input power at rated (W) */
  inputPower: number;
}

/**
 * Segregate rated losses from nameplate data using physical equations.
 *
 * Method (IEEE 112 input-output + IEC 60034-2-1 assumptions):
 *
 *   1. P_in_rated = P_out_rated / η_rated
 *   2. P_loss_total = P_in_rated − P_out_rated
 *   3. n_sync = 120 × f / p
 *   4. s_rated = (n_sync − n_rated) / n_sync
 *   5. P_stray = 0.018 × P_out_rated    (IEC 60034-2-1, 1–125 kW)
 *   6. P_fw = 0.10 × P_loss_total        (industry typical, see A5)
 *   7. P_core = 0.20 × P_loss_total      (industry typical, see A4)
 *   8. P_cu_r = s × P_ag                 (rotor copper from slip)
 *   9. P_cu_s = P_loss_total − P_cu_r − P_core − P_fw − P_stray
 *
 * Step 9 solves for stator copper as the residual, ensuring energy balance.
 *
 * @param nameplate  Motor nameplate
 * @returns          Rated loss breakdown
 */
export function segregateRatedLosses(nameplate: MotorNameplate): RatedLossBreakdown {
  const outputW = nameplate.ratedPower * 1000;
  const inputW = outputW / nameplate.efficiency;
  const totalLoss = inputW - outputW;

  const syncSpeed = synchronousSpeed(nameplate.ratedFrequency, nameplate.poles);
  const slip = slipFromSpeed(nameplate.ratedSpeed, syncSpeed);

  // Stray-load loss: IEC 60034-2-1 assumption (1.8% of rated output for 1–125 kW)
  // For larger motors, 1.5%; for >1000 kW, 1.0%.
  const strayFraction = nameplate.ratedPower <= 125 ? 0.018 :
                        nameplate.ratedPower <= 1000 ? 0.015 : 0.010;
  const stray = outputW * strayFraction;

  // Mechanical (friction + windage): 10% of total losses (A5)
  const mechanical = totalLoss * 0.10;

  // Core (iron) loss: 20% of total losses (A4)
  const core = totalLoss * 0.20;
  // Split core into hysteresis (60%) and eddy (40%) at rated frequency
  const coreHysteresis = core * 0.60;
  const coreEddy = core * 0.40;

  // Air-gap power = P_in − P_cu_s − P_core
  // Rotor copper loss = s × P_ag
  // P_cu_s = P_loss − P_cu_r − P_core − P_fw − P_stray
  // Substitute: P_cu_s = P_loss − s×(P_in − P_cu_s − P_core) − P_core − P_fw − P_stray
  // Solve for P_cu_s:
  //   P_cu_s (1 − s) = P_loss − s×(P_in − P_core) − P_core − P_fw − P_stray
  //   P_cu_s = [P_loss − s×(P_in − P_core) − P_core − P_fw − P_stray] / (1 − s)
  const numerator = totalLoss - slip * (inputW - core) - core - mechanical - stray;
  const statorCopper = Math.max(0, numerator / Math.max(0.01, 1 - slip));

  // Air-gap power and rotor copper loss
  const airGapPower = inputW - statorCopper - core;
  const rotorCopper = slip * airGapPower;

  // Stator resistance at 25°C
  const connection = nameplate.statorConnection ?? 'star';
  const statorResistance25 = estimateResistance(statorCopper, nameplate.ratedCurrent, connection);

  return {
    total: totalLoss,
    statorCopper,
    rotorCopper,
    core,
    coreHysteresis,
    coreEddy,
    mechanical,
    stray,
    statorResistance25,
    syncSpeed,
    slip,
    airGapPower,
    inputPower: inputW,
  };
}

/**
 * LEGACY: segregate total losses using fixed ratios.
 *
 * @deprecated Use segregateRatedLosses() for proper IEEE 112 segregation.
 * This function is retained only for backward compatibility with code
 * that expects the old 60/20/10/10 split.
 */
export function segregateLosses(
  ratedPower: number,
  efficiency: number,
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

// ─────────────────────────────────────────────────────────────────────────────
// E. Operating-point loss computation (the main loss function)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute segregated losses at the current operating point.
 *
 * This is the FULL physical model. Power flow:
 *
 *   P_in = √3 × V × I × PF                          (electrical input)
 *   P_cu_s = 3 × I_phase² × R_s(T_winding)         (stator copper, temp-corrected)
 *   P_ag = P_in − P_cu_s − P_core                   (air-gap power)
 *   P_cu_r = s × P_ag                               (rotor copper, from slip)
 *   P_mech_dev = (1 − s) × P_ag                     (mechanical developed)
 *   P_shaft = P_mech_dev − P_fw − P_stray           (shaft output)
 *
 * Temperature coupling: R_s is corrected for the current winding temperature,
 * so copper losses INCREASE as the motor heats up — a critical feedback that
 * the legacy model missed.
 *
 * @param nameplate        Motor nameplate
 * @param conditions       Current operating conditions
 * @param windingTempC     Current winding temperature (°C) for R correction
 * @param ratedBreakdown   Pre-computed rated losses (avoids recomputation)
 * @returns                Full SegregatedLosses with power-balance check
 */
export function computeLosses(
  nameplate: MotorNameplate,
  conditions: OperatingConditions,
  windingTempC: number,
  ratedBreakdown: RatedLossBreakdown,
): SegregatedLosses {
  const connection = nameplate.statorConnection ?? 'star';

  // ── 1. Electrical input power ──
  // P_in = √3 × V_line × I_line × PF
  // ASSUMPTION A2: PF at operating load = rated PF (approximation)
  const inputPower = threePhasePower(
    conditions.voltage,
    conditions.current,
    nameplate.powerFactor,
  );

  // ── 2. Stator copper loss (temperature-corrected) ──
  // R_s(T) = R_s(25) × (235 + T) / (235 + 25)
  const rHot = hotResistance(
    ratedBreakdown.statorResistance25,
    25,
    windingTempC,
  );
  const pStatorCopper = statorCopperLoss(
    conditions.current,
    rHot,
    connection,
  );

  // ── 3. Core (iron) loss — separated hysteresis + eddy ──
  const coreResult = coreLossSeparated(
    conditions.voltage,
    conditions.frequency,
    nameplate.ratedVoltage,
    nameplate.ratedFrequency,
    ratedBreakdown.coreHysteresis,
    ratedBreakdown.coreEddy,
  );
  const pCore = coreResult.total;

  // ── 4. Air-gap power and slip ──
  const syncSpeed = synchronousSpeed(conditions.frequency, nameplate.poles);
  const slip = slipFromSpeed(conditions.speed, syncSpeed);
  const airGapPower = Math.max(0, inputPower - pStatorCopper - pCore);

  // ── 5. Rotor copper loss (from slip × air-gap) ──
  const pRotorCopper = rotorCopperLoss(slip, airGapPower);

  // ── 6. Mechanical (friction + windage) loss ──
  const pMech = mechanicalLoss(
    conditions.speed,
    nameplate.ratedSpeed,
    ratedBreakdown.mechanical,
  );

  // ── 7. Stray-load loss (∝ I²) ──
  const pStray = strayLoadLoss(
    conditions.current,
    nameplate.ratedCurrent,
    ratedBreakdown.stray,
  );

  // ── 8. Voltage-imbalance additional heating ──
  const vImb = conditions.voltageImbalance ?? 0;
  const pImbalance = imbalanceHeating(vImb, pStatorCopper);

  // ── 9. Mechanical power developed + shaft output ──
  const mechDeveloped = (1 - slip) * airGapPower;
  const outputPower = Math.max(0, mechDeveloped - pMech - pStray);

  // ── 10. Total losses + power balance ──
  const totalLosses = pStatorCopper + pRotorCopper + pCore + pMech + pStray + pImbalance;
  const balanceError = powerBalanceError(inputPower, outputPower, totalLosses);

  return {
    statorCopperLoss: pStatorCopper,
    rotorCopperLoss: pRotorCopper,
    coreLoss: pCore,
    mechanicalLoss: pMech,
    strayLoadLoss: pStray,
    imbalanceHeating: pImbalance,
    totalLosses,
    inputPower,
    airGapPower,
    mechanicalPower: mechDeveloped,
    outputPower,
    slip,
    balanceError,
    // Backward-compat alias
    copperLoss: pStatorCopper + pRotorCopper,
  };
}

/**
 * LEGACY computeLosses signature — wraps the new one with a default
 * winding temperature of 25°C (no thermal correction).
 *
 * @deprecated Use the new signature with explicit windingTempC.
 */
export function computeLossesLegacy(
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
  voltageImbalance: number = 0,
): SegregatedLosses {
  const nameplate: MotorNameplate = {
    ratedPower, ratedVoltage, ratedCurrent, ratedSpeed,
    ratedFrequency, poles: 4, efficiency, powerFactor: 0.85,
    insulationClass: 'F', enclosureType: 'TEFC',
    mountingType: 'HORIZONTAL_FOOT', serviceFactor: 1.0, phase: 3,
    statorConnection: 'star',
  };
  const conditions: OperatingConditions = {
    voltage: currentVoltage, current: currentCurrent,
    frequency: currentFrequency, speed: currentSpeed,
    ambientTemp: 40, voltageImbalance,
  };
  const rated = segregateRatedLosses(nameplate);
  return computeLosses(nameplate, conditions, 25, rated);
}
