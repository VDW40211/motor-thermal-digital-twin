/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/reports.js
   STEP 16 / PHASE 10 — Print-to-PDF report.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    function validFinite(x) { return typeof x === "number" && isFinite(x); }
    function fmt(x, dec) {
        if (x === null || x === undefined || !validFinite(x)) { return "—"; }
        return Number(x).toFixed(dec === undefined ? 1 : dec);
    }
    function esc(s) {
        if (s === null || s === undefined) { return ""; }
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    var ASSUMPTIONS = [
        "Loss segregation: copper 60%, core 20%, mechanical 10%, stray 10% of total rated losses (editable, labelled Assumed).",
        "Hot-spot allowance: 10 K above average winding temperature (IEC 60034-1 methodology, editable).",
        "Core loss scaling: ~ (V/V_rated)² × (f/f_rated)^1.5 (Steinmetz, no saturation).",
        "Friction & windage scaling: ~ (n/n_rated)^2.5 (bearing ~n¹, fan ~n³ compromise).",
        "TEFC cooling effectiveness: ~ (n/n_rated)^1.5, floored at 0.20 at standstill.",
        "ODP cooling: ~ (n/n_rated)^1.0; TENV and FORCED: η = 1.0 (no speed dependency).",
        "Voltage imbalance derating: piecewise-linear per NEMA MG-1 Part 14.",
        "Insulation life: '10 K rise ≈ half life' Montsinger rule of thumb — not a validated life prediction.",
        "Stator resistance (when not measured): estimated by inverting P_cu = 3·I²·R at the rated point.",
        "Operating current (when not measured): linear interpolation from no-load (30% typical) to rated.",
        "Operating speed: slip-based approximation (slip scales with load).",
        "Frame temperature: 60% of winding rise + ambient (typical TEFC, editable factor).",
        "Thermal time constant: τ = 1200 × √(P_kW) seconds (empirical TEFC, ±50%)."
    ];

    var LIMITATIONS = [
        "Single-node (first-order) lumped thermal model; real machines exhibit multiple thermal time constants.",
        "Winding and frame temperatures are not separately modeled in v1 (frame is derived as 60% of winding rise).",
        "VFD harmonic losses and inrush/startup heating are not modeled.",
        "Duty cycles are approximated as continuous (S1); cyclic duty thermal accumulation is not modeled.",
        "Altitude above 1000 m is not corrected (air density reduction would worsen cooling).",
        "Frequent-start detection is rule-based only; thermal memory of start events is not accumulated.",
        "Stator and rotor thermal masses are not separated; rotor copper loss is absorbed into efficiency.",
        "Confidence score is a rule-based indicator, not a statistically validated uncertainty.",
        "Diagnostic likelihoods are rule-based scores, not statistically validated probabilities.",
        "Real measured temperature (RTD/thermocouple) is required for actual winding temperature; this app provides an estimate only."
    ];

    var DISCLAIMER = "This application provides an engineering estimate and is not a substitute " +
                     "for physical temperature measurement or OEM thermal protection.";

    function buildHeader(motor) {
        var now = new Date();
        var ts = now.toLocaleString();
        var designation = (motor && motor.designation) ? motor.designation : "(unnamed motor)";
        return '' +
            '<h1>Motor Thermal Digital Twin — Engineering Report</h1>' +
            '<p><strong>Motor:</strong> ' + esc(designation) + ' &nbsp; ' +
               '<strong>Generated:</strong> ' + esc(ts) + ' &nbsp; ' +
               '<strong>Version:</strong> ' + esc(MTDT.VERSION || "0.1.0") + '</p>' +
            '<blockquote style="border-left:3px solid #b3261e;background:#f6e3df;' +
            'padding:8px 14px;margin:10px 0;font-style:italic;">' +
            esc(DISCLAIMER) + '</blockquote>';
    }

    function row(label, value, prov) {
        return '<tr><td>' + label + '</td><td>' + value + '</td><td>' + esc(prov || "") + '</td></tr>';
    }

    function buildMotorDetails(motor) {
        if (!motor) { return '<h2>Motor Details</h2><p>No motor data available.</p>'; }
        var m = motor;
        var insClassLimit = MTDT.motorModel ? MTDT.motorModel.getInsulationLimit(m.insulationClass) : "—";
        var ratedRise = MTDT.motorModel ? MTDT.motorModel.calculateRatedTempRise(m.insulationClass, m.assumptions.hotSpotAllowanceK) : "—";
        return '' +
            '<h2>1. Motor Details</h2>' +
            '<table>' +
            '<tr><th>Parameter</th><th>Value</th><th>Provenance</th></tr>' +
            row("Designation", esc(m.designation), "Measured") +
            row("Rated Power", fmt(m.ratedPowerKW, 1) + " kW", "Measured") +
            row("Rated Voltage", fmt(m.ratedVoltageV, 0) + " V (line)", "Measured") +
            row("Rated Current", fmt(m.ratedCurrentA, 1) + " A (line)", "Measured") +
            row("Rated Frequency", fmt(m.ratedFrequencyHz, 1) + " Hz", "Measured") +
            row("Rated Speed", fmt(m.ratedSpeedRpm, 0) + " rpm", "Measured") +
            row("Efficiency (full load)", fmt(m.efficiencyPercent, 1) + " %", "Measured") +
            row("Service Factor", fmt(m.serviceFactor, 2), "Measured") +
            row("Insulation Class", esc(m.insulationClass) + " (" + insClassLimit + " °C max)", "Measured") +
            row("Cooling Type", esc(m.coolingType), "Measured") +
            row("Rated Temperature Rise", fmt(ratedRise, 0) + " K (40 °C ambient, " + m.assumptions.hotSpotAllowanceK + " K hot-spot)", "Derived") +
            '</table>' +
            '<h3>Loss Segregation (Assumed)</h3>' +
            '<table>' +
            '<tr><th>Component</th><th>Share</th><th>Provenance</th></tr>' +
            row("Copper Loss", fmt(m.assumptions.copperSharePct, 0) + " %", "Assumed") +
            row("Core Loss", fmt(m.assumptions.coreSharePct, 0) + " %", "Assumed") +
            row("Mechanical Loss", fmt(m.assumptions.mechSharePct, 0) + " %", "Assumed") +
            row("Stray Load Loss", fmt(m.assumptions.straySharePct, 0) + " %", "Assumed") +
            '</table>' +
            (m.measured
                ? '<h3>Measured Resistance</h3><table>' +
                  '<tr><th>Parameter</th><th>Value</th><th>Provenance</th></tr>' +
                  row("Stator Resistance / phase", fmt(m.measured.resistanceOhm, 5) + " Ω", "Measured") +
                  row("Measured at Temperature", fmt(m.measured.measuredAtC, 0) + " °C", "Measured") +
                  '</table>'
                : '<p><em>No measured stator resistance provided — resistance estimated from rated copper loss.</em></p>'
            );
    }

    function buildOperatingCondition(op) {
        if (!op) { return '<h2>2. Operating Condition</h2><p>No operating data available.</p>'; }
        var currentProv = op.currentIsEstimated ? "Estimated" : "Measured";
        var currentDisplay = op.currentIsEstimated
            ? "(estimated from load — see report)"
            : fmt(op.lineCurrentA, 1) + " A";
        return '' +
            '<h2>2. Operating Condition</h2>' +
            '<table>' +
            '<tr><th>Parameter</th><th>Value</th><th>Provenance</th></tr>' +
            row("Load", fmt(op.loadPercent, 0) + " % of rated", "Measured") +
            row("Line Current", currentDisplay, currentProv) +
            row("Line Voltage", fmt(op.lineVoltageV, 0) + " V", "Measured") +
            row("Frequency", fmt(op.frequencyHz, 1) + " Hz", "Measured") +
            row("Ambient Temperature", fmt(op.ambientTempC, 0) + " °C", "Measured") +
            row("Voltage Imbalance", fmt(op.voltageImbalancePct, 2) + " %", "Measured") +
            row("Starts per Hour", fmt(op.startsPerHour, 0), "Measured") +
            row("Time at Current Load", fmt(op.runtimeHours, 1) + " h", "Measured") +
            '</table>';
    }

    function buildLosses(ctx) {
        if (!ctx || !ctx.losses) { return '<h2>3. Estimated Losses</h2><p>No loss data.</p>'; }
        var l = ctx.losses;
        var lr = ctx.lossesRated;
        return '' +
            '<h2>3. Estimated Losses</h2>' +
            '<table>' +
            '<tr><th>Loss Component</th><th>Rated (W)</th><th>Operating (W)</th><th>Provenance</th></tr>' +
            row("Copper Loss (3·I²·R)", fmt(lr.copperW, 0), fmt(l.copperW, 0), ctx.R_provenance) +
            row("Core Loss (V²·f^1.5)", fmt(lr.coreW, 0), fmt(l.coreW, 0), "Calculated") +
            row("Mechanical (friction+windage)", fmt(lr.mechanicalW, 0), fmt(l.mechanicalW, 0), "Calculated") +
            row("Stray Load Loss", fmt(lr.strayW, 0), fmt(l.strayW, 0), "Calculated") +
            '</table>' +
            '<p><strong>Total Operating Losses: ' + fmt(l.totalW, 0) + ' W (' + fmt(l.totalW / 1000, 2) + ' kW)</strong></p>' +
            '<p><em>References: Eq 13 (segregation), Eq 1–5 (loss components).</em></p>';
    }

    function buildTemperature(ctx) {
        if (!ctx || !ctx.thermalResult) { return '<h2>4. Temperature Estimate</h2><p>No thermal data.</p>'; }
        var d = ctx.thermalResult.derived;
        var st = ctx.thermalResult.state;
        var tauMin = ctx.tau / 60;
        return '' +
            '<h2>4. Temperature Estimate</h2>' +
            '<table>' +
            '<tr><th>Quantity</th><th>Value</th><th>Provenance</th></tr>' +
            row("Steady-State Rise (θ_ss)", fmt(d.thetaSS, 1) + " K", "Estimated") +
            row("Initial Rise (θ_0, prior state)", fmt(d.theta0, 1) + " K", "Estimated") +
            row("Current Rise (θ_now)", fmt(d.thetaNow, 1) + " K", "Estimated") +
            row("Ambient Temperature", fmt(ctx.op.ambientTempC, 0) + " °C", "Measured") +
            row("Winding Temperature", fmt(d.windingTempC, 1) + " °C", "Estimated") +
            row("Steady-State Winding Temperature", fmt(d.steadyStateWindingTempC, 1) + " °C", "Estimated") +
            row("Frame Temperature (estimated)", fmt(MTDT.thermalModel.getFrameTemperature(st), 1) + " °C", "Typical") +
            row("Thermal Time Constant (τ)", fmt(ctx.tau, 0) + " s (" + fmt(tauMin, 0) + " min)", "Typical") +
            row("Cooling Effectiveness (η_cool)", fmt(ctx.etaCool, 3), "Derived") +
            row("Effective Conductance (G_th_eff)", fmt(ctx.Gth_eff, 5) + " K/W", "Calculated") +
            '</table>' +
            '<p><em>Model: θ(t) = θ_ss − (θ_ss − θ_0)·e^(−t/τ). Validation: 1τ→63.2%, 3τ→95.0%, 5τ→99.3%.</em></p>' +
            '<p><em>References: Eq 6, 7, 9, 10, 15, 16, 21, 22, 25.</em></p>';
    }

    function buildUtilization(ctx) {
        if (!ctx || !ctx.thermalResult) { return '<h2>5. Thermal Utilization</h2><p>No data.</p>'; }
        var d = ctx.thermalResult.derived;
        var u = d.utilizationPct;
        var margin = d.marginK;
        var tripS = MTDT.thermalModel.predictTripTime(
            ctx.thermalResult.state, d.thetaSS, ctx.riseLimitK_effective, ctx.tau);
        var tripStr;
        if (!isFinite(tripS)) { tripStr = "No trip predicted at current load (steady-state below limit)"; }
        else if (tripS === 0) { tripStr = "Already at/over limit"; }
        else { tripStr = fmt(tripS / 60, 1) + " min (" + fmt(tripS / 3600, 2) + " h)"; }

        return '' +
            '<h2>5. Thermal Utilization</h2>' +
            '<table>' +
            '<tr><th>Quantity</th><th>Value</th><th>Provenance</th></tr>' +
            row("Rise Limit (Class " + ctx.motor.insulationClass + ")", fmt(ctx.riseLimitK, 0) + " K", "Derived") +
            row("Voltage Imbalance Derating", fmt(ctx.derating, 3) + " (imbalance " + ctx.op.voltageImbalancePct + "%)", "Derived") +
            row("Effective Rise Limit", fmt(ctx.riseLimitK_effective, 1) + " K", "Calculated") +
            row("Thermal Utilization", fmt(u, 1) + " %", "Calculated") +
            row("Thermal Margin", fmt(margin, 1) + " K " + (margin < 0 ? "(OVER LIMIT)" : "(headroom)"), "Calculated") +
            row("Steady-State Utilization", fmt(d.steadyStateUtilizationPct, 1) + " %", "Calculated") +
            row("Steady-State Margin", fmt(d.steadyStateMarginK, 1) + " K", "Calculated") +
            row("Predicted Time to Limit", tripStr, "Estimated") +
            '</table>' +
            '<p><em>References: Eq 11, 12, 18, 23, 24.</em></p>';
    }

    function buildConfidence(ctx) {
        if (!ctx || !ctx.confidence) { return '<h2>6. Confidence</h2><p>No confidence data.</p>'; }
        var c = ctx.confidence;
        var applied = c.factors.filter(function (f) { return f.applied && f.delta !== 0; });

        var factorsRows = applied.map(function (f) {
            var sign = f.delta > 0 ? "+" : "";
            return row(esc(f.label), sign + f.delta, f.delta > 0 ? "Bonus" : "Penalty");
        }).join("");

        var missingStr = c.missing.length > 0
            ? c.missing.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("")
            : "<li>None</li>";

        return '' +
            '<h2>6. Confidence</h2>' +
            '<table>' +
            '<tr><th>Quantity</th><th>Value</th><th>Provenance</th></tr>' +
            row("Base Confidence", c.base + " %", "Assumed") +
            row("Final Confidence Score", c.score + " %", "Calculated") +
            row("Hard Cap", c.cap + " % (never 100% for a model)", "Assumed") +
            '</table>' +
            '<h3>Applied Factors</h3>' +
            '<table>' +
            '<tr><th>Factor</th><th>Delta</th><th>Type</th></tr>' +
            factorsRows +
            '</table>' +
            '<h3>Missing or Weak Inputs</h3>' +
            '<ul>' + missingStr + '</ul>' +
            '<p><em>Explanation: ' + esc(c.explanation) + '</em></p>';
    }

    function buildRootCauses(ctx) {
        if (!ctx || !ctx.diagnostics) { return '<h2>7. Root Causes</h2><p>No diagnostics.</p>'; }
        var diag = ctx.diagnostics;
        if (diag.length === 0) {
            return '<h2>7. Root Causes</h2>' +
                   '<p>No diagnostic concerns — operating point within safe limits.</p>';
        }
        var rows = diag.map(function (d) {
            return '<tr>' +
                '<td>' + esc(d.cause) + '</td>' +
                '<td>' + d.likelihood + ' %</td>' +
                '<td>' + d.severity.toUpperCase() + '</td>' +
                '<td>' + (d.evidence || []).map(esc).join("; ") + '</td>' +
                '<td>' + esc(d.recommendation || "") + '</td>' +
                '</tr>';
        }).join("");
        return '' +
            '<h2>7. Root Causes (Rule-Based Diagnostics)</h2>' +
            '<p><em>Diagnostic likelihood is a rule-based score, not a statistically validated probability.</em></p>' +
            '<table>' +
            '<tr><th>Cause</th><th>Likelihood</th><th>Severity</th><th>Evidence</th><th>Recommendation</th></tr>' +
            rows +
            '</table>';
    }

    function buildRecommendations(ctx) {
        if (!ctx || !ctx.diagnostics) {
            return '<h2>8. Recommendations</h2><p>No recommendations.</p>';
        }
        var diag = ctx.diagnostics.filter(function (d) { return d.fires; });
        var items = [];
        if (diag.length === 0) {
            items.push('<li>Operating point within safe limits — no action required.</li>');
            items.push('<li>For continuous monitoring, install RTD/thermocouple sensors in the stator winding and compare to this estimate.</li>');
            items.push('<li>Periodically verify the loss segregation assumptions against OEM data or IEC 60034-2-1 loss measurement.</li>');
        } else {
            diag.forEach(function (d) {
                items.push('<li><strong>' + esc(d.cause) + ':</strong> ' + esc(d.recommendation || "") + '</li>');
            });
        }
        items.push('<li>Verify all measured inputs (voltage, current, ambient) with calibrated instruments before relying on the thermal estimate.</li>');
        items.push('<li>If measured stator resistance is available, enter it to improve the copper-loss accuracy (resistance provenance changes from Estimated to Measured).</li>');
        items.push('<li>This application is an engineering estimate, not a substitute for OEM thermal protection or physical temperature measurement.</li>');
        return '<h2>8. Recommendations</h2><ul>' + items.join("") + '</ul>';
    }

    function buildAssumptionsLimitations() {
        var assump = ASSUMPTIONS.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join("");
        var limits = LIMITATIONS.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join("");
        return '' +
            '<h2>9. Engineering Assumptions</h2>' +
            '<ul>' + assump + '</ul>' +
            '<h2>10. Model Limitations</h2>' +
            '<ul>' + limits + '</ul>' +
            '<p style="margin-top:18px;border-top:1px solid #999;padding-top:8px;font-style:italic;">' +
            esc(DISCLAIMER) + '</p>';
    }

    function generateReport(ctx) {
        ctx = ctx || MTDT.state;
        if (!ctx || !ctx.motor || !ctx.thermalResult) {
            alert("Please run a thermal estimate first (click 'Run Thermal Estimate').");
            return false;
        }

        var headerEl = document.getElementById("reportHeader");
        var bodyEl = document.getElementById("reportBody");
        if (!headerEl || !bodyEl) {
            console.error("[MTDT.reports] #reportHeader or #reportBody not found in DOM.");
            return false;
        }

        headerEl.innerHTML = buildHeader(ctx.motor);
        bodyEl.innerHTML =
            buildMotorDetails(ctx.motor) +
            buildOperatingCondition(ctx.op) +
            buildLosses(ctx) +
            buildTemperature(ctx) +
            buildUtilization(ctx) +
            buildConfidence(ctx) +
            buildRootCauses(ctx) +
            buildRecommendations(ctx) +
            buildAssumptionsLimitations();

        setTimeout(function () {
            window.print();
        }, 100);

        console.info("[MTDT] Report generated and print dialog triggered.");
        return true;
    }

    function wirePrintButton() {
        var btn = document.getElementById("btnPrintReport");
        if (!btn) { return; }
        btn.addEventListener("click", function () {
            var ctx = (MTDT.app && MTDT.app.lastEstimateContext) || MTDT.state;
            generateReport(ctx);
        });
    }

    MTDT.reports = {
        generate: generateReport,
        wirePrintButton: wirePrintButton,
        buildHeader: buildHeader,
        buildMotorDetails: buildMotorDetails,
        buildOperatingCondition: buildOperatingCondition,
        buildLosses: buildLosses,
        buildTemperature: buildTemperature,
        buildUtilization: buildUtilization,
        buildConfidence: buildConfidence,
        buildRootCauses: buildRootCauses,
        buildRecommendations: buildRecommendations,
        buildAssumptionsLimitations: buildAssumptionsLimitations,
        DISCLAIMER: DISCLAIMER,
        ASSUMPTIONS: ASSUMPTIONS,
        LIMITATIONS: LIMITATIONS
    };

    function init() {
        wirePrintButton();
        console.info("[MTDT] reports.js loaded (print-to-PDF report, 10 sections)");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
