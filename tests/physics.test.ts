/**
 * Physics & motor-model tests.
 *
 * These tests verify the ENGINEERING CORRECTNESS of the calculations:
 *   - Power balance (P_in = P_out + P_losses)
 *   - Loss segregation per IEEE 112 / IEC 60034-2-1
 *   - Temperature-dependent resistance coupling
 *   - Thermal model energy conservation
 *   - Numerical stability
 *   - Edge cases (zero load, overload, cooling failure)
 */

import {
  threePhasePower,
  statorCopperLoss,
  rotorCopperLoss,
  slipFromSpeed,
  synchronousSpeed,
  coreLossSeparated,
  hotResistance,
  firstOrderThermal,
  coolingEffectiveness,
  voltageImbalanceDerating,
  voltageImbalance,
  imbalanceHeating,
  insulationLifeFactor,
  hotSpotTemperature,
  powerBalanceError,
  safeDiv,
  SQRT3,
} from '../src/lib/motor/physics';
import {
  segregateRatedLosses,
  computeLosses,
  estimateResistance,
  estimateThermalTimeConstant,
  calculateRatedTempRise,
} from '../src/lib/motor/motor-model';
import {
  createThermalModel,
  stepThermalModel,
  resetThermalModel,
  runSimulation,
} from '../src/lib/motor/thermal-model';
import { DEFAULT_MOTOR, DEFAULT_OPERATING } from '../src/lib/motor/types';

// ─── A. Three-phase electrical ────────────────────────────────────────────
describe('Three-phase electrical', () => {
  test('P_in = √3 × V × I × PF', () => {
    const p = threePhasePower(400, 130, 0.85);
    expect(p).toBeCloseTo(76556, -1);  // √3 × 400 × 130 × 0.85 = 76556.6
  });
  test('√3 ≈ 1.732', () => {
    expect(SQRT3).toBeCloseTo(1.7320508, 4);
  });
  test('zero voltage → zero power', () => {
    expect(threePhasePower(0, 130, 0.85)).toBe(0);
  });
  test('zero PF → zero power', () => {
    expect(threePhasePower(400, 130, 0)).toBe(0);
  });
});

// ─── B. Stator copper loss (star/delta) ───────────────────────────────────
describe('Stator copper loss', () => {
  test('star: P_cu = 3 × I_line² × R', () => {
    const loss = statorCopperLoss(100, 0.5, 'star');
    expect(loss).toBeCloseTo(15000, 1);
  });
  test('delta: P_cu = I_line² × R', () => {
    const loss = statorCopperLoss(100, 0.5, 'delta');
    expect(loss).toBeCloseTo(5000, 1);
  });
  test('delta loss = 1/3 × star loss (same line current)', () => {
    const s = statorCopperLoss(100, 0.5, 'star');
    const d = statorCopperLoss(100, 0.5, 'delta');
    expect(d).toBeCloseTo(s / 3, 1);
  });
});

// ─── C. Slip and synchronous speed ────────────────────────────────────────
describe('Slip and synchronous speed', () => {
  test('n_sync = 120 × f / p', () => {
    expect(synchronousSpeed(50, 4)).toBe(1500);
    expect(synchronousSpeed(60, 4)).toBe(1800);
    expect(synchronousSpeed(50, 2)).toBe(3000);
  });
  test('slip = (n_sync − n) / n_sync', () => {
    expect(slipFromSpeed(1470, 1500)).toBeCloseTo(0.02, 4);
  });
  test('zero slip at synchronous speed', () => {
    expect(slipFromSpeed(1500, 1500)).toBe(0);
  });
  test('slip = 1 at standstill', () => {
    expect(slipFromSpeed(0, 1500)).toBeCloseTo(1, 4);
  });
});

// ─── D. Rotor copper loss ─────────────────────────────────────────────────
describe('Rotor copper loss', () => {
  test('P_cu_r = s × P_ag', () => {
    expect(rotorCopperLoss(0.02, 75000)).toBeCloseTo(1500, 0);
  });
  test('zero slip → zero rotor loss', () => {
    expect(rotorCopperLoss(0, 75000)).toBe(0);
  });
  test('negative air-gap → clamped to 0', () => {
    expect(rotorCopperLoss(0.02, -1000)).toBe(0);
  });
});

// ─── E. Core loss (separated hysteresis + eddy) ────────────────────────────
describe('Core loss (separated)', () => {
  test('at rated V and f → returns rated values', () => {
    const r = coreLossSeparated(400, 50, 400, 50, 600, 400);
    expect(r.hysteresis).toBeCloseTo(600, 0);
    expect(r.eddy).toBeCloseTo(400, 0);
    expect(r.total).toBeCloseTo(1000, 0);
  });
  test('at half frequency, eddy drops ∝ f²', () => {
    const half = coreLossSeparated(200, 25, 400, 50, 600, 400);
    expect(half.hysteresis).toBeCloseTo(300, 0);  // ∝ f
    expect(half.eddy).toBeCloseTo(100, 0);          // ∝ f²
  });
});

// ─── F. Temperature-dependent resistance ───────────────────────────────────
describe('Hot resistance', () => {
  test('R at same temp → same R', () => {
    expect(hotResistance(1.0, 25, 25)).toBe(1.0);
  });
  test('R increases with temperature', () => {
    expect(hotResistance(1.0, 25, 100)).toBeGreaterThan(1.0);
  });
  test('at 75°C → R ≈ 1.19 × R_25', () => {
    expect(hotResistance(1.0, 25, 75)).toBeCloseTo(1.192, 2);
  });
});

// ─── G. Rated loss segregation (IEEE 112) ──────────────────────────────────
describe('Rated loss segregation', () => {
  const breakdown = segregateRatedLosses(DEFAULT_MOTOR);
  test('total losses = P_in − P_out', () => {
    const pOut = DEFAULT_MOTOR.ratedPower * 1000;
    const pIn = pOut / DEFAULT_MOTOR.efficiency;
    expect(breakdown.total).toBeCloseTo(pIn - pOut, 0);
  });
  test('component sum ≈ total', () => {
    const sum = breakdown.statorCopper + breakdown.rotorCopper +
                breakdown.core + breakdown.mechanical + breakdown.stray;
    expect(sum).toBeCloseTo(breakdown.total, -1);
  });
  test('slip is 2% for 1470 rpm @ 50 Hz', () => {
    expect(breakdown.slip).toBeCloseTo(0.02, 3);
  });
  test('rotor copper = slip × air-gap power', () => {
    expect(breakdown.rotorCopper).toBeCloseTo(breakdown.slip * breakdown.airGapPower, 0);
  });
  test('stray = 1.8% of rated output (IEC 60034-2-1)', () => {
    expect(breakdown.stray).toBeCloseTo(DEFAULT_MOTOR.ratedPower * 1000 * 0.018, 0);
  });
});

// ─── H. Operating-point losses & power balance ─────────────────────────────
describe('Operating-point losses & power balance', () => {
  const rated = segregateRatedLosses(DEFAULT_MOTOR);
  const losses = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 40, rated);
  test('P_in ≈ 76,540 W', () => {
    expect(losses.inputPower).toBeCloseTo(76540, -2);
  });
  test('power balance error < 1%', () => {
    expect(losses.balanceError).toBeLessThan(1.0);
  });
  test('efficiency ≈ nameplate', () => {
    const eff = losses.outputPower / losses.inputPower;
    expect(Math.abs(eff - DEFAULT_MOTOR.efficiency)).toBeLessThan(0.02);
  });
  test('2× current → ~4× copper loss', () => {
    const ol = computeLosses(DEFAULT_MOTOR, { ...DEFAULT_OPERATING, current: 260 }, 80, rated);
    const ratio = ol.statorCopperLoss / losses.statorCopperLoss;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(5.0);
  });
  test('hotter winding → higher copper loss', () => {
    const cold = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 25, rated);
    const hot = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 120, rated);
    expect(hot.statorCopperLoss).toBeGreaterThan(cold.statorCopperLoss);
  });
});

// ─── I. Cooling effectiveness ──────────────────────────────────────────────
describe('Cooling effectiveness', () => {
  test('TEFC at rated speed → 1.0', () => {
    expect(coolingEffectiveness('TEFC', 1.0)).toBeCloseTo(1.0, 2);
  });
  test('TEFC at standstill → 0.15', () => {
    expect(coolingEffectiveness('TEFC', 0)).toBeCloseTo(0.15, 2);
  });
  test('TEAO/TEBV always 1.0', () => {
    expect(coolingEffectiveness('TEAO', 0)).toBe(1.0);
    expect(coolingEffectiveness('TEBV', 0.5)).toBe(1.0);
  });
});

// ─── J. Voltage imbalance ──────────────────────────────────────────────────
describe('Voltage imbalance', () => {
  test('balanced → 0%', () => {
    expect(voltageImbalance(400, 400, 400)).toBe(0);
  });
  test('5% imbalance → 0.75 derating', () => {
    expect(voltageImbalanceDerating(5)).toBeCloseTo(0.75, 2);
  });
  test('imbalance heating increases with imbalance', () => {
    expect(imbalanceHeating(3, 1000)).toBeGreaterThan(imbalanceHeating(1, 1000));
  });
});

// ─── K. Insulation life ────────────────────────────────────────────────────
describe('Insulation life (Montsinger)', () => {
  test('at rated temp → 1.0', () => {
    expect(insulationLifeFactor(155, 155)).toBe(1.0);
  });
  test('+10°C → 0.5', () => {
    expect(insulationLifeFactor(165, 155)).toBeCloseTo(0.5, 2);
  });
  test('+20°C → 0.25', () => {
    expect(insulationLifeFactor(175, 155)).toBeCloseTo(0.25, 2);
  });
  test('hot-spot adds allowance (Class F: +15°C)', () => {
    expect(hotSpotTemperature(100, 'F')).toBe(115);
  });
});

// ─── L. First-order thermal ────────────────────────────────────────────────
describe('First-order thermal', () => {
  test('at t=0 → initial temp', () => {
    expect(firstOrderThermal(100, 40, 0, 30)).toBe(40);
  });
  test('at t=∞ → steady-state', () => {
    expect(firstOrderThermal(100, 40, 300, 30)).toBeCloseTo(100, 0);
  });
  test('at t=τ → 63.2% of the way', () => {
    expect(firstOrderThermal(100, 40, 30, 30)).toBeCloseTo(100 - 0.368 * 60, 0);
  });
});

// ─── M. Multi-node thermal model ───────────────────────────────────────────
describe('Multi-node thermal model', () => {
  test('initializes all nodes at ambient', () => {
    const m = createThermalModel(DEFAULT_MOTOR);
    expect(m.windingTemp).toBe(40);
    expect(m.coreTemp).toBe(40);
    expect(m.frameTemp).toBe(40);
  });
  test('stepping under load increases winding temp', () => {
    const m = createThermalModel(DEFAULT_MOTOR);
    const rated = segregateRatedLosses(DEFAULT_MOTOR);
    const losses = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 40, rated);
    const s = stepThermalModel(m, DEFAULT_MOTOR, DEFAULT_OPERATING, losses, 1);
    expect(s.windingTemp).toBeGreaterThan(40);
  });
  test('core temp lags winding temp', () => {
    const m = createThermalModel(DEFAULT_MOTOR);
    const rated = segregateRatedLosses(DEFAULT_MOTOR);
    const losses = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 40, rated);
    stepThermalModel(m, DEFAULT_MOTOR, DEFAULT_OPERATING, losses, 5);
    expect(m.windingTemp).toBeGreaterThan(m.coreTemp);
  });
  test('reset returns all to ambient', () => {
    const m = createThermalModel(DEFAULT_MOTOR);
    const rated = segregateRatedLosses(DEFAULT_MOTOR);
    const losses = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 40, rated);
    stepThermalModel(m, DEFAULT_MOTOR, DEFAULT_OPERATING, losses, 60);
    expect(m.windingTemp).toBeGreaterThan(40);
    resetThermalModel(m, 40);
    expect(m.windingTemp).toBe(40);
    expect(m.coreTemp).toBe(40);
    expect(m.frameTemp).toBe(40);
  });
  test('numerical stability: 1000 steps no NaN', () => {
    const m = createThermalModel(DEFAULT_MOTOR);
    const rated = segregateRatedLosses(DEFAULT_MOTOR);
    const losses = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 40, rated);
    for (let i = 0; i < 1000; i++) {
      stepThermalModel(m, DEFAULT_MOTOR, DEFAULT_OPERATING, losses, 0.5);
    }
    expect(isFinite(m.windingTemp)).toBe(true);
    expect(m.windingTemp).toBeLessThan(300);
  });
  test('simulation returns array of points', () => {
    const m = createThermalModel(DEFAULT_MOTOR);
    const rated = segregateRatedLosses(DEFAULT_MOTOR);
    const losses = computeLosses(DEFAULT_MOTOR, DEFAULT_OPERATING, 40, rated);
    const pts = runSimulation(m, DEFAULT_MOTOR, DEFAULT_OPERATING, losses, 60, 5);
    expect(pts.length).toBeGreaterThan(10);
    expect(pts[0].time).toBe(0);
  });
});

// ─── N. Power balance ──────────────────────────────────────────────────────
describe('Power balance', () => {
  test('balanced → 0% error', () => {
    expect(powerBalanceError(100, 80, 20)).toBe(0);
  });
  test('10% off → 10% error', () => {
    expect(powerBalanceError(100, 70, 20)).toBeCloseTo(10, 0);
  });
});

// ─── O. Safe division ──────────────────────────────────────────────────────
describe('safeDiv', () => {
  test('normal', () => { expect(safeDiv(10, 2)).toBe(5); });
  test('by zero → 0', () => { expect(safeDiv(10, 0)).toBe(0); });
  test('by Infinity → 0', () => { expect(safeDiv(10, Infinity)).toBe(0); });
});
