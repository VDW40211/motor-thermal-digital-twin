// Motor Thermal Digital Twin — Root Cause Probability Engine
// Rule-based, transparent logic — no ML, fully explainable

import type { MotorNameplate, OperatingConditions, ThermalState, RootCause, RiskLevel } from './types';
import { voltageImbalanceDerating } from './physics';

interface RootCauseInput {
  nameplate: MotorNameplate;
  conditions: OperatingConditions;
  thermal: ThermalState;
  loadPercent: number;
}

/**
 * Sigmoid function for smooth probability mapping
 * Maps input value to 0-1 range with center and steepness controls
 */
function sigmoid(x: number, center: number, steepness: number): number {
  return 1 / (1 + Math.exp(-steepness * (x - center)));
}

/**
 * Calculate all root cause probabilities
 */
export function analyzeRootCauses(input: RootCauseInput): RootCause[] {
  const { nameplate, conditions, thermal, loadPercent } = input;
  const causes: RootCause[] = [];

  // 1. OVERLOAD — Probability based on load percentage
  // Sigmoid centered at 100% load, steep at 90-110%
  const overloadProb = sigmoid(loadPercent, 100, 0.15) * 100;
  causes.push({
    name: 'Electrical Overload',
    probability: Math.round(Math.min(100, overloadProb)),
    severity: getSeverity(overloadProb),
    description: loadPercent > 100
      ? `Motor is operating at ${loadPercent.toFixed(1)}% of rated load, exceeding nameplate rating. Copper losses increase quadratically with current (I²R), causing excessive heating.`
      : loadPercent > 85
      ? `Motor is operating at ${loadPercent.toFixed(1)}% of rated load. While within nameplate limits, thermal margins are reduced.`
      : 'Motor load is within normal range.',
    recommendation: loadPercent > 110
      ? 'URGENT: Reduce load immediately. Operating above 110% rated current risks insulation damage. Consider a larger motor or load management.'
      : loadPercent > 100
      ? `Reduce load to below ${nameplate.serviceFactor > 1 ? (nameplate.serviceFactor * 100).toFixed(0) + '% (SF)' : '100%'}. Monitor winding temperature closely.`
      : loadPercent > 85
      ? 'Monitor thermal trends. Ensure adequate cooling. Verify motor is correctly sized for the application.'
      : 'Load level is healthy. No action required for overload.',
    icon: 'Zap',
  });

  // 2. LOW SPEED COOLING — For TEFC motors
  if (nameplate.enclosureType === 'TEFC' || nameplate.enclosureType === 'WP-II') {
    const speedRatio = conditions.speed / nameplate.ratedSpeed;
    const lowSpeedProb = (1 - Math.min(1, speedRatio)) * 80;
    causes.push({
      name: 'Low Speed Cooling Degradation',
      probability: Math.round(Math.min(100, lowSpeedProb)),
      severity: getSeverity(lowSpeedProb),
      description: nameplate.enclosureType === 'TEFC'
        ? `TEFC motor at ${speedRatio.toFixed(2)}× rated speed. Shaft-mounted fan cooling effectiveness is reduced to ~${(Math.pow(speedRatio, 0.8) * 100).toFixed(0)}%.`
        : `Motor speed is ${(speedRatio * 100).toFixed(0)}% of rated. Cooling effectiveness is reduced.`,
      recommendation: speedRatio < 0.5
        ? 'CRITICAL: At very low speed, TEFC cooling is severely degraded. Consider forced ventilation or an inverter-rated (TEAO) motor.'
        : speedRatio < 0.8
        ? 'Cooling is significantly reduced at this speed. Monitor temperature closely. Consider supplemental cooling.'
        : 'Speed is within acceptable range for self-cooling.',
      icon: 'Fan',
    });
  }

  // 3. VOLTAGE PROBLEM — Deviation from rated voltage
  const voltageDev = Math.abs(conditions.voltage - nameplate.ratedVoltage) / nameplate.ratedVoltage * 100;
  const voltageProb = sigmoid(voltageDev, 5, 0.3) * 80;
  causes.push({
    name: 'Voltage Deviation',
    probability: Math.round(Math.min(100, voltageProb)),
    severity: getSeverity(voltageProb),
    description: voltageDev > 10
      ? `Voltage is ${voltageDev.toFixed(1)}% from rated. Severe deviation causes increased core losses (V² scaling) and potential saturation.`
      : voltageDev > 5
      ? `Voltage is ${voltageDev.toFixed(1)}% from rated. Core losses deviate from rated values. Current may increase to maintain torque.`
      : `Voltage is within ${voltageDev.toFixed(1)}% of rated — acceptable range.`,
    recommendation: voltageDev > 10
      ? 'Address supply voltage immediately. Contact utility or check transformer tap settings.'
      : voltageDev > 5
      ? 'Investigate voltage deviation. Check for voltage drop under load, transformer sizing, or cable length.'
      : 'Voltage is within normal operating range.',
    icon: 'Plug',
  });

  // 4. OVERSIZED MOTOR — Low load operation
  if (loadPercent < 50) {
    const oversizedProb = (1 - loadPercent / 50) * 60;
    causes.push({
      name: 'Oversized Motor',
      probability: Math.round(Math.min(100, oversizedProb)),
      severity: getSeverity(oversizedProb * 0.5), // Lower severity
      description: `Motor is operating at only ${loadPercent.toFixed(1)}% of rated capacity. Efficiency drops significantly at low loads due to fixed core and mechanical losses dominating.`,
      recommendation: loadPercent < 25
        ? 'Consider downsizing the motor. Operating below 25% load is very inefficient. Right-sizing can save energy and improve power factor.'
        : 'Motor is lightly loaded. While not harmful thermally, efficiency and power factor suffer. Evaluate if a smaller motor is appropriate.',
      icon: 'Minimize2',
    });
  }

  // 5. UNDERSIZED MOTOR — Over 100% load
  if (loadPercent > 95) {
    const undersizedProb = sigmoid(loadPercent, 100, 0.1) * 70;
    causes.push({
      name: 'Undersized Motor',
      probability: Math.round(Math.min(100, undersizedProb)),
      severity: getSeverity(undersizedProb),
      description: loadPercent > 100
        ? `Motor is undersized for the application. At ${loadPercent.toFixed(1)}% load, the motor is operating beyond its rated capability.`
        : `Motor is nearing its rated capacity at ${loadPercent.toFixed(1)}% load. Little thermal margin remains.`,
      recommendation: 'Evaluate the actual load requirement. Consider upgrading to a larger motor or reducing the mechanical load. For intermittent overloads, verify the service factor is adequate.',
      icon: 'Maximize2',
    });
  }

  // 6. HIGH AMBIENT
  if (conditions.ambientTemp > 35) {
    const ambientExcess = conditions.ambientTemp - 35;
    const ambientProb = Math.min(100, ambientExcess * 8);
    causes.push({
      name: 'High Ambient Temperature',
      probability: Math.round(Math.min(100, ambientProb)),
      severity: getSeverity(ambientProb),
      description: `Ambient temperature is ${conditions.ambientTemp}°C, which is ${ambientExcess.toFixed(0)}°C above the standard 35°C reference. This directly reduces the available temperature rise margin.`,
      recommendation: conditions.ambientTemp > 50
        ? 'Ambient is critically high. Motor may require derating or supplemental cooling. Consider moving to a cooler location or forced ventilation.'
        : conditions.ambientTemp > 40
        ? 'Ambient is above standard 40°C reference. Verify motor is adequately derated. Monitor temperature closely.'
        : 'Ambient is slightly elevated. Monitor trends and ensure adequate ventilation.',
      icon: 'Thermometer',
    });
  }

  // 7. VOLTAGE IMBALANCE
  if (conditions.voltageImbalance !== undefined && conditions.voltageImbalance > 0.5) {
    const vImbProb = Math.min(100, conditions.voltageImbalance * 12);
    const derating = voltageImbalanceDerating(conditions.voltageImbalance);
    causes.push({
      name: 'Voltage Imbalance',
      probability: Math.round(Math.min(100, vImbProb)),
      severity: getSeverity(vImbProb),
      description: `Voltage imbalance is ${conditions.voltageImbalance.toFixed(1)}% (NEMA recommends <1%). This causes ${((1 - derating) * 100).toFixed(0)}% additional derating and increases winding heating due to negative-sequence currents.`,
      recommendation: conditions.voltageImbalance > 3
        ? 'Voltage imbalance exceeds NEMA recommended limits. Check for single-phase loads, unbalanced transformer banks, or loose connections. Imbalance above 5% requires immediate correction.'
        : 'Voltage imbalance is elevated. Investigate phase loading and connections. NEMA recommends <1% for optimal motor life.',
      icon: 'AlertTriangle',
    });
  }

  // 8. CURRENT IMBALANCE
  if (conditions.currentImbalance !== undefined && conditions.currentImbalance > 1) {
    const iImbProb = Math.min(100, conditions.currentImbalance * 8);
    causes.push({
      name: 'Current Imbalance',
      probability: Math.round(Math.min(100, iImbProb)),
      severity: getSeverity(iImbProb),
      description: `Current imbalance is ${conditions.currentImbalance.toFixed(1)}%. Current imbalance indicates unequal phase loading and causes disproportionate heating in the highest-current winding.`,
      recommendation: conditions.currentImbalance > 5
        ? 'Current imbalance is excessive. This may indicate a winding fault, loose connection, or severe supply imbalance. Investigate immediately.'
        : 'Current imbalance is above normal. Check supply voltage balance and motor connections. If voltage is balanced, investigate motor windings.',
      icon: 'Activity',
    });
  }

  // 9. FREQUENT STARTS
  if (conditions.startsPerHour !== undefined && conditions.startsPerHour > 3) {
    const startProb = Math.min(100, (conditions.startsPerHour - 3) * 10);
    causes.push({
      name: 'Frequent Starting',
      probability: Math.round(Math.min(100, startProb)),
      severity: getSeverity(startProb),
      description: `Motor is starting ${conditions.startsPerHour} times per hour. Each start draws 5-8× rated current, causing rapid thermal cycling. NEMA limits vary by motor design (typically 4-10 starts/hour for normal duty).`,
      recommendation: conditions.startsPerHour > 10
        ? 'Starting frequency is very high and risks insulation fatigue from thermal cycling. Consider a soft starter, VFD, or motor designed for frequent starting duty.'
        : 'Starting frequency is above normal. Verify motor is rated for this duty cycle. Consider soft starting to reduce thermal stress.',
      icon: 'RotateCw',
    });
  }

  // Sort by probability (highest first)
  causes.sort((a, b) => b.probability - a.probability);

  return causes;
}

function getSeverity(probability: number): RiskLevel {
  if (probability < 20) return 'healthy';
  if (probability < 40) return 'monitor';
  if (probability < 65) return 'warning';
  if (probability < 85) return 'critical';
  return 'emergency';
}