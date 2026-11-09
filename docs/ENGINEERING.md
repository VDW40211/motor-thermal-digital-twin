# Engineering Reference

This document explains every equation and standard used by the Motor Thermal Digital Twin, with code references for verification.

## 1. Loss Segregation (IEEE 112 / IEC 60034-2)

When a motor's nameplate provides only rated power and efficiency, total losses are computed:

```
P_total = P_output × (1/η - 1)
```

Then segregated using industry-standard ratios for general-purpose induction motors:

| Loss Type | Ratio | Equation | Standard |
|---|---|---|---|
| Copper (stator I²R) | 60% | `3 × I² × R` | Ohm's law |
| Core (Steinmetz) | 20% | `P_rated × (V/V_r)² × (f/f_r)^1.6` | Steinmetz equation |
| Mechanical | 10% | `P_rated × (n/n_r)` | Friction + windage |
| Stray Load | 10% | `P_rated × (I/I_r)²` | IEEE 112 |

**Code:** `src/lib/motor/motor-model.ts` → `segregateLosses()`, `computeLosses()`
**Live display:** `src/components/motor/LossBreakdown.tsx`

---

## 2. First-Order Thermal Model

The lumped-parameter thermal network is:

```
θ(t) = θ_ss − (θ_ss − θ_0) × e^(−t/τ)
```

Where:
- `θ_ss = T_ambient + ΔT_ss` (steady-state temperature)
- `ΔT_ss = P_total / G_thermal` (steady-state rise, Newton's law of cooling)
- `G_thermal = P_rated_losses / ΔT_rated` (thermal conductance, W/°C)
- `τ` = thermal time constant (estimated from motor size)

### Time constant estimation by motor size

| Power Range | τ (minutes) | Basis |
|---|---|---|
| < 10 kW | 15–20 | Small thermal mass |
| 10–100 kW | 25–35 | Medium |
| > 100 kW | 40–60 | Large thermal mass |

**Code:** `src/lib/motor/physics.ts` → `firstOrderThermal()`, `temperatureRise()`
**Code:** `src/lib/motor/motor-model.ts` → `estimateThermalTimeConstant()`, `estimateThermalConductance()`

---

## 3. Cooling Effectiveness by Enclosure Type

| Enclosure | Model | At rated speed | At standstill |
|---|---|---|---|
| TEFC | `n^0.8` | 1.0 | 0.15 |
| ODP | `0.5 + 0.5 × n` | 1.0 | 0.50 |
| WP-II | `n^0.75` | 1.0 | 0.20 |
| TEAO/TEBV | constant 1.0 | 1.0 | 1.0 (forced) |

**Code:** `src/lib/motor/physics.ts` → `coolingEffectiveness()`

---

## 4. NEMA MG-1 Voltage Imbalance Derating (§14.36)

```
derating = 1 − 0.05 × V_imb^1.3    (capped at 0.75)
```

Approximates the NEMA MG-1 curve:
- 1% imbalance → ~0.98 derating
- 2% imbalance → ~0.95 derating
- 3% imbalance → ~0.90 derating
- 5% imbalance → 0.75 derating (NEMA limit)

**Code:** `src/lib/motor/physics.ts` → `voltageImbalanceDerating()`

---

## 5. Montsinger's Rule (Insulation Life)

```
Life_factor = 2^(−ΔT / 10)
```

Every 10°C above rated temperature halves the insulation life. Example:
- 0°C over → 100% life
- 10°C over → 50% life
- 20°C over → 25% life
- 30°C over → 12.5% life

**Code:** `src/lib/motor/physics.ts` → `insulationLifeFactor()`

---

## 6. IEC 60034-1 Insulation Classes

| Class | Max Temp (°C) | Typical Application |
|---|---|---|
| A | 105 | Old/legacy motors |
| B | 130 | Standard industrial |
| F | 155 | Most common modern |
| H | 180 | High-temp / VFD |

Rated temperature rise is typically 10–15°C below the absolute limit (hot-spot allowance).

**Code:** `src/lib/motor/types.ts` → `INSULATION_LIMITS`
**Code:** `src/lib/motor/motor-model.ts` → `calculateRatedTempRise()`

---

## 7. Hot Resistance Correction (Copper)

```
R_hot = R_cold × (235 + T_hot) / (235 + T_cold)
```

The 235°C constant is the inferred absolute zero for copper resistance.
Reference temperature is typically 25°C (cold).

**Code:** `src/lib/motor/physics.ts` → `hotResistance()`

---

## 8. Time-to-Trip Calculation

Inverse of the first-order model — solving `θ(t)` for `t`:

```
t = −τ × ln((θ_ss − θ_target) / (θ_ss − θ_0))
```

Returns `Infinity` if steady-state temp is below target (motor will never reach it).

**Code:** `src/lib/motor/physics.ts` → `timeToReachTemp()`

---

## 9. Root Cause Probability Engine

Uses **sigmoid functions** for smooth probability mapping (no ML, fully explainable):

```
P(x) = 1 / (1 + e^(−k × (x − x_0))) × 100
```

### 9 root cause categories

| # | Cause | Trigger | Center | Steepness |
|---|---|---|---|---|
| 1 | Electrical Overload | load% > 100 | 100 | 0.15 |
| 2 | Low Speed Cooling | n/n_r < 1 (TEFC) | — | linear |
| 3 | Voltage Deviation | \|V − V_r\|/V_r > 5% | 5 | 0.30 |
| 4 | Oversized Motor | load% < 50 | — | linear |
| 5 | Undersized Motor | load% > 95 | 100 | 0.10 |
| 6 | High Ambient | T_amb > 35°C | — | ×8 per °C |
| 7 | Voltage Imbalance | V_imb > 0.5% | — | ×12 per % |
| 8 | Current Imbalance | I_imb > 1% | — | ×8 per % |
| 9 | Frequent Starting | starts/hr > 3 | — | ×10 per start |

**Code:** `src/lib/motor/root-cause.ts` → `analyzeRootCauses()`

---

## 10. Confidence Scoring

Dynamic, transparent scoring based on data completeness:

| Score Range | Interpretation |
|---|---|
| 90–95% | High — most data available |
| 80–89% | Good — core data with some assumptions |
| 70–79% | Moderate — use for trends, not absolutes |
| 65–69% | Low — indicative only |

**Hard cap at 95%** — even with perfect data, this remains a lumped-parameter estimation model. 5% uncertainty is the minimum achievable.

### Points breakdown

| Factor | Points |
|---|---|
| Base (essential nameplate) | 65 |
| Insulation class | +5 |
| Enclosure type | +5 |
| Service factor | +3 |
| Power factor | +2 |
| Operating voltage | +5 |
| Operating current | +5 |
| Operating frequency | +2 |
| Speed measurement | +3 |
| Ambient temperature | +3 |
| Voltage imbalance | +2 |
| Current imbalance | +2 |
| Starts per hour | +1 |
| **Max possible** | **95** |

**Code:** `src/lib/motor/confidence.ts` → `calculateConfidence()`

---

## Verification & Validation

This tool has been validated against:
- ✅ Internal consistency (equations match references)
- ✅ Boundary conditions (cold start, steady-state, overload)
- ✅ Trend monotonicity (temperature rises monotonically to steady state)
- ⚠️ Not validated against physical motor test data

For production deployment in safety-critical environments, always cross-validate with physical temperature sensors.
