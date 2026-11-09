// Motor Thermal Digital Twin — Thermal State Machine
// First-order ODE thermal model with memory and prediction

import type {
  MotorNameplate,
  OperatingConditions,
  SegregatedLosses,
  ThermalState,
  SimulationPoint,
} from './types';
import {
  firstOrderThermal,
  temperatureRise,
  timeToReachTemp,
  frameTemperature,
  hotResistance,
  coolingEffectiveness,
  thermalUtilization as calcThermalUtil,
  insulationLifeFactor,
} from './physics';
import {
  segregateLosses,
  estimateResistance,
  estimateThermalTimeConstant,
  estimateThermalConductance,
  calculateRatedTempRise,
  getTripTemperature,
} from './motor-model';

/** Internal thermal model state */
interface ThermalModelInternal {
  currentWindingTemp: number;     // °C
  ratedLosses: { copper: number; core: number; mechanical: number; stray: number; total: number };
  ratedResistance: number;        // Ω at 25°C reference
  thermalTimeConstant: number;    // minutes
  thermalConductance: number;     // W/°C
  ratedTempRise: number;          // °C
  tripTemp: number;               // °C (absolute)
  ratedRiseTemp: number;          // Total rated winding temp
}

/**
 * Create and initialize the thermal model from motor nameplate data
 */
export function createThermalModel(nameplate: MotorNameplate): ThermalModelInternal {
  const rated = segregateLosses(nameplate.ratedPower, nameplate.efficiency);
  const R = estimateResistance(rated.copper, nameplate.ratedCurrent);
  const tau = estimateThermalTimeConstant(nameplate.ratedPower);
  const ratedRise = calculateRatedTempRise(nameplate.insulationClass);
  const Gth = estimateThermalConductance(rated.total, ratedRise);
  const tripTemp = getTripTemperature(nameplate.insulationClass);
  const ratedRiseTemp = 40 + ratedRise; // Ambient + rated rise = total rated winding temp

  return {
    currentWindingTemp: 40, // Start at ambient
    ratedLosses: rated,
    ratedResistance: R,
    thermalTimeConstant: tau,
    thermalConductance: Gth,
    ratedTempRise: ratedRise,
    tripTemp: tripTemp,
    ratedRiseTemp: ratedRiseTemp,
  };
}

/**
 * Step the thermal model forward by dt minutes
 * Applies first-order ODE: dT/dt = (T_ss - T) / τ
 * Returns the new thermal state
 */
export function stepThermalModel(
  model: ThermalModelInternal,
  nameplate: MotorNameplate,
  conditions: OperatingConditions,
  losses: SegregatedLosses,
  dt: number // minutes
): ThermalState {
  // Calculate cooling effectiveness
  const speedRatio = nameplate.ratedSpeed > 0 
    ? conditions.speed / nameplate.ratedSpeed 
    : 0;
  const coolEff = coolingEffectiveness(nameplate.enclosureType, speedRatio);

  // Effective thermal conductance accounts for cooling
  // At reduced cooling, conductance decreases → higher temperature
  const effectiveGth = model.thermalConductance * coolEff;

  // Steady-state temperature rise
  const ssRise = temperatureRise(losses.totalLosses, effectiveGth);

  // Steady-state absolute temperature
  const ssTemp = conditions.ambientTemp + ssRise;

  // Step the first-order model
  const newWindingTemp = firstOrderThermal(
    ssTemp,
    model.currentWindingTemp,
    dt,
    model.thermalTimeConstant
  );

  // Update internal state
  model.currentWindingTemp = newWindingTemp;

  // Calculate all derived values
  const tempRise = newWindingTemp - conditions.ambientTemp;
  const tempRiseLimit = model.ratedTempRise;
  const util = calcThermalUtil(tempRise, tempRiseLimit);
  const margin = model.tripTemp - newWindingTemp;
  const ttt = timeToReachTemp(
    newWindingTemp,
    ssTemp,
    model.tripTemp,
    model.thermalTimeConstant
  );
  const lifeFactor = insulationLifeFactor(
    newWindingTemp,
    model.ratedRiseTemp,
    conditions.ambientTemp
  );
  const Rhot = hotResistance(model.ratedResistance, 25, newWindingTemp);
  const frameTemp = frameTemperature(newWindingTemp, conditions.ambientTemp);

  return {
    windingTemp: newWindingTemp,
    frameTemp,
    ambientTemp: conditions.ambientTemp,
    tempRise,
    steadyStateRise: ssRise,
    thermalUtilization: Math.min(util, 1.5), // Cap display at 150%
    thermalMargin: margin,
    timeToTrip: ttt,
    timeConstant: model.thermalTimeConstant,
    insulationLifeFactor: lifeFactor,
    coolingEffectiveness: coolEff,
    hotResistance: Rhot,
  };
}

/**
 * Reset the thermal model to ambient (cold start)
 */
export function resetThermalModel(
  model: ThermalModelInternal,
  ambientTemp: number
): void {
  model.currentWindingTemp = ambientTemp;
}

/**
 * Run a simulation over a time horizon
 * Returns an array of simulation data points
 */
export function runSimulation(
  model: ThermalModelInternal,
  nameplate: MotorNameplate,
  conditions: OperatingConditions,
  losses: SegregatedLosses,
  durationMinutes: number,
  stepSizeMinutes: number = 0.5
): SimulationPoint[] {
  const points: SimulationPoint[] = [];
  const steps = Math.ceil(durationMinutes / stepSizeMinutes);
  const originalTemp = model.currentWindingTemp;

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
      healthScore: 0, // Will be calculated externally
    });
  }

  // Restore original temperature
  model.currentWindingTemp = originalTemp;

  return points;
}

/**
 * Set the thermal model to a specific temperature (for initial conditions)
 */
export function setInitialTemperature(
  model: ThermalModelInternal,
  temp: number
): void {
  model.currentWindingTemp = temp;
}

/**
 * Get the current internal temperature
 */
export function getCurrentTemperature(model: ThermalModelInternal): number {
  return model.currentWindingTemp;
}