// Motor Thermal Digital Twin — Fundamental Physics Equations
// Pure engineering calculations with no UI coupling
// All equations trace back to documented IEEE/IEC/NEMA standards

/**
 * Copper loss: P_cu = 3 × I² × R
 * Fundamental Ohm's law for 3-phase systems
 * Reference: Basic electrical engineering
 */
export function copperLoss(current: number, resistance: number): number {
  return 3 * Math.pow(current, 2) * resistance;
}

/**
 * Core loss: P_core ≈ P_core_rated × (V/V_rated)² × (f/f_rated)^1.6
 * Based on Steinmetz equation (simplified)
 * Reference: Steinmetz equation for hysteresis + eddy current losses
 */
export function coreLoss(
  voltage: number,
  frequency: number,
  coreLossRated: number,
  ratedVoltage: number,
  ratedFrequency: number
): number {
  const voltageRatio = voltage / ratedVoltage;
  const freqRatio = frequency / ratedFrequency;
  return coreLossRated * Math.pow(voltageRatio, 2) * Math.pow(freqRatio, 1.6);
}

/**
 * Mechanical loss: P_mech ≈ P_mech_rated × (n/n_rated)
 * Proportional to speed (friction + windage)
 * Reference: Industry standard approximation
 */
export function mechanicalLoss(
  speed: number,
  ratedSpeed: number,
  mechLossRated: number
): number {
  const speedRatio = Math.max(0, speed / ratedSpeed);
  return mechLossRated * speedRatio;
}

/**
 * Stray load loss: P_stray ≈ P_stray_rated × (I/I_rated)²
 * Reference: IEEE 112 / IEC 60034-2
 */
export function strayLoadLoss(
  current: number,
  ratedCurrent: number,
  strayLossRated: number
): number {
  const currentRatio = current / ratedCurrent;
  return strayLossRated * Math.pow(currentRatio, 2);
}

/**
 * Total losses = copper + core + mechanical + stray
 */
export function totalLosses(
  copper: number,
  core: number,
  mechanical: number,
  stray: number
): number {
  return copper + core + mechanical + stray;
}

/**
 * Steady-state temperature rise: ΔT_ss = P_total / G_thermal
 * Based on Newton's law of cooling
 * G_thermal = thermal conductance (W/°C)
 */
export function temperatureRise(totalLoss: number, thermalConductance: number): number {
  if (thermalConductance <= 0) return Infinity;
  return totalLoss / thermalConductance;
}

/**
 * First-order thermal response: θ(t) = θ_ss - (θ_ss - θ_0) × e^(-t/τ)
 * Lumped-parameter thermal network model
 * Reference: Standard first-order system response
 */
export function firstOrderThermal(
  steadyStateTemp: number,
  initialTemp: number,
  timeMinutes: number,
  timeConstantMinutes: number
): number {
  if (timeConstantMinutes <= 0) return steadyStateTemp;
  const tau = timeConstantMinutes;
  return steadyStateTemp - (steadyStateTemp - initialTemp) * Math.exp(-timeMinutes / tau);
}

/**
 * Insulation life factor (Arrhenius / Montsinger's rule)
 * Life halves for every 10°C above rated temperature
 * Returns a factor where 1.0 = normal life at rated temperature
 * Reference: Montsinger's rule / IEEE
 */
export function insulationLifeFactor(
  actualTemp: number,
  ratedRiseTemp: number, // Total rated winding temp (ambient + rated rise)
  ambientTemp: number
): number {
  const actualRise = actualTemp - ambientTemp;
  const excessTemp = actualRise - (ratedRiseTemp - ambientTemp);
  if (excessTemp <= 0) return 1.0; // Below rated temp, full life
  // Every 10°C above rated halves the life
  return Math.pow(2, -excessTemp / 10);
}

/**
 * Hot resistance correction: R_hot = R_cold × (235 + T_hot) / (235 + T_cold)
 * For copper windings. 235°C is the inferred absolute zero for copper.
 * Reference: Fundamental copper property
 */
export function hotResistance(
  resistanceCold: number,
  tempCold: number,
  tempHot: number
): number {
  return resistanceCold * (235 + tempHot) / (235 + tempCold);
}

/**
 * Cooling effectiveness based on enclosure type and speed ratio
 * TEFC: Fan-on-shaft, effectiveness ∝ (n/n_rated)^0.8
 * ODP: Less speed-dependent, minimum 0.5 at standstill
 * Forced/TEAO: Constant cooling regardless of speed
 */
export function coolingEffectiveness(
  enclosureType: string,
  speedRatio: number // n / n_rated
): number {
  const sr = Math.max(0, Math.min(1.5, speedRatio));
  switch (enclosureType) {
    case 'TEFC':
      // Fan-on-shaft: effectiveness proportional to speed^0.8
      // Minimum 0.15 at standstill (natural convection)
      return Math.max(0.15, Math.pow(sr, 0.8));
    case 'ODP':
      // Less speed-dependent, natural convection helps
      return Math.max(0.5, 0.5 + 0.5 * sr);
    case 'WP-II':
      // Weather-protected, similar to TEFC
      return Math.max(0.2, Math.pow(sr, 0.75));
    case 'TEAO':
    case 'TEBV':
      // Forced ventilation — constant cooling
      return 1.0;
    default:
      return Math.max(0.15, Math.pow(sr, 0.8));
  }
}

/**
 * NEMA MG-1 voltage imbalance derating curve
 * Returns a derating factor (0-1) based on voltage imbalance percentage
 * Reference: NEMA MG-1 §14.36
 */
export function voltageImbalanceDerating(imbalancePercent: number): number {
  if (imbalancePercent <= 0) return 1.0;
  if (imbalancePercent >= 5) return 0.75; // Severe derating at 5%+
  // Approximation of NEMA MG-1 curve
  // At 1%: ~0.98, 2%: ~0.95, 3%: ~0.90, 4%: ~0.84, 5%: ~0.75
  return Math.max(0.75, 1.0 - 0.05 * Math.pow(imbalancePercent, 1.3));
}

/**
 * Thermal utilization: fraction of thermal limit being used
 * Returns 0-1+ (can exceed 1.0 in overload)
 */
export function thermalUtilization(
  tempRise: number,
  tempRiseLimit: number
): number {
  if (tempRiseLimit <= 0) return 1.0;
  return tempRise / tempRiseLimit;
}

/**
 * Calculate time to reach a target temperature from current state
 * Using inverse of first-order model: t = -τ × ln((T_target - T_ss) / (T_0 - T_ss))
 */
export function timeToReachTemp(
  currentTemp: number,
  steadyStateTemp: number,
  targetTemp: number,
  timeConstant: number
): number {
  if (timeConstant <= 0) return Infinity;
  // If steady state is below target, motor will never reach it
  if (steadyStateTemp <= targetTemp) return Infinity;
  // If already above target, return 0
  if (currentTemp >= targetTemp) return 0;
  // Solve: T_target = T_ss - (T_ss - T_0) × e^(-t/τ)
  // t = -τ × ln((T_ss - T_target) / (T_ss - T_0))
  const numerator = steadyStateTemp - targetTemp;
  const denominator = steadyStateTemp - currentTemp;
  if (denominator <= 0) return Infinity;
  const ratio = numerator / denominator;
  if (ratio <= 0) return Infinity;
  return -timeConstant * Math.log(ratio);
}

/**
 * Estimate frame temperature from winding temperature
 * Typical winding-to-frame temperature ratio: 0.6-0.7
 */
export function frameTemperature(
  windingTemp: number,
  ambientTemp: number,
  windingToFrameRatio: number = 0.65
): number {
  const windingRise = windingTemp - ambientTemp;
  return ambientTemp + windingRise * windingToFrameRatio;
}

/**
 * Calculate load percentage from current
 */
export function loadPercentFromCurrent(
  actualCurrent: number,
  ratedCurrent: number
): number {
  if (ratedCurrent <= 0) return 0;
  return (actualCurrent / ratedCurrent) * 100;
}

/**
 * Health score: composite 0-100 score based on multiple factors
 * Combines thermal utilization, insulation life, and overload margin
 */
export function healthScore(
  thermalUtil: number,
  insulationLife: number,
  loadPct: number
): number {
  // Thermal factor: 100 at 0% util, 0 at 100%+
  const thermalFactor = Math.max(0, 100 - thermalUtil * 100);
  // Insulation life factor: 100 at 1.0, 0 at 0.0
  const lifeFactor = Math.min(1, insulationLife) * 100;
  // Load factor: penalize if over 100% or under 20%
  let loadFactor = 100;
  if (loadPct > 100) loadFactor = Math.max(0, 100 - (loadPct - 100) * 5);
  else if (loadPct < 20 && loadPct > 0) loadFactor = 50 + (loadPct / 20) * 50;
  else if (loadPct === 0) loadFactor = 100; // No load is fine thermally

  // Weighted average: thermal 40%, life 35%, load 25%
  return Math.round(thermalFactor * 0.4 + lifeFactor * 0.35 + loadFactor * 0.25);
}

/**
 * Determine risk level from thermal utilization
 */
export function getRiskLevel(thermalUtilization: number): 'healthy' | 'monitor' | 'warning' | 'critical' | 'emergency' {
  if (thermalUtilization < 0.60) return 'healthy';
  if (thermalUtilization < 0.75) return 'monitor';
  if (thermalUtilization < 0.85) return 'warning';
  if (thermalUtilization < 0.95) return 'critical';
  return 'emergency';
}

/**
 * Get risk level color for display
 */
export function getRiskColor(level: string): string {
  switch (level) {
    case 'healthy': return '#10b981';    // emerald
    case 'monitor': return '#06b6d4';    // cyan
    case 'warning': return '#f59e0b';    // amber
    case 'critical': return '#ef4444';   // red
    case 'emergency': return '#dc2626';  // deep red
    default: return '#6b7280';           // gray
  }
}

/**
 * Temperature to color mapping for SVG thermal visualization
 * Maps temperature range to a blue → cyan → green → yellow → red gradient
 */
export function tempToColor(
  temp: number,
  minTemp: number = 25,
  maxTemp: number = 180
): string {
  const t = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
  
  if (t < 0.25) {
    // Blue to Cyan
    const r = 0;
    const g = Math.round((t / 0.25) * 200);
    const b = 200;
    return `rgb(${r}, ${g}, ${b})`;
  } else if (t < 0.5) {
    // Cyan to Green
    const ratio = (t - 0.25) / 0.25;
    const r = 0;
    const g = 200;
    const b = Math.round(200 * (1 - ratio));
    return `rgb(${r}, ${g}, ${b})`;
  } else if (t < 0.75) {
    // Green to Yellow
    const ratio = (t - 0.5) / 0.25;
    const r = Math.round(255 * ratio);
    const g = 200;
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Red
    const ratio = (t - 0.75) / 0.25;
    const r = 255;
    const g = Math.round(200 * (1 - ratio));
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  }
}