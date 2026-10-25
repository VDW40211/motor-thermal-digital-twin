/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/motorModel.js
   STEP 7 / PHASE 3 — Motor parameter estimation.

   ROLE
   - Convert nameplate + assumptions into motor-specific thermal parameters:
       rated losses (segregated)
       equivalent stator resistance (estimated or measured)
       thermal time constant
       thermal conductance
       insulation limits
       rated temperature rise
       service-factor-adjusted rated values
       operating current estimate (load -> current)
   - Pure engineering functions. No DOM access. No state writes.
   - Depends only on MTDT.physics (loaded earlier).

   PROVENANCE CONVENTIONS (used by confidence.js later):
   - segregateLosses              -> Assumed (default shares)
   - estimateResistance           -> Estimated
   - estimateThermalTimeConstant  -> Typical
   - estimateThermalConductance   -> Derived (from rated point)
   - getInsulationLimit           -> Measured  (standard, fixed by class)
   - calculateRatedTempRise       -> Derived  (from class + ambient + hot-spot)
   - applyServiceFactor           -> Calculated
   - estimateCurrent              -> Estimated (linear model, Typical no-load)
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};
    var physics = MTDT.physics;

    if (!physics) {
        console.error("[MTDT.motorModel] FATAL: MTDT.physics not loaded. Check script order in index.html.");
        return;
    }

    /* ------------------------------------------------------------------
       1. Validation helpers (mirror physics.js conventions)
       ------------------------------------------------------------------ */
    function validFinite(x)    { return typeof x === "number" && isFinite(x); }
    function validNonNeg(x)    { return validFinite(x) && x >= 0; }
    function validPositive(x)  { return validFinite(x) && x > 0; }
    function validRange(x, lo, hi) {
        return validFinite(x) && x >= lo && x <= hi;
    }
    function warn(fnName, msg) { console.warn("[MTDT.motorModel." + fnName + "] " + msg); }

    /* ==================================================================
       2. LOSS SEGREGATION (rated operating point)

           P_loss_total = P_rated_out × (1/η − 1)
           P_cu,rated   = P_loss_total × s_cu
           P_core,rated = P_loss_total × s_core
           P_mech,rated = P_loss_total × s_mech
           P_stray,rated = P_loss_total × s_stray

       P_rated_out = rated output power (W)
       eta         = full-load efficiency (decimal, 0..1, exclusive of 0 and 1)
       shares      = { copper, core, mech, stray } (decimals, sum = 1)
                     Defaults: 0.60, 0.20, 0.10, 0.10

       Returns: { copperW, coreW, mechanicalW, strayW, totalW, perUnit: {...} }

       Sanity: segregateLosses(75000, 0.93) ≈ { totalW: 5645, copperW: 3387, ... }
       ================================================================== */
    function segregateLosses(ratedPowerW, efficiency, shares) {
        if (!validPositive(ratedPowerW)) {
            warn("segregateLosses", "ratedPowerW must be positive; got " + ratedPowerW);
            return null;
        }
        if (!validRange(efficiency, 0.05, 0.999)) {
            warn("segregateLosses", "efficiency must be in (0.05, 0.999); got " + efficiency);
            return null;
        }

        shares = shares || { copper: 0.60, core: 0.20, mech: 0.10, stray: 0.10 };
        var sCu   = Number(shares.copper);
        var sCore = Number(shares.core);
        var sMech = Number(shares.mech);
        var sStray = Number(shares.stray);
        if (![sCu, sCore, sMech, sStray].every(validNonNeg)) {
            warn("segregateLosses", "all shares must be non-negative finite numbers");
            return null;
        }
        var sum = sCu + sCore + sMech + sStray;
        if (Math.abs(sum - 1.0) > 0.001) {
            warn("segregateLosses", "shares must total 1.000; got " + sum.toFixed(4));
            return null;
        }

        var totalW = ratedPowerW * (1 / efficiency - 1);
        return {
            copperW:     totalW * sCu,
            coreW:       totalW * sCore,
            mechanicalW: totalW * sMech,
            strayW:      totalW * sStray,
            totalW:      totalW,
            perUnit: { copper: sCu, core: sCore, mech: sMech, stray: sStray }
        };
    }

    /* ==================================================================
       3. STATOR RESISTANCE ESTIMATION (from rated copper loss)

           R = P_cu,rated / (3 × I_rated²)

       Inverts Pcu = 3·I²·R at the rated operating point.

       PcuRated = rated copper loss   (W)
       Irated   = rated line current   (A)  — must be positive
       R        = per-phase equiv. resistance (Ω) — at rated full-load temp

       Sanity: estimateResistance(3387, 130) ≈ 0.0668 Ω
       ================================================================== */
    function estimateResistance(PcuRated, Irated) {
        if (!validNonNeg(PcuRated)) {
            warn("estimateResistance", "PcuRated must be non-negative finite; got " + PcuRated);
            return NaN;
        }
        if (!validPositive(Irated)) {
            warn("estimateResistance", "Irated must be positive; got " + Irated);
            return NaN;
        }
        return PcuRated / (3 * Irated * Irated);
    }

    /* ==================================================================
       4. THERMAL TIME CONSTANT (empirical, Typical)

           τ = 1200 × √(P_rated_kW)   seconds

       P_rated_kW = rated output power (kW)  — must be positive
       τ          = thermal time constant (s)

       Assumption: typical TEFC induction machine, 1..500 kW range.
       Real values vary by ±50%.

       Sanity: estimateThermalTimeConstant(75) ≈ 10,392 s ≈ 173 min
       ================================================================== */
    function estimateThermalTimeConstant(ratedPowerKW) {
        if (!validPositive(ratedPowerKW)) {
            warn("estimateThermalTimeConstant", "ratedPowerKW must be positive; got " + ratedPowerKW);
            return NaN;
        }
        return 1200 * Math.sqrt(ratedPowerKW);
    }

    /* ==================================================================
       5. THERMAL CONDUCTANCE (per-unit-loss temperature rise)

           G_th = Δθ_rated / P_loss_total_rated

       Δθ_rated              = rated temperature rise   (K)
       P_loss_total_rated    = total rated losses        (W)  — must be positive
       G_th                  = thermal conductance       (K/W)

       Sanity: estimateThermalConductance(80, 5645) ≈ 0.01417 K/W
       ================================================================== */
    function estimateThermalConductance(ratedRiseK, ratedLossesW) {
        if (!validNonNeg(ratedRiseK)) {
            warn("estimateThermalConductance", "ratedRiseK must be non-negative finite; got " + ratedRiseK);
            return NaN;
        }
        if (!validPositive(ratedLossesW)) {
            warn("estimateThermalConductance", "ratedLossesW must be positive; got " + ratedLossesW);
            return NaN;
        }
        return ratedRiseK / ratedLossesW;
    }

    /* ==================================================================
       6. INSULATION CLASS LIMIT (IEC 60034-1 / NEMA MG-1)

       Class       A    E    B    F    H
       T_max (°C) 105  120  130  155  180

       Sanity: getInsulationLimit('F') = 155
       ================================================================== */
    var INSULATION_LIMITS = {
        A: 105, E: 120, B: 130, F: 155, H: 180
    };

    function getInsulationLimit(insClass) {
        if (typeof insClass !== "string") {
            warn("getInsulationLimit", "insClass must be a string; got " + insClass);
            return NaN;
        }
        var v = INSULATION_LIMITS[insClass.toUpperCase()];
        if (v === undefined) {
            warn("getInsulationLimit", "unknown insulation class: " + insClass);
            return NaN;
        }
        return v;
    }

    /* ==================================================================
       7. RATED TEMPERATURE RISE (per insulation class, 40 °C ambient)

           Δθ_rated = T_class_max − 40 − Δθ_hot_spot_allowance

       T_class_max              = absolute class limit              (°C)
       Δθ_hot_spot_allowance   = hot-spot allowance above average    (K, default 10)
       Δθ_rated                  = rated average winding temperature rise (K)

       Assumption: IEC 60034-1 methodology, 40 °C reference ambient.

       Sanity: calculateRatedTempRise('F', 10) = 105 K
       ================================================================== */
    function calculateRatedTempRise(insClass, hotSpotAllowanceK) {
        var Tmax = getInsulationLimit(insClass);
        if (!validFinite(Tmax)) { return NaN; }

        if (hotSpotAllowanceK === undefined || hotSpotAllowanceK === null) {
            hotSpotAllowanceK = 10;
        }
        if (!validNonNeg(hotSpotAllowanceK)) {
            warn("calculateRatedTempRise", "hotSpotAllowanceK must be non-negative finite; got " + hotSpotAllowanceK);
            return NaN;
        }
        return Tmax - 40 - hotSpotAllowanceK;
    }

    /* ==================================================================
       8. SERVICE FACTOR APPLICATION

           rated_with_SF = rated_value × service_factor

       ratedValue    = nameplate rated value (any unit)
       serviceFactor = service factor (typically 1.0 or 1.15)

       Notes:
       - For LOAD / CURRENT / POWER: use the nameplate SF.
       - For RISE LIMITS: ALWAYS pass serviceFactor = 1.0 — the rise limit
         is set by the insulation class, not the SF.

       Sanity: applyServiceFactor(130, 1.15) = 149.5
       ================================================================== */
    function applyServiceFactor(ratedValue, serviceFactor) {
        if (!validFinite(ratedValue)) {
            warn("applyServiceFactor", "ratedValue must be finite; got " + ratedValue);
            return NaN;
        }
        if (!validRange(serviceFactor, 1.0, 1.5)) {
            warn("applyServiceFactor", "serviceFactor must be in [1.0, 1.5]; got " + serviceFactor);
            return NaN;
        }
        return ratedValue * serviceFactor;
    }

    /* ==================================================================
       9. ESTIMATE OPERATING CURRENT FROM LOAD (linear model)

           I(L) = I_no_load + (I_rated − I_no_load) × L
           where I_no_load = I_rated × (noLoadCurrentPct / 100)

       L                = load fraction (0..1+)
       Irated            = rated line current           (A)  — must be positive
       noLoadCurrentPct = no-load current as % of rated (typical: 30)

       Returns: estimated line current (A)

       Sanity: estimateCurrent(0.5, 130, 30) = 84.5 A
       ================================================================== */
    function estimateCurrent(loadFraction, Irated, noLoadCurrentPct) {
        if (!validNonNeg(loadFraction)) {
            warn("estimateCurrent", "loadFraction must be non-negative finite; got " + loadFraction);
            return NaN;
        }
        if (!validPositive(Irated)) {
            warn("estimateCurrent", "Irated must be positive; got " + Irated);
            return NaN;
        }
        if (!validRange(noLoadCurrentPct, 1, 90)) {
            warn("estimateCurrent", "noLoadCurrentPct must be in [1, 90]; got " + noLoadCurrentPct);
            return NaN;
        }
        var InoLoad = Irated * (noLoadCurrentPct / 100);
        return InoLoad + (Irated - InoLoad) * loadFraction;
    }

    /* ------------------------------------------------------------------
       Public surface
       ------------------------------------------------------------------ */
    MTDT.motorModel = {
        segregateLosses: segregateLosses,
        estimateResistance: estimateResistance,
        estimateThermalTimeConstant: estimateThermalTimeConstant,
        estimateThermalConductance: estimateThermalConductance,
        getInsulationLimit: getInsulationLimit,
        calculateRatedTempRise: calculateRatedTempRise,
        applyServiceFactor: applyServiceFactor,
        estimateCurrent: estimateCurrent,
        INSULATION_LIMITS: INSULATION_LIMITS
    };

    console.info("[MTDT] motorModel.js loaded (loss segregation / resistance / τ / G_th / limits / SF / current)");

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
