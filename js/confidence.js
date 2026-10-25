/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/confidence.js
   STEP 9 / PHASE 4 — Confidence engine.

   ROLE
   - Compute a transparent, rule-based confidence score for the thermal
     estimate. Reflects input quality, not statistical validation.
   - Base 65%, cap 95%. NEVER 100% — this is a model, not measurement.
   - Returns { score, factors, missing, explanation } so the UI can show
     exactly why the score is what it is.

   PHILOSOPHY
   - Every bonus/penalty is declared in code, not hidden.
   - "Estimated" vs "Calculated" vs "Measured" provenance is preserved.
   - The engine refuses to claim certainty it doesn't have.

   Pure functions. No DOM access. No state writes.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    var BASE = 65;
    var CAP  = 95;
    var FLOOR = BASE;

    function validFinite(x)   { return typeof x === "number" && isFinite(x); }
    function validRange(x, lo, hi) {
        return validFinite(x) && x >= lo && x <= hi;
    }
    function warn(msg) { console.warn("[MTDT.confidence] " + msg); }

    function computeConfidence(motor, operatingData) {
        if (!motor || typeof motor !== "object") {
            warn("motor must be an object");
            return null;
        }
        if (!operatingData || typeof operatingData !== "object") {
            warn("operatingData must be an object");
            return null;
        }

        var factors = [];
        var missing = [];
        var score = BASE;

        function add(id, label, delta, applies) {
            factors.push({ id: id, label: label, delta: delta, applied: !!applies });
            if (applies) { score += delta; }
        }

        function noteMissing(text) { missing.push(text); }

        var pKW = Number(motor.ratedPowerKW);
        if (!validRange(pKW, 0.1, 10000)) {
            add("powerMissing", "Rated power missing or out of range", -5, true);
            noteMissing("Rated power");
        } else {
            add("powerPresent", "Rated power provided", 0, true);
            if (pKW < 1 || pKW > 1000) {
                add("powerOutOfRange", "Rated power outside 1–1000 kW typical range", -3, true);
                noteMissing("Power within validated range (1–1000 kW)");
            }
        }

        var vR = Number(motor.ratedVoltageV);
        if (!validRange(vR, 50, 15000)) {
            add("voltageMissing", "Rated voltage missing or out of range", -5, true);
            noteMissing("Rated voltage");
        }

        var iR = Number(motor.ratedCurrentA);
        if (!validRange(iR, 0.1, 10000)) {
            add("currentMissing", "Rated current missing or out of range", -5, true);
            noteMissing("Rated current");
        }

        var fR = Number(motor.ratedFrequencyHz);
        if (!validRange(fR, 1, 400)) {
            add("freqMissing", "Rated frequency missing or out of range", -3, true);
            noteMissing("Rated frequency");
        }

        var nR = Number(motor.ratedSpeedRpm);
        if (validRange(nR, 1, 60000)) {
            add("speedPresent", "Rated speed provided", 5, true);
        } else {
            noteMissing("Rated speed");
        }

        var eff = Number(motor.efficiencyPercent);
        if (validRange(eff, 10, 99.9)) {
            add("efficiencyPresent", "Efficiency provided", 5, true);
        } else {
            add("efficiencyMissing", "Efficiency missing", -5, true);
            noteMissing("Efficiency");
        }

        var sf = Number(motor.serviceFactor);
        if (validRange(sf, 1.0, 1.5)) {
            add("serviceFactorPresent", "Service factor provided", 5, true);
        } else {
            noteMissing("Service factor");
        }

        var ic = motor.insulationClass;
        if (typeof ic === "string" && ic.length > 0) {
            add("insulationPresent", "Insulation class provided", 5, true);
        } else {
            noteMissing("Insulation class");
        }

        var ct = motor.coolingType;
        if (typeof ct === "string" && ct.length > 0) {
            add("coolingPresent", "Cooling type provided", 5, true);
        } else {
            noteMissing("Cooling type");
        }

        var fOp = Number(operatingData.frequencyHz);
        if (validRange(fOp, 5, 120) && validRange(fR, 1, 400)) {
            var fRatio = fOp / fR;
            if (fRatio >= 0.9 && fRatio <= 1.1) {
                add("freqNearRated", "Operating frequency within ±10% of rated", 3, true);
            } else {
                add("freqOffRated", "Operating frequency > ±10% from rated (VFD operation)", -2, true);
                noteMissing("Operating frequency within rated range");
            }
        }

        var u = Number(operatingData.voltageImbalancePct);
        if (validRange(u, 0, 10)) {
            if (u < 1.0) {
                add("lowImbalance", "Voltage imbalance < 1%", 4, true);
            } else if (u <= 3.0) {
                add("moderateImbalance", "Voltage imbalance 1–3% (mild derating)", 0, true);
                noteMissing("Low voltage imbalance (< 1%)");
            } else {
                add("highImbalance", "Voltage imbalance > 3% (significant derating)", -5, true);
                noteMissing("Low voltage imbalance (< 1%)");
            }
        }

        var rt = Number(operatingData.runtimeHours);
        if (validRange(rt, 0, 8760)) {
            if (rt >= 1) {
                add("runtimeAdequate", "Runtime ≥ 1 h (steady-state assumption reasonable)", 2, true);
            } else {
                add("runtimeShort", "Runtime < 1 h (transient regime)", -3, true);
                noteMissing("Adequate runtime (≥ 1 h) for steady-state");
            }
        }

        if (operatingData.currentIsEstimated) {
            add("currentEstimated", "Current estimated from load (Typical no-load model)", -5, true);
            noteMissing("Measured line current");
        } else if (validRange(Number(operatingData.lineCurrentA), 0.1, 10000)) {
            add("currentMeasured", "Line current measured directly", 8, true);
        } else {
            add("currentMissing", "Line current neither estimated nor measured", -5, true);
            noteMissing("Line current (any source)");
        }

        var measured = motor.measured;
        if (measured && typeof measured === "object") {
            var r = Number(measured.resistanceOhm);
            var t = Number(measured.measuredAtC);
            if (validRange(r, 0.0001, 100)) {
                add("measuredResistance", "Measured stator resistance provided", 10, true);
                if (validRange(t, -50, 250)) {
                    add("measuredResistanceTemp", "Resistance measurement temperature provided", 5, true);
                } else {
                    noteMissing("Resistance measurement temperature");
                }
            } else {
                noteMissing("Valid measured resistance");
            }
        } else {
            add("noMeasuredResistance", "No measured resistance (resistance estimated)", -5, true);
            noteMissing("Measured stator resistance");
        }

        if (score < FLOOR) { score = FLOOR; }
        if (score > CAP) { score = CAP; }
        score = Math.round(score);

        var appliedBonuses = factors.filter(function (f) { return f.applied && f.delta > 0; });
        var appliedPenalties = factors.filter(function (f) { return f.applied && f.delta < 0; });

        var explanation = "Base confidence " + BASE + "% (model estimate, not measurement). ";
        if (appliedBonuses.length > 0) {
            explanation += "Bonuses applied: " +
                appliedBonuses.map(function (f) { return f.label + " (+" + f.delta + ")"; }).join("; ") + ". ";
        }
        if (appliedPenalties.length > 0) {
            explanation += "Penalties applied: " +
                appliedPenalties.map(function (f) { return f.label + " (" + f.delta + ")"; }).join("; ") + ". ";
        }
        if (missing.length > 0) {
            explanation += "Missing or weak: " + missing.join("; ") + ". ";
        }
        explanation += "Score clamped to [" + FLOOR + ", " + CAP + "] — never 100% for a model.";

        return {
            score: score,
            factors: factors,
            missing: missing,
            explanation: explanation,
            base: BASE,
            cap: CAP,
            floor: FLOOR
        };
    }

    function scoreToStatus(score) {
        if (!validFinite(score)) { return "standby"; }
        if (score >= 85) { return "normal"; }
        if (score >= 70) { return "caution"; }
        return "alarm";
    }

    function scoreToProvenance(score) {
        if (!validFinite(score)) { return "Estimated"; }
        if (score >= 85) { return "Calculated"; }
        return "Estimated";
    }

    MTDT.confidence = {
        compute: computeConfidence,
        scoreToStatus: scoreToStatus,
        scoreToProvenance: scoreToProvenance,
        BASE: BASE,
        CAP: CAP,
        FLOOR: FLOOR
    };

    console.info("[MTDT] confidence.js loaded (rule-based scoring, base " + BASE + " / cap " + CAP + ")");

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
