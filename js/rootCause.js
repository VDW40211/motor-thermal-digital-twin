/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/rootCause.js
   STEP 10 / PHASE 4 — Rule-based diagnostics.

   ROLE
   - Evaluate 10 diagnostic categories against the current operating point
     and thermal results.
   - Return a list of diagnoses, each with:
       { id, cause, likelihood, severity, evidence, recommendation, fires }
   - "likelihood" is a DIAGNOSTIC SCORE (0..100), NOT a statistically
     validated probability. The UI labels it "diagnostic likelihood".
   - Pure functions. No DOM access. No state writes.

   CATEGORIES (per spec):
     1. overload              — load > rated (with service factor)
     2. low-speed-cooling     — TEFC/ODP at n << n_rated
     3. voltage-deviation     — V > ±5% from V_rated
     4. oversized-motor       — load << rated (underutilization)
     5. undersized-motor      — load > rated * SF consistently
     6. mechanical-overload   — load-driven current much higher than expected
     7. high-ambient          — ambient > 40 °C
     8. voltage-imbalance     — voltage imbalance > 1%
     9. current-imbalance     — current imbalance inferred from voltage imbalance
    10. frequent-starts       — starts/hour above threshold
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    function validFinite(x)   { return typeof x === "number" && isFinite(x); }
    function validRange(x, lo, hi) {
        return validFinite(x) && x >= lo && x <= hi;
    }
    function warn(msg) { console.warn("[MTDT.rootCause] " + msg); }

    function severityFromScore(score) {
        if (score >= 70) { return "high"; }
        if (score >= 40) { return "medium"; }
        if (score >= 15) { return "low"; }
        return "none";
    }

    function estimateOperatingSpeed(motor, operatingData) {
        if (!motor || !operatingData) { return NaN; }
        var nR = Number(motor.ratedSpeedRpm);
        var fR = Number(motor.ratedFrequencyHz);
        var fOp = Number(operatingData.frequencyHz);
        var loadPct = Number(operatingData.loadPercent);
        if (!validPositive(nR) || !validPositive(fR) || !validPositive(fOp)) { return NaN; }
        if (!validRange(loadPct, 0, 300)) { loadPct = 100; }

        var syncSpeeds = [3000, 1500, 1000, 750, 600, 500, 428, 375];
        var nSyncR = syncSpeeds[0];
        for (var i = 0; i < syncSpeeds.length; i++) {
            if (syncSpeeds[i] > nR * 0.99) { nSyncR = syncSpeeds[i]; break; }
        }
        var slipRated = (nSyncR - nR) / nSyncR;
        if (slipRated <= 0) { slipRated = 0.03; }

        var slipOp = slipRated * (loadPct / 100);
        var nSyncOp = nSyncR * (fOp / fR);
        var nOp = nSyncOp * (1 - slipOp);
        return nOp;
    }

    function r_overload(ctx) {
        var load = ctx.op.loadPercent;
        var sf = ctx.motor.serviceFactor || 1.0;
        var ratedLoadInclSF = 100 * sf;

        if (!validRange(load, 0, 300)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var fires = load > 100;
        var score = 0;
        var evidence = [];

        if (load > ratedLoadInclSF) {
            score = 100;
            evidence.push("Load " + load + "% exceeds rated × SF (" + ratedLoadInclSF.toFixed(0) + "%)");
        } else if (load > 100) {
            score = 60 + Math.round((load - 100) / (ratedLoadInclSF - 100) * 30);
            evidence.push("Load " + load + "% above rated but within SF");
        } else {
            score = Math.max(0, 15 - (100 - load) / 4);
            if (load > 90) { evidence.push("Load " + load + "% approaching rated"); }
        }

        var rec = (load > ratedLoadInclSF)
            ? "Reduce load below rated × SF, or verify motor sizing. Continued operation above SF will accelerate insulation aging."
            : (load > 100)
                ? "Reduce load to rated or below. Operating above rated but within SF is acceptable for short periods only."
                : "Operation within rated load. No action required.";

        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_lowSpeedCooling(ctx) {
        var nOp = ctx.operatingSpeed;
        var nR = ctx.motor.ratedSpeedRpm;
        var cooling = ctx.coolingType;

        if (!validFinite(nOp) || !validFinite(nR) || nOp <= 0 || nR <= 0) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }
        if (cooling !== "TEFC" && cooling !== "ODP") {
            return { fires: false, likelihood: 0, evidence: ["Cooling type " + cooling + " is not speed-dependent"], recommendation: "" };
        }

        var ratio = nOp / nR;
        var fires = ratio < 0.7;
        var score = 0;
        var evidence = [];

        if (ratio < 0.3) { score = 90; evidence.push("Speed ratio " + ratio.toFixed(2) + " — severe cooling degradation"); }
        else if (ratio < 0.5) { score = 70; evidence.push("Speed ratio " + ratio.toFixed(2) + " — significant cooling loss"); }
        else if (ratio < 0.7) { score = 40; evidence.push("Speed ratio " + ratio.toFixed(2) + " — moderate cooling reduction"); }
        else { score = Math.max(0, 10 - (ratio - 0.7) * 30); }

        var rec = "Consider forced (external blower) ventilation, or derate the motor per the manufacturer's speed-thermal curve. Cooling effectiveness drops approximately with speed^1.5 for " + cooling + ".";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_voltageDeviation(ctx) {
        var vOp = ctx.op.lineVoltageV;
        var vR = ctx.motor.ratedVoltageV;
        if (!validFinite(vOp) || !validFinite(vR) || vOp <= 0 || vR <= 0) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var devPct = Math.abs(vOp - vR) / vR * 100;
        var fires = devPct > 5;
        var score = 0;
        var evidence = [];

        if (devPct > 10) { score = 90; }
        else if (devPct > 5) { score = 60; }
        else if (devPct > 3) { score = 25; }
        else { score = Math.max(0, 10 - devPct * 3); }

        evidence.push("Line voltage " + vOp + " V vs rated " + vR + " V — deviation " + devPct.toFixed(1) + "%");
        var rec = (devPct > 5)
            ? "Bring supply voltage within ±5% of rated. Large deviations cause overfluxing (overvoltage) or increased current (undervoltage), both raising losses."
            : "Voltage within ±5% of rated — no action required.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_oversized(ctx) {
        var load = ctx.op.loadPercent;
        if (!validRange(load, 0, 300)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var fires = load < 50;
        var score = 0;
        var evidence = [];

        if (load < 25) { score = 70; evidence.push("Load " + load + "% — motor significantly oversized for the application"); }
        else if (load < 50) { score = 40; evidence.push("Load " + load + "% — motor oversized (low load factor)"); }
        else if (load < 65) { score = 15; evidence.push("Load " + load + "% — motor lightly loaded"); }
        else { score = 0; }

        var rec = "Operating well below rated load reduces efficiency (fixed losses dominate at low load). Consider a smaller motor or a VFD with energy optimization. The thermal impact is usually POSITIVE — cooler operation — but efficiency suffers.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_undersized(ctx) {
        var load = ctx.op.loadPercent;
        var sf = ctx.motor.serviceFactor || 1.0;
        var ratedLoadInclSF = 100 * sf;
        if (!validRange(load, 0, 300)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var fires = load > ratedLoadInclSF;
        var score = 0;
        var evidence = [];

        if (load > ratedLoadInclSF * 1.2) { score = 90; evidence.push("Load " + load + "% >> rated × SF (" + ratedLoadInclSF.toFixed(0) + "%) — motor clearly undersized"); }
        else if (load > ratedLoadInclSF) { score = 70; evidence.push("Load " + load + "% > rated × SF (" + ratedLoadInclSF.toFixed(0) + "%) — motor undersized"); }
        else if (load > 100) { score = 30; evidence.push("Load " + load + "% above rated — verify sizing for continuous operation"); }
        else { score = 0; }

        var rec = "Verify the motor's rated power matches the application's continuous load requirement. Operating above rated × SF continuously will cause chronic overheating.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_mechanicalOverload(ctx) {
        var load = ctx.op.loadPercent;
        var sf = ctx.motor.serviceFactor || 1.0;
        if (!validRange(load, 0, 300)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var threshold = Math.max(125, 110 * sf);
        var fires = load > threshold;
        var score = 0;
        var evidence = [];

        if (load > 150) { score = 90; evidence.push("Load " + load + "% — significant mechanical overload likely (process issue, jam, friction)"); }
        else if (load > threshold) { score = 70; evidence.push("Load " + load + "% above " + threshold + "% — possible mechanical overload"); }
        else if (load > 110) { score = 30; evidence.push("Load " + load + "% above rated — verify process conditions"); }
        else { score = 0; }

        var rec = "Investigate the driven load: bearing friction, seal drag, process fluid density, blocked discharge, or impeller wear can all push load above the design point. Continued overload will trip thermal protection and reduce insulation life.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_highAmbient(ctx) {
        var amb = ctx.op.ambientTempC;
        if (!validFinite(amb)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var fires = amb > 40;
        var score = 0;
        var evidence = [];

        if (amb > 55) { score = 90; evidence.push("Ambient " + amb + " °C — significantly above 40 °C reference"); }
        else if (amb > 45) { score = 70; evidence.push("Ambient " + amb + " °C — above 40 °C reference"); }
        else if (amb > 40) { score = 40; evidence.push("Ambient " + amb + " °C — marginally above 40 °C"); }
        else if (amb < 0) { score = 15; evidence.push("Ambient " + amb + " °C — below 0 °C, verify bearing lubrication"); }
        else { score = 0; }

        var rec = (amb > 40)
            ? "Derate the motor's permissible rise by (ambient − 40) K, or improve enclosure ventilation. Each 10 K above 40 °C reduces the available thermal margin by the same amount."
            : (amb < 0)
                ? "Low ambient increases thermal margin; verify bearing lubricant is rated for the operating temperature."
                : "Ambient within reference range. No action required.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_voltageImbalance(ctx) {
        var u = ctx.op.voltageImbalancePct;
        if (!validRange(u, 0, 10)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var fires = u > 1;
        var score = 0;
        var evidence = [];

        if (u > 5) { score = 90; evidence.push("Voltage imbalance " + u + "% — severe, motor protection may trip"); }
        else if (u > 3) { score = 75; evidence.push("Voltage imbalance " + u + "% — significant, derating required"); }
        else if (u > 1) { score = 45; evidence.push("Voltage imbalance " + u + "% — mild derating per NEMA MG-1"); }
        else { score = 0; }

        var rec = (u > 1)
            ? "Investigate phase loading and transformer taps. Voltage imbalance causes disproportionate current imbalance (≈6–10×) and increases rotor heating. NEMA MG-1 derating applies above 1%."
            : "Voltage imbalance within 1% — no action required.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_currentImbalance(ctx) {
        var u = ctx.op.voltageImbalancePct;
        if (!validRange(u, 0, 10)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var estCurrentImbalance = u * 8;
        var fires = u > 1;
        var score = 0;
        var evidence = [];

        if (u > 5) { score = 85; evidence.push("Estimated current imbalance ~" + estCurrentImbalance.toFixed(0) + "% (≈8× voltage imbalance " + u + "%)"); }
        else if (u > 3) { score = 65; evidence.push("Estimated current imbalance ~" + estCurrentImbalance.toFixed(0) + "%"); }
        else if (u > 1) { score = 40; evidence.push("Estimated current imbalance ~" + estCurrentImbalance.toFixed(0) + "%"); }
        else { score = 0; }

        var rec = (u > 1)
            ? "Verify phase currents with a clamp meter. Current imbalance causes negative-sequence heating in the rotor and is the primary thermal consequence of voltage imbalance."
            : "Voltage imbalance is low — current imbalance is presumed low. No action required.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    function r_frequentStarts(ctx) {
        var sph = ctx.op.startsPerHour;
        if (!validRange(sph, 0, 60)) {
            return { fires: false, likelihood: 0, evidence: [], recommendation: "" };
        }

        var pKW = ctx.motor.ratedPowerKW;
        var threshold = 6;
        if (pKW > 200) { threshold = 2; }
        else if (pKW > 50) { threshold = 4; }
        else if (pKW > 10) { threshold = 6; }
        else { threshold = 10; }

        var fires = sph > threshold;
        var score = 0;
        var evidence = [];

        if (sph > threshold * 2) { score = 90; evidence.push("Starts/hour " + sph + " >> threshold " + threshold + " for " + pKW + " kW motor"); }
        else if (sph > threshold) { score = 60; evidence.push("Starts/hour " + sph + " > threshold " + threshold); }
        else { score = 0; }

        var rec = (sph > threshold)
            ? "Reduce starting frequency, or specify a motor rated for high-inertia / frequent-start duty (e.g. NEMA Design C/D, or special rotor). Each direct-on-line start produces 5–8× rated current for several seconds, depositing significant heat in the rotor and stator."
            : "Starting frequency within limits — no action required.";
        return { fires: fires, likelihood: Math.round(score), evidence: evidence, recommendation: rec };
    }

    var RULES = [
        { id: "overload",              cause: "Overload",                  evaluate: r_overload },
        { id: "low-speed-cooling",     cause: "Low-Speed Cooling",         evaluate: r_lowSpeedCooling },
        { id: "voltage-deviation",     cause: "Voltage Deviation",         evaluate: r_voltageDeviation },
        { id: "oversized-motor",       cause: "Oversized Motor",           evaluate: r_oversized },
        { id: "undersized-motor",      cause: "Undersized Motor",          evaluate: r_undersized },
        { id: "mechanical-overload",    cause: "Mechanical Overload",       evaluate: r_mechanicalOverload },
        { id: "high-ambient",          cause: "High Ambient Temperature",  evaluate: r_highAmbient },
        { id: "voltage-imbalance",     cause: "Voltage Imbalance",         evaluate: r_voltageImbalance },
        { id: "current-imbalance",     cause: "Current Imbalance",         evaluate: r_currentImbalance },
        { id: "frequent-starts",       cause: "Frequent Starts",           evaluate: r_frequentStarts }
    ];

    function analyzeDiagnostics(ctx, includeAll) {
        if (!ctx || !ctx.motor || !ctx.op || !ctx.derived) {
            warn("analyzeDiagnostics: missing required context (motor/op/derived)");
            return [];
        }

        var results = [];
        for (var i = 0; i < RULES.length; i++) {
            var rule = RULES[i];
            var r = rule.evaluate(ctx);
            if (!r) { continue; }

            var severity = severityFromScore(r.likelihood);
            if (!r.fires && !includeAll && severity === "none") { continue; }

            results.push({
                id: rule.id,
                cause: rule.cause,
                likelihood: r.likelihood,
                severity: severity,
                fires: !!r.fires,
                evidence: r.evidence || [],
                recommendation: r.recommendation || ""
            });
        }

        results.sort(function (a, b) {
            if (a.fires !== b.fires) { return a.fires ? -1 : 1; }
            return b.likelihood - a.likelihood;
        });

        return results;
    }

    function summarize(diagnoses) {
        if (!diagnoses || diagnoses.length === 0) {
            return { count: 0, highCount: 0, topCause: null, status: "normal" };
        }
        var highCount = 0;
        var topCause = null;
        var topScore = -1;
        for (var i = 0; i < diagnoses.length; i++) {
            var d = diagnoses[i];
            if (!d.fires) { continue; }
            if (d.severity === "high") { highCount += 1; }
            if (d.likelihood > topScore) {
                topScore = d.likelihood;
                topCause = d.cause;
            }
        }
        var status = highCount > 0 ? "alarm" : (topCause ? "caution" : "normal");
        return {
            count: diagnoses.filter(function (d) { return d.fires; }).length,
            highCount: highCount,
            topCause: topCause,
            status: status
        };
    }

    MTDT.rootCause = {
        analyze: analyzeDiagnostics,
        summarize: summarize,
        estimateOperatingSpeed: estimateOperatingSpeed,
        RULES: RULES,
        severityFromScore: severityFromScore
    };

    console.info("[MTDT] rootCause.js loaded (10 diagnostic categories, rule-based)");

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
