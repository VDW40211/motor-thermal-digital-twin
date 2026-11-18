// ═══════════════════════════════════════════════════════════════════════════
// Motor Thermal Digital Twin — Fundamental Physics Equations
// ═══════════════════════════════════════════════════════════════════════════
//
// All functions are PURE (no side effects, no I/O).
// Every equation is documented with:
//   - The physical principle
//   - The standard or reference (where applicable)
//   - Units (SI throughout: V, A, W, °C, Ω, Hz, rpm)
//   - Assumptions and limitations
//
// CONVENTIONS
// ───────────
// All voltages are LINE-TO-LINE (RMS) unless explicitly suffixed `_phase`.
// All currents are LINE (RMS) unless explicitly suffixed `_phase`.
// Power is in WATTS (not kW — conversion happens at the UI layer).
// Temperature is in °C.
// Resistance is PER-PHASE at the reference temperature.
//
// Three-phase relationships (balanced):
//   Star (Y):  V_phase = V_line / √3,   I_phase = I_line
//   Delta (Δ): V_phase = V_line,         I_phase = I_line / √3
//
// For a balanced 3-phase system, total power is the same in both:
//   P = √3 × V_line × I_line × PF = 3 × V_phase × I_phase × PF
//
// COPPER LOSS — STATOR vs ROTOR
// ─────────────────────────────
// Induction motors have TWO copper losses:
//   P_cu_s = 3 × I_s_phase² × R_s        (stator, in the stator windings)
//   P_cu_r = s × P_ag                     (rotor, where P_ag = air-gap power)
//
// The air-gap power is the power crossing the air gap:
//   P_ag = P_in − P_cu_s − P_core
//
// Rotor copper loss is the slip fraction of air-gap power:
//   P_cu_r = s × P_ag
//   P_mech_dev = (1 − s) × P_ag          (mechanical power developed)
//   P_shaft = P_mech_dev − P_fw − P_stray (shaft output)
//
// This is the STANDARD induction machine power flow per IEEE 112 / IEC 60034-2.
// ═══════════════════════════════════════════════════════════════════════════

import type { InsulationClass } from './types';

export const SQRT3 = Math.sqrt(3);

// ─────────────────────────────────────────────────────────────────────────────
// A. Three-phase electrical calculations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three-phase input power from line quantities.
 *
 *   P_in = √3 × V_line × I_line × PF
 *
 * Reference: Fundamental balanced 3-phase power equation.
 * Valid for sinusoidal, balanced supplies. For unbalanced supplies,
 * use the two-wattmeter or sum-of-phases method (not implemented here).
 *
 * @param voltageLine  Line-to-line RMS voltage (V)
 * @param currentLine  Line RMS current (A)
 * @param powerFactor  Dimensionless (0–1)
 * @returns            Input electrical power (W)
 */
export function threePhasePower(
  voltageLine: number,
  currentLine: number,
  powerFactor: number,
): number {
  return SQRT3 * voltageLine * currentLine * powerFactor;
}

/**
 * Line current from three-phase power.
 *
 *   I_line = P / (√3 × V_line × PF)
 */
export function lineCurrentFromPower(
  powerW: number,
  voltageLine: number,
  powerFactor: number,
): number {
  if (voltageLine <= 0 || powerFactor <= 0) return 0;
  return powerW / (SQRT3 * voltageLine * powerFactor);
}

/**
 * Convert line current to phase current for a given connection.
 *
 *   Star:  I_phase = I_line
 *   Delta: I_phase = I_line / √3
 */
export function phaseCurrent(
  currentLine: number,
  connection: 'star' | 'delta',
): number {
  return connection === 'star' ? currentLine : currentLine / SQRT3;
}

/**
 * Convert line-to-line voltage to phase voltage.
 *
 *   Star:  V_phase = V_line / √3
 *   Delta: V_phase = V_line
 */
export function phaseVoltage(
  voltageLine: number,
  connection: 'star' | 'delta',
): number {
  return connection === 'star' ? voltageLine / SQRT3 : voltageLine;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Copper losses (stator + rotor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stator copper loss (3-phase I²R).
 *
 *   P_cu_s = 3 × I_phase² × R_s_phase
 *
 * For a balanced system, I_phase depends on the stator connection:
 *   Star:  I_phase = I_line
 *   Delta: I_phase = I_line / √3
 *
 * Reference: Ohm's law applied to 3-phase windings.
 *
 * @param currentLine   Line RMS current (A)
 * @param resistance    Stator resistance PER PHASE at the operating temp (Ω)
 * @param connection    Stator winding connection
 * @returns             Stator copper loss (W)
 */
export function statorCopperLoss(
  currentLine: number,
  resistance: number,
  connection: 'star' | 'delta' = 'star',
): number {
  const iPhase = phaseCurrent(currentLine, connection);
  return 3 * iPhase * iPhase * resistance;
}

/**
 * Rotor copper loss from slip and air-gap power.
 *
 *   P_cu_r = s × P_ag
 *
 * where  s = (n_sync − n) / n_sync  (per-unit slip)
 *        P_ag = P_in − P_cu_s − P_core  (air-gap power)
 *
 * Reference: IEEE 112 / IEC 60034-2. This is the fundamental induction
 * machine power-flow relationship. The rotor copper loss is exactly the
 * slip fraction of the power crossing the air gap.
 *
 * @param slip       Per-unit slip (0 = synchronous, 1 = standstill)
 * @param airGapPower  Power crossing the air gap (W)
 * @returns          Rotor copper loss (W) — always ≥ 0
 */
export function rotorCopperLoss(
  slip: number,
  airGapPower: number,
): number {
  return Math.max(0, slip) * Math.max(0, airGapPower);
}

/**
 * Slip from synchronous and actual speed.
 *
 *   s = (n_sync − n) / n_sync
 *
 * Returns 0 if n_sync ≤ 0 (invalid) and clamps to [0, 2] for safety
 * (slip > 1 means braking/plugging region).
 */
export function slipFromSpeed(
  actualSpeed: number,
  synchronousSpeed: number,
): number {
  if (synchronousSpeed <= 0) return 0;
  return Math.max(0, Math.min(2, (synchronousSpeed - actualSpeed) / synchronousSpeed));
}

/**
 * Synchronous speed from supply frequency and pole count.
 *
 *   n_sync = 120 × f / p   (rpm)
 *
 * Reference: Fundamental induction machine equation.
 */
export function synchronousSpeed(frequency: number, poles: number): number {
  if (poles <= 0) return 0;
  return (120 * frequency) / poles;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Core (iron) losses — hysteresis + eddy current separated
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core loss with SEPARATED hysteresis and eddy-current components.
 *
 *   P_core = P_h + P_e
 *   P_h = k_h × f × B^α              (hysteresis, α ≈ 1.6–2.2, often 2.0)
 *   P_e = k_e × f² × B²              (eddy current)
 *
 * Since B ∝ V/f (for constant flux), and we scale from a rated point:
 *   P_h ≈ P_h_rated × (V/V_r × f_r/f) × (f/f_r)^α_h
 *   P_e ≈ P_e_rated × (V/V_r)² × (f/f_r)²
 *
 * The classical Steinmetz approximation P ∝ f^1.6 is a BLEND of these
 * two effects and is only valid near rated flux. Separating them gives
 * better accuracy at VFD-operated frequencies (especially below 20 Hz
 * where the simple f^1.6 model under-predicts eddy losses).
 *
 * ASSUMPTION: flux is proportional to V/f (constant V/f control). This
 * breaks down in field-weakening (above base speed) and saturation.
 *
 * @returns { hysteresis, eddy, total } in watts
 */
export function coreLossSeparated(
  voltage: number,
  frequency: number,
  ratedVoltage: number,
  ratedFrequency: number,
  hysteresisRated: number,
  eddyRated: number,
  steinmetzExponent: number = 2.0,
): { hysteresis: number; eddy: number; total: number } {
  const vRatio = safeDiv(voltage, ratedVoltage);
  const fRatio = safeDiv(frequency, ratedFrequency);
  const fluxRatio = safeDiv(vRatio, fRatio); // B/B_rated under constant V/f

  // Hysteresis: ∝ f × B^α  (here using α = steinmetzExponent, typically 2.0)
  const hysteresis = hysteresisRated * fRatio * Math.pow(fluxRatio, steinmetzExponent);

  // Eddy current: ∝ f² × B²
  const eddy = eddyRated * fRatio * fRatio * fluxRatio * fluxRatio;

  return { hysteresis, eddy, total: hysteresis + eddy };
}

/**
 * Legacy single-exponent core loss (retained for backward compat).
 * P_core ≈ P_core_rated × (V/V_r)² × (f/f_r)^1.6
 *
 * NOTE: This is the simplified Steinmetz blend. Prefer coreLossSeparated()
 * for VFD applications. The 1.6 exponent is an empirical blend of
 * hysteresis (~1.0) and eddy (~2.0) and is approximate.
 */
export function coreLoss(
  voltage: number,
  frequency: number,
  coreLossRated: number,
  ratedVoltage: number,
  ratedFrequency: number,
): number {
  const vRatio = safeDiv(voltage, ratedVoltage);
  const fRatio = safeDiv(frequency, ratedFrequency);
  return coreLossRated * vRatio * vRatio * Math.pow(fRatio, 1.6);
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Mechanical (friction + windage) losses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mechanical loss (friction + windage).
 *
 *   P_fw ≈ P_fw_rated × (n / n_rated)^k
 *
 * Friction (bearing) is roughly ∝ speed (k=1).
 * Windage (air drag) is roughly ∝ speed³ for turbulent flow, but for
 * the narrow speed range of a motor the linear approximation is standard.
 *
 * Reference: IEEE 112 method; industry approximation.
 *
 * @param exponent  1.0 (friction-dominated, default) or higher for windage.
 */
export function mechanicalLoss(
  speed: number,
  ratedSpeed: number,
  mechLossRated: number,
  exponent: number = 1.0,
): number {
  const ratio = safeDiv(Math.max(0, speed), ratedSpeed);
  return mechLossRated * Math.pow(ratio, exponent);
}

// ─────────────────────────────────────────────────────────────────────────────
// E. Stray-load losses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stray-load loss (additional load losses).
 *
 *   P_stray ≈ P_stray_rated × (I / I_rated)²
 *
 * Reference: IEEE 112 Method B / IEC 60034-2-1. Stray-load losses
 * account for high-frequency flux pulsation, surface eddy currents,
 * and cross-magnetization effects not captured by the core loss model.
 *
 * The rated value is typically assumed as a fraction of rated output
 * per the standard (e.g., 1.8% for 1–125 kW machines per IEC 60034-2-1).
 */
export function strayLoadLoss(
  current: number,
  ratedCurrent: number,
  strayLossRated: number,
): number {
  const ratio = safeDiv(current, ratedCurrent);
  return strayLossRated * ratio * ratio;
}

// ─────────────────────────────────────────────────────────────────────────────
// F. Temperature-dependent copper resistance (thermal-electrical coupling)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copper resistance at operating temperature.
 *
 *   R_T = R_ref × (235 + T) / (235 + T_ref)
 *
 * The constant 235°C is the inferred absolute zero for copper
 * (α₀ = 1/235 per °C at 0°C). Some texts use 234.5; the difference
 * is negligible for engineering purposes.
 *
 * Reference: Fundamental copper property; IEEE 112.
 *
 * @param resistanceRef  Resistance at T_ref (Ω, per phase)
 * @param tempRef        Reference temperature (°C), typically 25 or 75
 * @param tempActual     Operating temperature (°C)
 * @returns              Resistance at tempActual (Ω)
 */
export function hotResistance(
  resistanceRef: number,
  tempRef: number,
  tempActual: number,
): number {
  return resistanceRef * (235 + tempActual) / (235 + tempRef);
}

/**
 * Temperature coefficient of copper resistance (per °C at 20°C).
 * α₂₀ = 1 / (235 + 20) ≈ 0.00393 /°C
 *
 * Useful for sensitivity analysis.
 */
export const COPPER_TEMP_COEFF_20C = 1 / (235 + 20);

// ─────────────────────────────────────────────────────────────────────────────
// G. Thermal model equations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Steady-state temperature rise (Newton's law of cooling).
 *
 *   ΔT_ss = P / G_th
 *
 * where G_th is the thermal conductance (W/°C) from the heat source
 * to ambient. For a motor, G_th combines conduction through the frame,
 * convection to air, and (minor) radiation.
 *
 * Reference: Newton's law of cooling.
 */
export function temperatureRise(
  power: number,
  thermalConductance: number,
): number {
  if (thermalConductance <= 0) return Infinity;
  return power / thermalConductance;
}

/**
 * First-order thermal response (analytical solution).
 *
 *   T(t) = T_ss − (T_ss − T_0) × e^(−t/τ)
 *
 * This is the closed-form solution to the ODE:
 *   τ × dT/dt = T_ss − T
 *
 * Valid for CONSTANT heat generation and CONSTANT cooling. When either
 * changes, use numerical integration (see multiNodeThermalStep).
 *
 * Reference: Standard first-order system response.
 *
 * @param steadyStateTemp  T_ss — the temperature the body approaches (°C)
 * @param initialTemp      T_0 — temperature at t=0 (°C)
 * @param timeMinutes      t — elapsed time (minutes)
 * @param timeConstantMin  τ — thermal time constant (minutes)
 * @returns                Temperature at time t (°C)
 */
export function firstOrderThermal(
  steadyStateTemp: number,
  initialTemp: number,
  timeMinutes: number,
  timeConstantMin: number,
): number {
  if (timeConstantMin <= 0) return steadyStateTemp;
  return steadyStateTemp - (steadyStateTemp - initialTemp) * Math.exp(-timeMinutes / timeConstantMin);
}

/**
 * Inverse first-order model: time to reach a target temperature.
 *
 *   t = −τ × ln((T_ss − T_target) / (T_ss − T_0))
 *
 * Returns Infinity if T_ss ≤ T_target (the body never reaches target).
 * Returns 0 if T_0 ≥ T_target (already at or above target).
 */
export function timeToReachTemp(
  currentTemp: number,
  steadyStateTemp: number,
  targetTemp: number,
  timeConstant: number,
): number {
  if (timeConstant <= 0) return Infinity;
  if (steadyStateTemp <= targetTemp) return Infinity;
  if (currentTemp >= targetTemp) return 0;
  const numerator = steadyStateTemp - targetTemp;
  const denominator = steadyStateTemp - currentTemp;
  if (denominator <= 0) return Infinity;
  const ratio = numerator / denominator;
  if (ratio <= 0 || ratio >= 1) return Infinity;
  return -timeConstant * Math.log(ratio);
}

// ─────────────────────────────────────────────────────────────────────────────
// H. Cooling effectiveness by enclosure type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cooling effectiveness as a function of speed ratio (n / n_rated).
 *
 * This models how the motor's self-cooling degrades at reduced speed.
 * The values are EMPIRICAL APPROXIMATIONS based on typical TEFC/ODP
// designs. They are NOT derived from a CFD simulation or standard table.
 *
 *   TEFC  : shaft-mounted fan, effectiveness ∝ n^0.8
 *           Minimum 0.15 at standstill (natural convection only).
 *           At 50% speed → ~0.57, at 25% speed → ~0.33.
 *
 *   ODP   : open drip-proof, benefits from internal air circulation.
 *           Less speed-dependent; minimum 0.5 (natural convection).
 *
 *   WP-II : weather-protected, similar to TEFC but with additional
 *           air-path restrictions. Effectiveness ∝ n^0.75.
 *
 *   TEAO  : totally-enclosed air-over. Relies on EXTERNAL airflow
 *           (e.g., from the driven fan in an HVAC unit). Cooling is
 *           constant IF external airflow is constant — modeled as 1.0.
 *
 *   TEBV  : totally-enclosed blower-ventilated. Has an independent
 *           blower motor, so cooling is constant regardless of shaft
 *           speed. Modeled as 1.0.
 *
 * LIMITATION: The exponents (0.8, 0.75) are empirical. Real motors
 * vary by frame size, fan design, and installation. For safety-critical
 * applications, consult the manufacturer's cooling curve.
 *
 * @param enclosureType  Enclosure code
 * @param speedRatio      n / n_rated (0 = stopped, 1 = rated, 1.5 = overspeed)
 * @returns               Cooling effectiveness (0.15–1.0+)
 */
export function coolingEffectiveness(
  enclosureType: string,
  speedRatio: number,
): number {
  const sr = Math.max(0, Math.min(2, speedRatio));
  switch (enclosureType) {
    case 'TEFC':
      return Math.max(0.15, Math.pow(sr, 0.8));
    case 'ODP':
      return Math.max(0.5, 0.5 + 0.5 * Math.min(1, sr));
    case 'WP-II':
      return Math.max(0.2, Math.pow(sr, 0.75));
    case 'TEAO':
    case 'TEBV':
      return 1.0; // independent cooling
    default:
      return Math.max(0.15, Math.pow(sr, 0.8));
  }
}

/**
 * VFD low-speed cooling derating factor.
 *
 * For TEFC motors operated below ~40% rated speed on a VFD, the shaft
 * fan cannot provide adequate cooling. This function returns an
 * ADDITIONAL derating (on top of coolingEffectiveness) that reflects
 * the reduced heat dissipation at low speed.
 *
 * For TEAO/TEBV (independent cooling), no additional derating.
 *
 * Reference: NEMA MG 1 Part 31 (definite-purpose inverter-fed motors);
 *            IEC 60034-17. The exact curve is manufacturer-specific.
 *
 * @returns Additional multiplier (0.7–1.0) to apply to thermal conductance
 */
export function vfdCoolingDerating(
  enclosureType: string,
  speedRatio: number,
  frequencyRatio: number,
): number {
  // Independent-cooling enclosures are unaffected by VFD speed
  if (enclosureType === 'TEAO' || enclosureType === 'TEBV') return 1.0;

  // Below 20 Hz (or 40% rated speed), TEFC cooling degrades sharply.
  // This is an EMPIRICAL derating, not a standard formula.
  if (speedRatio < 0.4 || frequencyRatio < 0.4) {
    const minFactor = 0.7; // 30% additional derating at very low speed
    const transition = 0.4;
    const t = Math.max(0, Math.min(1, (Math.min(speedRatio, frequencyRatio)) / transition));
    return minFactor + (1 - minFactor) * t;
  }
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// I. Voltage imbalance (NEMA MG-1 §14.36)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NEMA MG-1 voltage-imbalance derating factor.
 *
 * NEMA MG-1 §14.36 specifies a derating curve that reduces the
 * permissible loading when the line-to-line voltages are unbalanced.
 * The curve (approximated) is:
 *
 *   V_imbalance %   Derating
 *   ─────────────   ────────
 *        0.0         1.00
 *        1.0         0.99
 *        2.0         0.95
 *        3.0         0.89
 *        4.0         0.82
 *        5.0         0.75   (NEMA recommended limit)
 *
 * This function approximates that curve. The EXACT curve is published
 * in NEMA MG-1; this is an engineering approximation suitable for
 * monitoring but not for compliance certification.
 *
 * @param imbalancePercent  Voltage imbalance (%), see voltageImbalance()
 * @returns                  Derating factor (0.75–1.0)
 */
export function voltageImbalanceDerating(imbalancePercent: number): number {
  if (imbalancePercent <= 0) return 1.0;
  if (imbalancePercent >= 5) return 0.75;
  return Math.max(0.75, 1.0 - 0.05 * Math.pow(imbalancePercent, 1.3));
}

/**
 * NEMA voltage imbalance percentage.
 *
 *   % imbalance = 100 × (V_max − V_avg) / V_avg
 *
 * where V_avg is the average of the three line-to-line voltages and
 * V_max is the voltage with the maximum deviation from V_avg.
 *
 * Reference: NEMA MG-1 §14.36. Note: this is the NEMA definition;
 * IEC uses a slightly different formula.
 *
 * @param vab  Line-to-line voltage V_AB (V)
 * @param vbc  Line-to-line voltage V_BC (V)
 * @param vca  Line-to-line voltage V_CA (V)
 * @returns    Imbalance percentage (0–10+)
 */
export function voltageImbalance(
  vab: number,
  vbc: number,
  vca: number,
): number {
  const avg = (vab + vbc + vca) / 3;
  if (avg <= 0) return 0;
  const dev = Math.max(
    Math.abs(vab - avg),
    Math.abs(vbc - avg),
    Math.abs(vca - avg),
  );
  return (100 * dev) / avg;
}

/**
 * Additional stator heating from negative-sequence current due to
 * voltage imbalance. This is a SIMPLIFIED model — the full calculation
 * requires symmetrical-components analysis.
 *
 * The negative-sequence impedance Z₂ ≈ Z_locked-rotor ≈ 0.2 × Z_rated
 * (typical for induction motors). The negative-sequence current is:
 *   I₂ ≈ V₂ / Z₂  ≈  (V_imb% / 100) × I_rated / 0.2
 *
 * The negative-sequence current rotates BACKWARDS at near-synchronous
 * speed, inducing DOUBLE-frequency eddy currents in the rotor. The
 * additional stator heating is approximately:
 *   P_add ≈ 6 × (I₂ / I_rated)² × P_cu_s_rated
 *
 * The factor 6 (not 1) accounts for the skin-effect concentration of
 * rotor currents in the outer bar region at high frequency.
 *
 * Reference: IEEE Std 112-2017 Annex B; NEMA MG-1 §14.36.
 *
 * ASSUMPTION: Balanced current imbalance proportional to voltage
 * imbalance. In reality, current imbalance ≈ 6–10× voltage imbalance.
 *
 * @param voltageImbalancePct  Voltage imbalance (%)
 * @param statorCopperLossRated  Rated stator copper loss (W)
 * @returns                     Additional heating (W) — add to stator copper
 */
export function imbalanceHeating(
  voltageImbalancePct: number,
  statorCopperLossRated: number,
): number {
  if (voltageImbalancePct <= 0) return 0;
  // Approximate negative-sequence current as 6× the voltage imbalance
  // (typical ratio for standard induction motors).
  const i2Ratio = Math.min(1.0, (voltageImbalancePct / 100) * 6);
  // Additional heating factor (6× due to double-frequency skin effect)
  return 6 * i2Ratio * i2Ratio * statorCopperLossRated;
}

// ─────────────────────────────────────────────────────────────────────────────
// J. Insulation life (Montsinger's rule)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insulation life factor (Montsinger's rule).
 *
 *   Life(T) / Life(T_rated) = 2^(−(T_hs − T_hs_rated) / 10)
 *
 * "Life halves for every 10°C above the rated hot-spot temperature."
 *
 * IMPORTANT: This uses the HOT-SPOT temperature, not the average winding
 * temperature. The hot-spot is typically 5–15°C above the measured
 * average. Pass the hot-spot temperature here.
 *
 * Reference: Montsinger (1930s); IEEE Std 1-2000. This is an EMPIRICAL
 * rule, not a physical law. Actual insulation life depends on:
 *   - Thermal cycling (start/stop frequency)
 *   - Voltage stress
 *   - Moisture and contamination
 *   - Mechanical vibration
 *   - Insulation system (class A/B/F/H)
 *
 * This function returns a FACTOR (1.0 = normal life). Multiply by the
 * rated insulation life (e.g., 20,000–40,000 hours for Class F at
 * rated temperature) to get an absolute life estimate.
 *
 * @param hotSpotTemp      Actual hot-spot temperature (°C)
 * @param ratedHotSpotTemp Rated hot-spot temperature (°C) = class limit − margin
 * @returns                Life factor (0–1.0, where 1.0 = full life)
 */
export function insulationLifeFactor(
  hotSpotTemp: number,
  ratedHotSpotTemp: number,
): number {
  const excess = hotSpotTemp - ratedHotSpotTemp;
  if (excess <= 0) return 1.0;
  return Math.pow(2, -excess / 10);
}

/**
 * Hot-spot temperature from average winding temperature.
 *
 * The hot-spot is the highest-temperature point in the winding, typically
 * deep in the slot. IEC 60034-1 specifies a hot-spot allowance:
 *   Class A: 5°C, Class B: 10°C, Class F: 15°C, Class H: 15°C
 *
 * For monitoring purposes (RTD/thermocouple in the slot), the measured
 * value is close to the hot-spot. For end-winding measurements, add
 * a larger margin.
 *
 * @param avgWindingTemp  Average winding temperature (°C)
 * @param insClass        Insulation class (determines allowance)
 * @returns               Estimated hot-spot temperature (°C)
 */
export function hotSpotTemperature(
  avgWindingTemp: number,
  insClass: InsulationClass,
): number {
  const allowance: Record<InsulationClass, number> = {
    A: 5, B: 10, F: 15, H: 15,
  };
  return avgWindingTemp + allowance[insClass];
}

// ─────────────────────────────────────────────────────────────────────────────
// K. Thermal utilization, health, risk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thermal utilization: fraction of rated thermal rise being used.
 *
 *   util = ΔT / ΔT_rated
 *
 * Values >1.0 indicate overload. Capped at 1.5 for display purposes.
 */
export function thermalUtilization(
  tempRise: number,
  tempRiseLimit: number,
): number {
  if (tempRiseLimit <= 0) return 1.0;
  return tempRise / tempRiseLimit;
}

/**
 * Frame (external surface) temperature estimate.
 *
 * The frame runs cooler than the windings because of the thermal
 * resistance through the stator iron and air gap. Typical ratio:
 *   ΔT_frame / ΔT_winding ≈ 0.55–0.70
 *
 * @param windingTemp  Winding temperature (°C)
 * @param ambientTemp  Ambient temperature (°C)
 * @param ratio        Winding-to-frame rise ratio (default 0.65)
 */
export function frameTemperature(
  windingTemp: number,
  ambientTemp: number,
  ratio: number = 0.65,
): number {
  return ambientTemp + (windingTemp - ambientTemp) * ratio;
}

/**
 * Load percentage from line current.
 *
 *   load% = (I_line / I_rated) × 100
 *
 * NOTE: This is an approximation. Actual load is better estimated from
 * input power or slip. Current is roughly proportional to load above
 * ~25% load (below that, magnetizing current dominates).
 */
export function loadPercentFromCurrent(
  actualCurrent: number,
  ratedCurrent: number,
): number {
  if (ratedCurrent <= 0) return 0;
  return (actualCurrent / ratedCurrent) * 100;
}

/**
 * Health score (composite 0–100).
 *
 * Weighted blend of:
 *   - Thermal utilization (40%): 100 at 0%, 0 at 100%
 *   - Insulation life factor (35%): 100 at 1.0, 0 at 0.0
 *   - Load factor (25%): penalizes overload and severe underload
 *
 * This is a HEURISTIC indicator, not a validated prognostic.
 */
export function healthScore(
  thermalUtil: number,
  insulationLife: number,
  loadPct: number,
): number {
  const thermalFactor = Math.max(0, 100 - thermalUtil * 100);
  const lifeFactor = Math.min(1, insulationLife) * 100;
  let loadFactor = 100;
  if (loadPct > 100) loadFactor = Math.max(0, 100 - (loadPct - 100) * 5);
  else if (loadPct < 20 && loadPct > 0) loadFactor = 50 + (loadPct / 20) * 50;
  return Math.round(thermalFactor * 0.4 + lifeFactor * 0.35 + loadFactor * 0.25);
}

/**
 * Risk level from thermal utilization.
 * Thresholds are INDUSTRY-TYPICAL and should be calibrated to the
 * specific motor's thermal class and application.
 */
export function getRiskLevel(util: number): 'healthy' | 'monitor' | 'warning' | 'critical' | 'emergency' {
  if (util < 0.60) return 'healthy';
  if (util < 0.75) return 'monitor';
  if (util < 0.85) return 'warning';
  if (util < 0.95) return 'critical';
  return 'emergency';
}

export function getRiskColor(level: string): string {
  switch (level) {
    case 'healthy':  return '#10b981';
    case 'monitor':  return '#06b6d4';
    case 'warning':  return '#f59e0b';
    case 'critical': return '#ef4444';
    case 'emergency':return '#dc2626';
    default:         return '#64748b';
  }
}

/**
 * Temperature → color for thermal visualization.
 * Blue (cool) → cyan → green → yellow → red (hot).
 */
export function tempToColor(
  temp: number,
  minTemp: number = 25,
  maxTemp: number = 180,
): string {
  const t = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
  if (t < 0.25) {
    const g = Math.round((t / 0.25) * 200);
    return `rgb(0, ${g}, 200)`;
  } else if (t < 0.5) {
    const ratio = (t - 0.25) / 0.25;
    const b = Math.round(200 * (1 - ratio));
    return `rgb(0, 200, ${b})`;
  } else if (t < 0.75) {
    const ratio = (t - 0.5) / 0.25;
    const r = Math.round(255 * ratio);
    return `rgb(${r}, 200, 0)`;
  } else {
    const ratio = (t - 0.75) / 0.25;
    const g = Math.round(200 * (1 - ratio));
    return `rgb(255, ${g}, 0)`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Z. Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Safe division — returns 0 instead of Infinity/NaN when denominator is 0. */
export function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0 || !isFinite(denominator)) return 0;
  return numerator / denominator;
}

/**
 * Energy balance check: P_in should equal P_out + P_losses.
 *
 *   error% = |P_in − (P_out + P_losses)| / P_in × 100
 *
 * A well-formed model should have <1% error. >5% indicates a bug.
 *
 * @returns Balance error percentage (0 = perfect)
 */
export function powerBalanceError(
  pin: number,
  pout: number,
  plosses: number,
): number {
  if (pin <= 0) return 0;
  return Math.abs(pin - (pout + plosses)) / pin * 100;
}
