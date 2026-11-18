// ═══════════════════════════════════════════════════════════════════════════
// Motor Thermal Digital Twin — Multi-Node Thermal State Machine
// ═══════════════════════════════════════════════════════════════════════════
//
// UPGRADE from first-order to MULTI-NODE lumped-parameter thermal network.
//
// THREE THERMAL NODES:
//   1. WINDING  (fast, τ ≈ 10–20 min) — receives stator + rotor copper losses
//   2. CORE     (medium, τ ≈ 30–60 min) — receives core (iron) loss
//   3. FRAME    (slow, τ ≈ 60–120 min) — receives friction+windage+stray,
//                 dissipates to ambient via convection
//
// NETWORK TOPOLOGY:
//
//   P_cu_s + P_cu_r ──→ [WINDING] ──R_w_c──→ [CORE] ──R_c_f──→ [FRAME] ──R_f_a──→ [AMBIENT]
//   P_core ──────────→ [CORE]
//   P_fw + P_stray ──→ [FRAME]
//
// Each node has:
//   - Thermal capacitance C (J/°C)
//   - Temperature T (°C)
//   - ODE: C × dT/dt = P_in − P_out
//
// where P_in = heat generated at the node + heat conducted from hotter nodes,
//       P_out = heat conducted to cooler nodes + convected to ambient.
//
// NUMERICAL INTEGRATION
// ─────────────────────
// We use EXPLICIT (forward) EULER with substepping for stability.
// Stability criterion: dt < min(τ_node) / 2.
// For typical motors, min τ ≈ 10 min, so dt < 5 min is safe.
// We substep internally to dt = 0.1 min (6s) for accuracy.
//
// ENERGY CONSERVATION
// ────────────────────
// At steady state, total heat generated = total heat dissipated to ambient.
// We verify this in the energyBalance() function.
//
// REFERENCES
// ──────────
// [1] Mellor, Turner, "Real-time prediction of temperatures in an induction
//     motor," IEE Proc. B, 1991. (Multi-node thermal model foundation)
// [2] Staton, Boglietti, Cavagnino, "Evaluation of cooling methods in
//     electrical machines," IEEE Trans. IA, 2003.
// [3] IEC 60034-2-1, "Methods for determining losses and efficiency."
// [4] IEEE 112-2017, "Standard Test Procedure for Polyphase Induction Motors."
//
// ASSUMPTIONS
// ────────────
// [T1] Three-node model is sufficient for monitoring. A 6–10 node model
//      (separate end-winding, slot, tooth, rotor bar, end-ring, bearing)
//      would be more accurate but requires proprietary construction data.
// [T2] Thermal resistances are constant (not temperature-dependent). In
//      reality convection improves slightly with ΔT; ignored here.
// [T3] Radiation is negligible below 100°C frame temperature (valid for
//      most operating conditions).
// [T4] The frame is the only node that dissipates to ambient; in reality
//      the end-windings also convect directly to internal air, but this
//      is a second-order effect for TEFC motors.
// [T5] Cooling effectiveness scales the frame-to-ambient conductance only
//      (not inter-node conductances).
//
// ═══════════════════════════════════════════════════════════════════════════

import type {
  MotorNameplate,
  OperatingConditions,
  SegregatedLosses,
  ThermalState,
  SimulationPoint,
  InsulationClass,
} from './types';
import {
  firstOrderThermal,
  temperatureRise,
  timeToReachTemp,
  frameTemperature as frameTempFn,
  hotResistance,
  hotSpotTemperature,
  coolingEffectiveness,
  vfdCoolingDerating,
  thermalUtilization as calcThermalUtil,
  insulationLifeFactor,
  safeDiv,
} from './physics';
import {
  segregateRatedLosses,
  estimateThermalTimeConstant,
  estimateCoreTimeConstant,
  estimateFrameTimeConstant,
  estimateThermalConductance,
  calculateRatedTempRise,
  getTripTemperature,
  RatedLossBreakdown,
} from './motor-model';

/** Internal multi-node thermal model state. */
interface ThermalModelInternal {
  // ── Node temperatures (°C) ──
  windingTemp: number;
  coreTemp: number;
  frameTemp: number;
  rotorTemp: number;      // derived from slip loss (single-node approximation)

  // ── Rated parameters ──
  ratedBreakdown: RatedLossBreakdown;
  ratedResistance25: number;     // Ω per phase at 25°C
  ratedTempRise: number;         // °C — rated winding rise above ambient

  // ── Time constants (minutes) ──
  tauWinding: number;
  tauCore: number;
  tauFrame: number;

  // ── Thermal conductances (W/°C) ──
  gWindingToCore: number;     // winding → core
  gCoreToFrame: number;       // core → frame
  gFrameToAmbient: number;    // frame → ambient (cooling-dependent)

  // ── Limits ──
  tripTemp: number;
  ratedRiseTemp: number;      // total rated winding temp
  insulationClass: InsulationClass;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Model construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and initialize the multi-node thermal model.
 *
 * The model starts with all nodes at ambient temperature (cold start).
 * Call stepThermalModel() repeatedly to simulate heating.
 */
export function createThermalModel(nameplate: MotorNameplate): ThermalModelInternal {
  const rated = segregateRatedLosses(nameplate);
  const tauWinding = estimateThermalTimeConstant(nameplate.ratedPower);
  const tauCore = estimateCoreTimeConstant(nameplate.ratedPower);
  const tauFrame = estimateFrameTimeConstant(nameplate.ratedPower);
  const ratedRise = calculateRatedTempRise(nameplate.insulationClass);
  const tripTemp = getTripTemperature(nameplate.insulationClass);
  const ratedRiseTemp = 40 + ratedRise;

  // Overall thermal conductance (winding → ambient) at rated conditions
  const gOverall = estimateThermalConductance(rated.total, ratedRise);

  // Split the overall conductance into inter-node conductances.
  // Typical ratios (Mellor & Staton):
  //   R_winding→core  ≈ 0.25 × R_total  →  g = 4 × gOverall
  //   R_core→frame    ≈ 0.35 × R_total  →  g ≈ 2.86 × gOverall
  //   R_frame→ambient ≈ 0.40 × R_total  →  g = 2.5 × gOverall
  // (Conductances are reciprocals of resistances; series resistors add.)
  const gWindingToCore = gOverall * 4.0;
  const gCoreToFrame = gOverall * 2.86;
  const gFrameToAmbient = gOverall * 2.5;

  return {
    windingTemp: 40,
    coreTemp: 40,
    frameTemp: 40,
    rotorTemp: 40,
    ratedBreakdown: rated,
    ratedResistance25: rated.statorResistance25,
    ratedTempRise: ratedRise,
    tauWinding,
    tauCore,
    tauFrame,
    gWindingToCore,
    gCoreToFrame,
    gFrameToAmbient,
    tripTemp,
    ratedRiseTemp,
    insulationClass: nameplate.insulationClass,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Single-step integration (explicit Euler with substepping)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step the thermal model forward by dt minutes using explicit Euler.
 *
 * Internal substep size is 0.1 min (6 s) for numerical stability.
 * The minimum node τ is ~10 min, so dt < τ/2 = 5 min is the stability
 * bound; substepping to 0.1 min gives a 50× safety margin.
 *
 * Heat injection:
 *   - Winding node: stator copper + rotor copper losses
 *   - Core node:    iron loss (hysteresis + eddy)
 *   - Frame node:   friction + windage + stray + imbalance heating
 *
 * Heat flow between nodes:
 *   Q_w→c = G_w_c × (T_winding − T_core)
 *   Q_c→f = G_c_f × (T_core − T_frame)
 *   Q_f→a = G_f_a × (T_frame − T_ambient)  × coolingEffectiveness
 *
 * The cooling effectiveness multiplies the frame-to-ambient conductance,
 * modeling reduced convection at low speed (TEFC) or forced cooling (TEBV).
 */
export function stepThermalModel(
  model: ThermalModelInternal,
  nameplate: MotorNameplate,
  conditions: OperatingConditions,
  losses: SegregatedLosses,
  dt: number, // minutes
): ThermalState {
  // ── Cooling effectiveness ──
  const speedRatio = nameplate.ratedSpeed > 0
    ? conditions.speed / nameplate.ratedSpeed
    : 0;
  const freqRatio = nameplate.ratedFrequency > 0
    ? conditions.frequency / nameplate.ratedFrequency
    : 0;
  const coolEff = coolingEffectiveness(nameplate.enclosureType, speedRatio);
  const vfdDerate = vfdCoolingDerating(
    nameplate.enclosureType, speedRatio, freqRatio,
  );
  const effectiveCool = coolEff * vfdDerate;

  // Effective frame-to-ambient conductance (cooling-dependent)
  const gFrameToAmbient = model.gFrameToAmbient * effectiveCool;

  // ── Substep integration ──
  const subStep = 0.1; // minutes (6 seconds)
  const nSteps = Math.max(1, Math.ceil(dt / subStep));
  const dtSub = dt / nSteps;

  // Heat sources per node (W)
  const pWinding = losses.statorCopperLoss + losses.rotorCopperLoss;
  const pCore = losses.coreLoss;
  const pFrame = losses.mechanicalLoss + losses.strayLoadLoss + losses.imbalanceHeating;

  // Thermal capacitances (J/°C) — derived from τ and G
  // C = τ × G (since τ = C / G)
  // For the winding, C_w = τ_w × G_w_c (the dominant path)
  const cWinding = model.tauWinding * 60 * model.gWindingToCore;  // ×60 to convert min→s
  const cCore = model.tauCore * 60 * model.gCoreToFrame;
  const cFrame = model.tauFrame * 60 * model.gFrameToAmbient;

  let { windingTemp, coreTemp, frameTemp, rotorTemp } = model;

  for (let i = 0; i < nSteps; i++) {
    const tAmb = conditions.ambientTemp;

    // Heat flows (W) — positive = into the node
    const qWindingIn = pWinding;
    const qWindingOut = model.gWindingToCore * (windingTemp - coreTemp);
    const qCoreIn = pCore + qWindingOut;
    const qCoreOut = model.gCoreToFrame * (coreTemp - frameTemp);
    const qFrameIn = pFrame + qCoreOut;
    const qFrameOut = gFrameToAmbient * (frameTemp - tAmb);

    // Explicit Euler: T_new = T_old + (dt/C) × (Q_in − Q_out)
    // dt is in minutes, C in J/°C = W·s/°C, so dt×60 converts min→s
    const dtSec = dtSub * 60;
    windingTemp += (dtSec / cWinding) * (qWindingIn - qWindingOut);
    coreTemp += (dtSec / cCore) * (qCoreIn - qCoreOut);
    frameTemp += (dtSec / cFrame) * (qFrameIn - qFrameOut);

    // Rotor temperature: approximate as winding temp + a fraction of rotor loss
    // (single-node approximation; full rotor model needs bar/end-ring detail)
    const rotorLoss = losses.rotorCopperLoss;
    const rotorRise = safeDiv(rotorLoss, model.gWindingToCore) * 0.5;
    rotorTemp = tAmb + (windingTemp - tAmb) + rotorRise;

    // Clamp to physically plausible range
    windingTemp = Math.max(tAmb - 5, Math.min(300, windingTemp));
    coreTemp = Math.max(tAmb - 5, Math.min(300, coreTemp));
    frameTemp = Math.max(tAmb - 5, Math.min(200, frameTemp));
  }

  // ── Commit to model state ──
  model.windingTemp = windingTemp;
  model.coreTemp = coreTemp;
  model.frameTemp = frameTemp;
  model.rotorTemp = rotorTemp;

  // ── Compute derived ThermalState (for backward compat) ──
  return computeThermalState(model, nameplate, conditions, losses, effectiveCool);
}

/**
 * Compute the public ThermalState from internal model + losses.
 * Extracted so it can be called without stepping (for steady-state calc).
 */
function computeThermalState(
  model: ThermalModelInternal,
  nameplate: MotorNameplate,
  conditions: OperatingConditions,
  losses: SegregatedLosses,
  effectiveCool: number,
): ThermalState {
  const windingTemp = model.windingTemp;
  const ambient = conditions.ambientTemp;

  // Hot-spot temperature (avg + class-dependent allowance)
  const hotSpotTemp = hotSpotTemperature(windingTemp, model.insulationClass);

  // Steady-state winding temperature (for time-to-trip calc)
  // At steady state: P_winding = G_w_c × (T_w_ss − T_c_ss)
  // Simplification: T_w_ss ≈ ambient + P_winding / G_overall × cooling
  const gOverall = 1 / (
    1 / model.gWindingToCore + 1 / model.gCoreToFrame + 1 / model.gFrameToAmbient
  );
  const steadyStateRise = safeDiv(
    losses.statorCopperLoss + losses.rotorCopperLoss,
    gOverall * effectiveCool,
  );
  const steadyStateTemp = ambient + steadyStateRise;

  const tempRise = windingTemp - ambient;
  const util = calcThermalUtil(tempRise, model.ratedTempRise);
  const margin = model.tripTemp - windingTemp;
  const ttt = timeToReachTemp(
    windingTemp,
    steadyStateTemp,
    model.tripTemp,
    model.tauWinding,
  );

  // Insulation life uses HOT-SPOT temp (not average)
  const lifeFactor = insulationLifeFactor(hotSpotTemp, model.ratedRiseTemp);

  // Hot resistance (for transparency)
  const rHot = hotResistance(model.ratedResistance25, 25, windingTemp);

  // Frame temperature (from internal node, more accurate than the legacy ratio)
  const frameTemp = model.frameTemp;

  return {
    windingTemp,
    frameTemp,
    ambientTemp: ambient,
    tempRise,
    steadyStateRise,
    thermalUtilization: Math.min(util, 1.5),
    thermalMargin: margin,
    timeToTrip: ttt,
    timeConstant: model.tauWinding,
    insulationLifeFactor: lifeFactor,
    coolingEffectiveness: effectiveCool,
    hotResistance: rHot,
    statorCoreTemp: model.coreTemp,
    rotorTemp: model.rotorTemp,
    bearingTemp: Math.max(ambient, frameTemp + 5),  // bearings ~5°C above frame
    hotSpotTemp,
    tauWinding: model.tauWinding,
    tauCore: model.tauCore,
    tauFrame: model.tauFrame,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Reset, simulation, helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Reset all node temperatures to ambient (cold start). */
export function resetThermalModel(
  model: ThermalModelInternal,
  ambientTemp: number,
): void {
  model.windingTemp = ambientTemp;
  model.coreTemp = ambientTemp;
  model.frameTemp = ambientTemp;
  model.rotorTemp = ambientTemp;
}

/** Set the winding temperature (for initial conditions or testing). */
export function setInitialTemperature(
  model: ThermalModelInternal,
  temp: number,
): void {
  model.windingTemp = temp;
}

/** Get the current winding temperature. */
export function getCurrentTemperature(model: ThermalModelInternal): number {
  return model.windingTemp;
}

/**
 * Run a simulation over a time horizon.
 * Returns an array of SimulationPoint at each timestep.
 *
 * The model's internal state is RESTORED after the simulation so the
 * caller can continue from the pre-simulation state. This lets the UI
 * "preview" a 120-minute trend without committing to it.
 */
export function runSimulation(
  model: ThermalModelInternal,
  nameplate: MotorNameplate,
  conditions: OperatingConditions,
  losses: SegregatedLosses,
  durationMinutes: number,
  stepSizeMinutes: number = 0.5,
): SimulationPoint[] {
  const points: SimulationPoint[] = [];
  const steps = Math.ceil(durationMinutes / stepSizeMinutes);
  const origWinding = model.windingTemp;
  const origCore = model.coreTemp;
  const origFrame = model.frameTemp;
  const origRotor = model.rotorTemp;

  for (let i = 0; i <= steps; i++) {
    const t = i * stepSizeMinutes;
    const state = stepThermalModel(model, nameplate, conditions, losses, stepSizeMinutes);
    points.push({
      time: t,
      windingTemp: state.windingTemp,
      frameTemp: state.frameTemp,
      thermalUtilization: state.thermalUtilization,
      losses: losses.totalLosses,
      current: conditions.current,
      voltage: conditions.voltage,
      healthScore: 0,  // filled in by caller
    });
  }

  // Restore
  model.windingTemp = origWinding;
  model.coreTemp = origCore;
  model.frameTemp = origFrame;
  model.rotorTemp = origRotor;

  return points;
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Energy balance verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify energy conservation: at steady state, total heat generated
 * should equal total heat dissipated to ambient.
 *
 *   P_generated = P_cu_s + P_cu_r + P_core + P_fw + P_stray + P_imbalance
 *   P_dissipated = G_f_a × (T_frame − T_ambient)
 *
 * Returns the error as a percentage (should be <5% near steady state).
 * During transient, this will be nonzero because energy is being stored
 * in the thermal capacitances.
 */
export function energyBalanceError(
  model: ThermalModelInternal,
  losses: SegregatedLosses,
  ambientTemp: number,
): number {
  const pGenerated = losses.totalLosses;
  const pDissipated = model.gFrameToAmbient * (model.frameTemp - ambientTemp);
  if (pGenerated <= 0) return 0;
  return Math.abs(pGenerated - pDissipated) / pGenerated * 100;
}
