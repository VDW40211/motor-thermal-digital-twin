# Engineering Model Documentation

> Authoritative reference for the Motor Thermal Digital Twin physics and
> thermal model. Every equation, assumption, and limitation is documented
> here so the model is fully traceable.

---

## 1. Power Flow (IEEE 112 / IEC 60034-2-1)

```
                         ┌─────────────────────────────────────┐
                         │            INDUCTION MOTOR            │
   P_in ───────────────▶│  ┌─────────┐  P_ag   ┌─────────┐       │
   (electrical)         │  │Stator cu│ ───────▶│Rotor cu │       │
   √3·V·I·PF            │  │ loss    │         │ loss    │       │
                        │  └─────────┘  ┌──────└─────────┘       │
                        │               │       (1-s)·P_ag        │
                        │  ┌─────────┐  │      ───────▶ P_mech   │
                        │  │Core loss│◀─┘  (mechanical dev)      │
                        │  └─────────┘          │                │
                        │                  ┌─────▼─────┐          │
                        │                  │Friction + │          │
                        │                  │Stray      │          │
                        │                  └─────┬─────┘          │
                        │                        │                │
   P_shaft ◀───────────┤  (output power) ◀──────┘                │
                         └─────────────────────────────────────┘
```

### Equations

| Quantity | Equation | Units |
|---|---|---|
| Input power | `P_in = √3 × V_line × I_line × PF` | W |
| Stator copper loss | `P_cu_s = 3 × I_phase² × R_s(T)` | W |
| Air-gap power | `P_ag = P_in − P_cu_s − P_core` | W |
| Slip | `s = (n_sync − n) / n_sync` | – |
| Rotor copper loss | `P_cu_r = s × P_ag` | W |
| Mechanical developed | `P_mech_dev = (1 − s) × P_ag` | W |
| Shaft output | `P_shaft = P_mech_dev − P_fw − P_stray` | W |
| Synchronous speed | `n_sync = 120 × f / p` | rpm |

### Power Balance Check

```
P_in = P_shaft + P_cu_s + P_cu_r + P_core + P_fw + P_stray
```

The model computes a `balanceError` (%), which should be <1% at steady
state. >5% indicates a numerical or parameter error.

---

## 2. Core (Iron) Loss — Separated Hysteresis + Eddy

The legacy model used a single blended Steinmetz exponent `f^1.6`.
This is an empirical compromise between hysteresis (∝ f) and eddy
current (∝ f²). The upgraded model separates them:

```
P_core = P_hysteresis + P_eddy

P_hysteresis = P_h_rated × (f/f_r) × (B/B_rated)^α     (α ≈ 2.0)
P_eddy       = P_e_rated × (f/f_r)² × (B/B_rated)²

where B/B_rated = (V/V_r) / (f/f_r)    (constant V/f assumption)
```

At rated V and f, this reduces to `P_h + P_e = P_core_rated`. At half
frequency with constant V/f (VFD operation), hysteresis halves (∝ f)
while eddy drops to 1/4 (∝ f²), giving better accuracy than the single
exponent.

**Assumption A4:** Core loss split is 60% hysteresis + 40% eddy at
rated frequency. Actual split depends on lamination thickness and
material grade.

---

## 3. Temperature-Dependent Copper Resistance

Copper resistance increases with temperature, creating a thermal-electrical
feedback loop: hotter windings → higher R → higher copper loss → hotter
windings. This coupling is CRITICAL and was missing from the legacy model.

```
R_s(T) = R_s(T_ref) × (235 + T) / (235 + T_ref)
```

The constant 235°C is the inferred absolute zero for copper
(α₀ = 1/235 per °C at 0°C).

**Assumption A7:** Reference temperature is 25°C (cold measurement).
IEC 60034-2-1 uses 95°C for hot-rated Class F.

In the upgraded model, `computeLosses()` takes the current winding
temperature and corrects R_s before computing copper loss. This means
the copper loss INCREASES as the motor heats up, which is physically
correct.

---

## 4. Multi-Node Thermal Model

### Topology

```
   P_cu_s + P_cu_r        P_core              P_fw + P_stray
         │                   │                      │
         ▼                   ▼                      ▼
   ┌──────────┐  R_w_c  ┌────────┐  R_c_f  ┌─────────┐  R_f_a  ┌─────────┐
   │ WINDING  │────────▶│  CORE  │────────▶│  FRAME  │────────▶│ AMBIENT │
   │ τ ≈ 10m  │         │ τ≈30m  │         │ τ ≈ 90m │         │  T_amb  │
   └──────────┘         └────────┘         └─────────┘         └─────────┘
```

Three thermal nodes with different time constants:
- **Winding** (fast, τ ≈ 10–20 min): receives stator + rotor copper losses
- **Core** (medium, τ ≈ 30–60 min): receives iron loss + heat from winding
- **Frame** (slow, τ ≈ 60–120 min): receives mechanical + stray losses,
  dissipates to ambient via convection (cooling-dependent)

### ODEs

For each node:
```
C × dT/dt = P_in(node) − Q_out(node)
```

where:
- `C = τ × G` (thermal capacitance, J/°C)
- `Q = G × ΔT` (heat flow, W)

### Numerical Integration

Explicit (forward) Euler with substepping:
- External step: 0.5 min (30 s)
- Internal substep: 0.1 min (6 s) — 50× safety margin below the
  stability bound `dt < min(τ)/2`

### Energy Conservation

At steady state, total heat generated = total heat dissipated to ambient:
```
P_total_losses = G_frame_ambient × (T_frame − T_ambient) × coolingEffectiveness
```

The `energyBalanceError()` function verifies this.

### Assumptions

- **T1:** Three-node model is sufficient for monitoring. A 6–10 node
  model would require proprietary construction data.
- **T2:** Thermal resistances are constant (not temperature-dependent).
- **T3:** Radiation is negligible below 100°C frame temperature.
- **T4:** The frame is the only node dissipating to ambient.
- **T5:** Cooling effectiveness scales the frame-to-ambient conductance only.

---

## 5. Cooling Effectiveness by Enclosure Type

| Enclosure | Model | At rated speed | At standstill |
|---|---|---|---|
| TEFC | `max(0.15, n^0.8)` | 1.0 | 0.15 |
| ODP | `max(0.5, 0.5 + 0.5·n)` | 1.0 | 0.50 |
| WP-II | `max(0.2, n^0.75)` | 1.0 | 0.20 |
| TEAO | constant 1.0 | 1.0 | 1.0 (forced) |
| TEBV | constant 1.0 | 1.0 | 1.0 (forced) |

### VFD Low-Speed Derating

For TEFC motors below 40% rated speed on a VFD, the shaft fan cannot
provide adequate cooling. An ADDITIONAL derating (0.7–1.0) is applied:

```
derate = 0.7 + 0.3 × (min(speedRatio, freqRatio) / 0.4)
```

This is an EMPIRICAL derating. The exact curve is manufacturer-specific
(see NEMA MG 1 Part 31).

---

## 6. Voltage Imbalance (NEMA MG-1 §14.36)

### Imbalance Calculation (NEMA definition)

```
% imbalance = 100 × (V_max_deviation / V_avg)
```

### Derating Curve

| Imbalance | Derating |
|---|---|
| 0% | 1.00 |
| 1% | 0.99 |
| 2% | 0.95 |
| 3% | 0.89 |
| 4% | 0.82 |
| 5% | 0.75 (NEMA limit) |

### Additional Heating

Voltage imbalance causes negative-sequence current, which rotates
backwards and induces double-frequency eddy currents in the rotor:

```
I₂ ≈ (V_imb% / 100) × 6 × I_rated    (approximate)
P_add ≈ 6 × (I₂/I_rated)² × P_cu_s_rated
```

The factor 6 accounts for the skin-effect concentration of rotor
currents at high frequency.

---

## 7. Insulation Life (Montsinger's Rule)

```
Life(T) / Life(T_rated) = 2^(-(T_hotspot − T_rated_hotspot) / 10)
```

"Life halves for every 10°C above rated hot-spot temperature."

### Hot-Spot Allowance (IEC 60034-1)

| Class | Limit | Hot-spot allowance | Rated rise (40°C amb) |
|---|---|---|---|
| A | 105°C | 5°C | 60°C |
| B | 130°C | 10°C | 80°C |
| F | 155°C | 15°C | 100°C |
| H | 180°C | 15°C | 125°C |

**IMPORTANT:** The life factor uses the HOT-SPOT temperature, not the
average winding temperature. The model adds the class-dependent
allowance before computing the life factor.

### Limitations

Montsinger's rule is an EMPIRICAL approximation. Actual insulation life
depends on:
- Thermal cycling (start/stop frequency)
- Voltage stress
- Moisture and contamination
- Mechanical vibration
- Insulation system chemistry

This model does NOT predict remaining useful life. It returns a
relative factor (1.0 = normal, 0.5 = half life, etc.).

---

## 8. Assumption Register

All assumptions are tagged with an ID for traceability.

| ID | Assumption | Impact |
|---|---|---|
| A1 | Stator winding is star-connected by default | Affects phase vs line current conversion |
| A2 | Power factor at operating load = rated PF | Underestimates PF at low load, overestimates at overload |
| A3 | Stator resistance at 25°C derived from rated copper loss | Should be measured via DC test (IEEE 112 §5.2) |
| A4 | Core loss split: 60% hysteresis + 40% eddy | Actual split depends on lamination grade |
| A5 | Mechanical loss = 10% of total rated losses | IEEE 112 typical range 5–15% |
| A6 | Stray-load loss = 1.8% of rated output (1–125 kW) | IEC 60034-2-1 assumption |
| A7 | Reference temperature for R is 25°C | IEC uses 95°C for hot-rated Class F |
| T1 | Three-node thermal model is sufficient | 6–10 node model would be more accurate |
| T2 | Thermal resistances are constant | Convection actually improves with ΔT |
| T3 | Radiation negligible below 100°C frame | Valid for most operating conditions |
| T4 | Only the frame dissipates to ambient | End-windings also convect (second-order) |
| T5 | Cooling scales frame-to-ambient conductance only | Inter-node G is constant |

---

## 9. Model Limitations

This tool is NOT a validated digital twin. The following limitations
apply:

### Physics Limitations
1. **Single-phase equivalent** — assumes balanced 3-phase supply.
   For unbalanced supplies, use symmetrical components (not implemented).
2. **No saturation model** — the magnetic circuit is assumed linear.
   Above rated voltage, the model under-predicts current.
3. **No harmonic losses** — VFD harmonic heating is not modeled.
   Requires a harmonic spectrum + frequency-dependent loss model.
4. **No transient electrical dynamics** — the electrical model is
   quasi-static (no d/dt for currents). Starting transients (inrush)
   are not captured.
5. **Rotor is a single thermal node** — real rotors have separate
   bar and end-ring temperatures.

### Validation Status
- **NOT validated** against any manufacturer's test data.
- Equations are traceable to IEEE 112 / IEC 60034-2-1 standards.
- Numerical implementation is unit-tested (53 tests pass).
- Absolute temperature predictions have ±15–25°C uncertainty.
- RELATIVE trends (load increase → temp increase) are reliable.
- Do NOT use for safety-critical thermal protection.
  Use physical RTDs/thermistors per IEC 60034-11.

### What This Tool CAN Do
- Trend monitoring (relative changes are accurate)
- Comparative analysis (A/B between motors or conditions)
- Root cause identification (when thresholds are clearly crossed)
- Educational transparency (every equation is documented)

### What This Tool CANNOT Do
- Replace physical temperature sensors
- Predict absolute winding temperature to ±5°C
- Model VFD harmonic heating
- Capture hot-spot distribution within the winding
- Predict bearing failure
- Comply with IEC 60034-1 type-test requirements
