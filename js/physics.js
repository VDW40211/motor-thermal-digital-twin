/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/physics.js
   STEP 5 + 6 / PHASE 2 — Engineering physics engine (losses + thermal).

   Pure engineering functions. No DOM access. No state writes.

   Conventions:
   - SI units throughout (W, V, A, Ω, Hz, rpm, K, °C).
   - All functions return Numbers. Invalid input -> NaN + console.warn.
   - Callers must check isFinite() on results.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    /* ------------------------------------------------------------------
       1. Internal validation helpers
       ------------------------------------------------------------------ */
    function validFinite(x) {
        return typeof x === "number" && isFinite(x);
    }

    function validNonNeg(x) {
        return validFinite(x) && x >= 0;
    }

    function validPositive(x) {
        return validFinite(x) && x > 0;
    }

    function warn(fnName, msg) {
        console.warn("[MTDT.physics." + fnName + "] " + msg);
    }

    /* ==================================================================
       2. COPPER LOSS (stator I²R)

           Pcu = 3 × I² × R

       I   = line current                          (A)
       R   = per-phase equivalent stator resistance (Ω)
       Pcu = total stator copper loss               (W)

       Assumptions:
       - Three-phase machine.
       - R is star-equivalent. Delta windings: enter terminal value / 3.
       - Rotor copper loss NOT included (absorbed into efficiency).
       - I and R must be non-negative.

       Sanity: copperLoss(100, 0.05) = 1500 W
       ================================================================== */
    function copperLoss(I, R) {
        if (!validNonNeg(I)) {
            warn("copperLoss", "I must be a non-negative finite number; got " + I);
            return NaN;
        }
        if (!validNonNeg(R)) {
            warn("copperLoss", "R must be a non-negative finite number; got " + R);
            return NaN;
        }
        return 3 * I * I * R;
    }

    /* ==================================================================
       3. CORE LOSS (Steinmetz-style scaling from rated)

           Pcore = PcoreRated × (V / Vrated)² × (f / frated)^1.5

       V           = operating line voltage (V)
       f           = operating frequency    (Hz)
       PcoreRated  = rated core loss        (W)
       Vrated      = rated line voltage     (V)
       frated      = rated frequency        (Hz)
       Pcore       = operating core loss    (W)

       Assumptions:
       - B ∝ V/f; hysteresis ∝ f·B², eddy ∝ f²·B²  ->  combined ∝ V²·f^1.5.
       - Does not model saturation or VFD harmonics.
       - Vrated and frated must be positive.

       Sanity: coreLoss(400, 50, 1000, 400, 50) = 1000 W
               coreLoss(400, 25, 1000, 400, 50) ≈ 353.55 W
       ================================================================== */
    function coreLoss(V, f, PcoreRated, Vrated, frated) {
        if (!validNonNeg(V) || !validNonNeg(f) || !validNonNeg(PcoreRated)) {
            warn("coreLoss", "V, f, PcoreRated must be non-negative finite numbers");
            return NaN;
        }
        if (!validPositive(Vrated) || !validPositive(frated)) {
            warn("coreLoss", "Vrated and frated must be positive");
            return NaN;
        }
        var voltageRatio = V / Vrated;
        var freqRatio = f / frated;
        return PcoreRated * voltageRatio * voltageRatio * Math.pow(freqRatio, 1.5);
    }

    /* ==================================================================
       4. MECHANICAL LOSS (friction + windage)

           Pmech = PmechRated × (n / nrated)^2.5

       n           = operating speed       (rpm)
       nrated      = rated speed            (rpm)
       PmechRated  = rated mechanical loss  (W)
       Pmech       = operating mech loss    (W)

       Assumptions:
       - Combines bearing friction (~n¹) and fan windage (~n³); n^2.5 is
         the standard compromise.
       - For forced (external constant-speed) ventilation, call with
         n = nrated so the loss is held constant.
       - nrated must be positive.

       Sanity: mechanicalLoss(1480, 1480, 500) = 500 W
       ================================================================== */
    function mechanicalLoss(n, nrated, PmechRated) {
        if (!validNonNeg(n) || !validNonNeg(PmechRated)) {
            warn("mechanicalLoss", "n and PmechRated must be non-negative finite numbers");
            return NaN;
        }
        if (!validPositive(nrated)) {
            warn("mechanicalLoss", "nrated must be positive");
            return NaN;
        }
        return PmechRated * Math.pow(n / nrated, 2.5);
    }

    /* ==================================================================
       5. STRAY LOAD LOSS

           Pstray = PstrayRated × (I / Irated)²

       I             = operating line current (A)
       Irated         = rated line current      (A)
       PstrayRated    = rated stray load loss   (W)
       Pstray         = operating stray loss    (W)

       Assumptions:
       - Stray load loss scales with I² (per IEC 60034-2-1, IEEE 112).
       - At no-load, Pstray -> 0.
       - Irated must be positive.

       Sanity: strayLoadLoss(130, 130, 200) = 200 W
       ================================================================== */
    function strayLoadLoss(I, Irated, PstrayRated) {
        if (!validNonNeg(I) || !validNonNeg(PstrayRated)) {
            warn("strayLoadLoss", "I and PstrayRated must be non-negative finite numbers");
            return NaN;
        }
        if (!validPositive(Irated)) {
            warn("strayLoadLoss", "Irated must be positive");
            return NaN;
        }
        var ratio = I / Irated;
        return PstrayRated * ratio * ratio;
    }

    /* ==================================================================
       6. TOTAL LOSSES (additive)

           Ptotal = Pcu + Pcore + Pmech + Pstray

       All inputs in W. Returns total losses in W.
       Any NaN input -> NaN output (caller checks with isFinite()).

       Sanity: totalLosses(1500, 1000, 500, 200) = 3200 W
       ================================================================== */
    function totalLosses(copperW, coreW, mechanicalW, strayW) {
        var parts = [copperW, coreW, mechanicalW, strayW];
        var names = ["copperW", "coreW", "mechanicalW", "strayW"];
        for (var i = 0; i < parts.length; i++) {
            if (!validFinite(parts[i])) {
                warn("totalLosses", names[i] + " must be a finite number; got " + parts[i]);
                return NaN;
            }
        }
        return copperW + coreW + mechanicalW + strayW;
    }

    /* ==================================================================
       7. STEADY-STATE TEMPERATURE RISE (single-node)

           Δθ_ss = P_total × G_th

       P_total = total losses dissipated       (W)
       G_th    = thermal conductance           (K/W  =  1 / R_th)
       Δθ_ss   = steady-state temp rise        (K)

       Assumptions:
       - Single-node lumped model.
       - G_th = Δθ_rated / P_rated  (derived in STEP 8 motorModel).
       - P_total and G_th must be non-negative.

       Sanity: temperatureRise(3200, 0.03) = 96 K
       ================================================================== */
    function temperatureRise(Ptotal, Gth) {
        if (!validNonNeg(Ptotal)) {
            warn("temperatureRise", "Ptotal must be non-negative finite; got " + Ptotal);
            return NaN;
        }
        if (!validNonNeg(Gth)) {
            warn("temperatureRise", "Gth must be non-negative finite; got " + Gth);
            return NaN;
        }
        return Ptotal * Gth;
    }

    /* ==================================================================
       8. FIRST-ORDER THERMAL RESPONSE

           θ(t) = θ_ss − (θ_ss − θ_0) × e^(−t/τ)

       θ_ss = steady-state rise   (K)
       θ_0  = initial rise        (K)
       t    = elapsed time        (s)
       τ    = thermal time const.  (s)
       θ(t) = rise at time t      (K)

       Validation checkpoints (built into the function, used by STEP 19):
         t = τ  -> 63.2 % of the gap from θ_0 to θ_ss
         t = 3τ -> 95.0 %
         t = 5τ -> 99.3 %

       Sanity: firstOrderThermal(100, 0, 100, 100) ≈ 63.212
       ================================================================== */
    function firstOrderThermal(thetaSS, theta0, t, tau) {
        if (!validFinite(thetaSS) || !validFinite(theta0)) {
            warn("firstOrderThermal", "thetaSS and theta0 must be finite");
            return NaN;
        }
        if (typeof t !== "number" || !isFinite(t) || t < 0) {
            warn("firstOrderThermal", "t must be a non-negative finite number; got " + t);
            return NaN;
        }
        if (!validPositive(tau)) {
            warn("firstOrderThermal", "tau must be a positive finite number; got " + tau);
            return NaN;
        }
        return thetaSS - (thetaSS - theta0) * Math.exp(-t / tau);
    }

    /* ==================================================================
       9. INSULATION LIFE (Montsinger 10-K half-life rule of thumb)

           L(T) = L_rated × 2^( (T_rated − T_actual) / 10 )

       T_actual = operating hot-spot temperature      (°C)
       T_rated  = rated hot-spot temp for the class    (°C)
       L_rated  = reference life at T_rated            (h)
       L(T)     = estimated life at T_actual           (h)

       Assumption: rule of thumb, NOT a validated life prediction.
       Used only as a comparative indicator.

       Sanity: insulationLife(165, 155, 20000) = 10000 h
       ================================================================== */
    function insulationLife(Tactual, Trated, Lrated) {
        if (!validFinite(Tactual) || !validFinite(Trated) || !validFinite(Lrated)) {
            warn("insulationLife", "all inputs must be finite");
            return NaN;
        }
        if (Lrated <= 0) {
            warn("insulationLife", "Lrated must be positive");
            return NaN;
        }
        var exponent = (Trated - Tactual) / 10;
        return Lrated * Math.pow(2, exponent);
    }

    /* ==================================================================
       10. HOT RESISTANCE (cold measurement corrected to operating temp)

           R_hot = R_cold × (T_cold + 234.5) / (T_hot + 234.5)

       R_cold = measured resistance         (Ω)
       T_cold = measurement temperature       (°C)
       T_hot  = extrapolation target temp     (°C)
       R_hot  = extrapolated resistance       (Ω)

       IEC 60034-1 copper extrapolation constant = 234.5.
       For aluminum, replace with 225.

       Sanity: hotResistance(0.100, 25, 100) ≈ 0.0776 Ω
       ================================================================== */
    function hotResistance(Rcold, Tcold, Thot) {
        if (!validPositive(Rcold)) {
            warn("hotResistance", "Rcold must be a positive finite number; got " + Rcold);
            return NaN;
        }
        if (!validFinite(Tcold) || !validFinite(Thot)) {
            warn("hotResistance", "Tcold and Thot must be finite");
            return NaN;
        }
        var denom = Thot + 234.5;
        if (denom === 0) {
            warn("hotResistance", "Thot + 234.5 = 0 (undefined)");
            return NaN;
        }
        return Rcold * (Tcold + 234.5) / denom;
    }

    /* ==================================================================
       11. COOLING EFFECTIVENESS (speed-dependent)

           η_cool = clamp( η_base × (n / n_rated)^p , η_floor , 1.0 )

       type      = 'TEFC' | 'ODP' | 'TENV' | 'FORCED'
       n         = operating speed      (rpm)
       n_rated   = rated speed           (rpm)
       η_cool    = cooling effectiveness (0..1)

       Exponents per cooling type:
         TEFC   p = 1.5  (shaft-mounted fan, dominant term)
         ODP    p = 1.0  (open, mixed convection)
         TENV   p = 0.0  (no fan, free convection -> η = 1.0)
         FORCED p = 0.0  (external blower, independent of motor speed)

       η_floor = 0.20 ensures a residual cooling at standstill.

       Sanity: coolingEffectiveness('TEFC', 740, 1480) ≈ 0.354
       ================================================================== */
    var COOLING_EXPONENT = {
        TEFC: 1.5,
        ODP: 1.0,
        TENV: 0.0,
        FORCED: 0.0
    };
    var COOLING_FLOOR = 0.20;

    function coolingEffectiveness(type, speedRatio) {
        if (typeof type !== "string") {
            warn("coolingEffectiveness", "type must be one of TEFC|ODP|TENV|FORCED");
            return NaN;
        }
        var t = type.toUpperCase();
        var p = COOLING_EXPONENT[t];
        if (p === undefined) {
            warn("coolingEffectiveness", "unknown cooling type: " + type);
            return NaN;
        }
        if (!validFinite(speedRatio) || speedRatio < 0) {
            warn("coolingEffectiveness", "speedRatio must be non-negative finite; got " + speedRatio);
            return NaN;
        }
        if (p === 0) {
            return 1.0;
        }
        var eta = Math.pow(speedRatio, p);
        if (eta < COOLING_FLOOR) { eta = COOLING_FLOOR; }
        if (eta > 1.0) { eta = 1.0; }
        return eta;
    }

    /* ==================================================================
       12. VOLTAGE IMBALANCE DERATING (NEMA MG-1 Part 14)

              { 1.00,                          u ≤ 1.0
           D = { 0.98 − 0.0438 × (u − 1.0),     1.0 < u ≤ 5.0
              { 0.75,                            u > 5.0

       u = voltage imbalance percentage (a number; 2 means 2%)
       D = derating factor (0..1)

       Sanity: voltageImbalanceDerating(3.0) = 0.8924
       ================================================================== */
    function voltageImbalanceDerating(imbalancePct) {
        if (!validNonNeg(imbalancePct)) {
            warn("voltageImbalanceDerating", "imbalancePct must be non-negative finite; got " + imbalancePct);
            return NaN;
        }
        if (imbalancePct <= 1.0) {
            return 1.0;
        }
        if (imbalancePct > 5.0) {
            return 0.75;
        }
        return 0.98 - 0.0438 * (imbalancePct - 1.0);
    }

    /* ==================================================================
       13. THERMAL UTILIZATION

           U = (Δθ_actual / Δθ_limit) × 100  (%)

       Δθ_actual = current temperature rise   (K)
       Δθ_limit  = permissible rise           (K)  — must be positive
       U         = utilization                (%)

       Sanity: thermalUtilization(80, 100) = 80
       ================================================================== */
    function thermalUtilization(riseActual, riseLimit) {
        if (!validNonNeg(riseActual)) {
            warn("thermalUtilization", "riseActual must be non-negative finite; got " + riseActual);
            return NaN;
        }
        if (!validPositive(riseLimit)) {
            warn("thermalUtilization", "riseLimit must be a positive finite number; got " + riseLimit);
            return NaN;
        }
        return (riseActual / riseLimit) * 100;
    }

    /* ------------------------------------------------------------------
       Public surface — part A + part B
       ------------------------------------------------------------------ */
    MTDT.physics = {
        copperLoss: copperLoss,
        coreLoss: coreLoss,
        mechanicalLoss: mechanicalLoss,
        strayLoadLoss: strayLoadLoss,
        totalLosses: totalLosses,
        temperatureRise: temperatureRise,
        firstOrderThermal: firstOrderThermal,
        insulationLife: insulationLife,
        hotResistance: hotResistance,
        coolingEffectiveness: coolingEffectiveness,
        voltageImbalanceDerating: voltageImbalanceDerating,
        thermalUtilization: thermalUtilization
    };

    console.info("[MTDT] physics.js loaded (parts A+B: losses + thermal response)");

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
