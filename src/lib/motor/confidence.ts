// Motor Thermal Digital Twin — Confidence Scoring Engine
// Dynamic confidence scoring based on available data completeness

import type { MotorNameplate, OperatingConditions, ConfidenceResult, ConfidenceFactor } from './types';

/**
 * Calculate dynamic confidence score based on available data points.
 * 
 * Base confidence: 65% (minimum with only essential nameplate data)
 * Each additional verified data point adds to the score.
 * Maximum: 95% (never 100% — this is estimation, not measurement)
 * 
 * Rationale for 95% cap:
 * "Even with all possible nameplate data, this remains a lumped-parameter
 *  model. Real motors have distributed thermal networks, hot-spot variations,
 *  and manufacturing tolerances. 5% uncertainty is the minimum achievable."
 */
export function calculateConfidence(
  nameplate: MotorNameplate,
  conditions: OperatingConditions
): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];
  const missing: string[] = [];
  let score = 65; // Base score for having essential nameplate data

  // === Essential data (included in base score) ===
  factors.push({
    name: 'Nameplate Power Rating',
    contributed: nameplate.ratedPower > 0,
    points: 0,
    description: 'Rated power from nameplate (kW)',
  });

  factors.push({
    name: 'Nameplate Voltage',
    contributed: nameplate.ratedVoltage > 0,
    points: 0,
    description: 'Rated voltage from nameplate (V)',
  });

  factors.push({
    name: 'Nameplate Current',
    contributed: nameplate.ratedCurrent > 0,
    points: 0,
    description: 'Rated current from nameplate (A)',
  });

  factors.push({
    name: 'Nameplate Efficiency',
    contributed: nameplate.efficiency > 0 && nameplate.efficiency < 1,
    points: 0,
    description: 'Full-load efficiency from nameplate',
  });

  // === Additional confidence factors ===

  // Insulation class (+5 points)
  if (nameplate.insulationClass) {
    score += 5;
    factors.push({ name: 'Insulation Class', contributed: true, points: 5, description: 'IEC 60034-1 insulation class defines thermal limit' });
  } else {
    missing.push('Insulation Class — using default Class F assumption');
  }

  // Enclosure type (+5 points)
  if (nameplate.enclosureType) {
    score += 5;
    factors.push({ name: 'Enclosure Type', contributed: true, points: 5, description: 'TEFC/ODP type determines cooling model' });
  } else {
    missing.push('Enclosure Type — using default TEFC assumption');
  }

  // Service factor (+3 points)
  if (nameplate.serviceFactor > 0) {
    score += 3;
    factors.push({ name: 'Service Factor', contributed: true, points: 3, description: 'NEMA MG-1 service factor for overload capability' });
  }

  // Power factor (+2 points)
  if (nameplate.powerFactor > 0) {
    score += 2;
    factors.push({ name: 'Power Factor', contributed: true, points: 2, description: 'Rated power factor from nameplate' });
  }

  // Operating voltage provided (+5 points)
  if (conditions.voltage > 0) {
    score += 5;
    factors.push({ name: 'Operating Voltage', contributed: true, points: 5, description: 'Actual supply voltage for loss calculation' });
  }

  // Operating current provided (+5 points)
  if (conditions.current > 0) {
    score += 5;
    factors.push({ name: 'Operating Current', contributed: true, points: 5, description: 'Actual load current — primary thermal driver' });
  }

  // Operating frequency provided (+2 points)
  if (conditions.frequency > 0) {
    score += 2;
    factors.push({ name: 'Operating Frequency', contributed: true, points: 2, description: 'Supply frequency affects core loss and speed' });
  }

  // Speed measurement (+3 points)
  if (conditions.speed > 0) {
    score += 3;
    factors.push({ name: 'Speed Measurement', contributed: true, points: 3, description: 'Actual speed improves cooling model accuracy' });
  } else {
    missing.push('Speed — estimated from frequency and slip');
  }

  // Ambient temperature (+3 points)
  if (conditions.ambientTemp > 0) {
    score += 3;
    factors.push({ name: 'Ambient Temperature', contributed: true, points: 3, description: 'Ambient affects absolute temperature and cooling' });
  } else {
    missing.push('Ambient Temperature — using default 40°C');
  }

  // Voltage imbalance (+2 points)
  if (conditions.voltageImbalance !== undefined && conditions.voltageImbalance !== null) {
    score += 2;
    factors.push({ name: 'Voltage Imbalance', contributed: true, points: 2, description: 'Phase voltage imbalance per NEMA MG-1' });
  }

  // Current imbalance (+2 points)
  if (conditions.currentImbalance !== undefined && conditions.currentImbalance !== null) {
    score += 2;
    factors.push({ name: 'Current Imbalance', contributed: true, points: 2, description: 'Phase current imbalance indicates potential issues' });
  }

  // Starts per hour (+1 point)
  if (conditions.startsPerHour !== undefined && conditions.startsPerHour !== null) {
    score += 1;
    factors.push({ name: 'Starts Per Hour', contributed: true, points: 1, description: 'Frequent starts add thermal cycling stress' });
  }

  // Cap at 95%
  score = Math.min(95, score);

  // Generate explanation
  let explanation = `Confidence: ${score}% — `;
  if (score >= 90) {
    explanation += 'High confidence. Most data points are available. Model estimates are reliable for operational decisions.';
  } else if (score >= 80) {
    explanation += 'Good confidence. Core data is available with some assumptions. Results suitable for monitoring.';
  } else if (score >= 70) {
    explanation += 'Moderate confidence. Some key data is estimated. Use results for trend monitoring, not absolute values.';
  } else {
    explanation += 'Low confidence. Multiple assumptions are in play. Results are indicative only.';
  }
  
  if (score < 95) {
    explanation += ' Maximum achievable is 95% — even with perfect data, this remains a lumped-parameter estimation model.';
  }

  return { score, factors, missing, explanation };
}