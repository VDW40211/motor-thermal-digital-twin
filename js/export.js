/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/export.js
   STEP 17 / PHASE 11 — CSV / JSON export.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    function validFinite(x) { return typeof x === "number" && isFinite(x); }
    function fmt(x, dec) {
        if (x === null || x === undefined || !validFinite(x)) { return ""; }
        return Number(x).toFixed(dec === undefined ? 4 : dec);
    }
    function ts() {
        var d = new Date();
        var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
               "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    }
    function safeName(s) {
        if (!s) { return "motor"; }
        return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    }

    function csvCell(v) {
        if (v === null || v === undefined) { return ""; }
        var s = String(v);
        if (/[",\n\r]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function buildCSV(ctx) {
        if (!ctx || !ctx.motor) { return null; }

        var d = ctx.thermalResult.derived;
        var motor = ctx.motor, op = ctx.op, losses = ctx.losses, lr = ctx.lossesRated;
        var rows = [];

        function add(section, key, value, unit, provenance) {
            rows.push([section, key, value, unit || "", provenance || ""]);
        }

        add("Meta",    "Generated",          new Date().toISOString(), "", "");
        add("Meta",    "Application",        "Motor Thermal Digital Twin v" + (MTDT.VERSION || "0.1.0"), "", "");
        add("Meta",    "Designation",        motor.designation, "", "Measured");

        add("Motor",   "RatedPower",         motor.ratedPowerKW,            "kW",   "Measured");
        add("Motor",   "RatedVoltage",      motor.ratedVoltageV,            "V",    "Measured");
        add("Motor",   "RatedCurrent",      motor.ratedCurrentA,           "A",    "Measured");
        add("Motor",   "RatedFrequency",    motor.ratedFrequencyHz,        "Hz",   "Measured");
        add("Motor",   "RatedSpeed",        motor.ratedSpeedRpm,           "rpm",  "Measured");
        add("Motor",   "Efficiency",        motor.efficiencyPercent,        "%",    "Measured");
        add("Motor",   "ServiceFactor",     motor.serviceFactor,           "",      "Measured");
        add("Motor",   "InsulationClass",   motor.insulationClass,        "",      "Measured");
        add("Motor",   "CoolingType",       motor.coolingType,            "",      "Measured");

        add("Assumptions", "CopperLossShare",   motor.assumptions.copperSharePct,    "%", "Assumed");
        add("Assumptions", "CoreLossShare",     motor.assumptions.coreSharePct,      "%", "Assumed");
        add("Assumptions", "MechLossShare",    motor.assumptions.mechSharePct,      "%", "Assumed");
        add("Assumptions", "StrayLossShare",   motor.assumptions.straySharePct,     "%", "Assumed");
        add("Assumptions", "HotSpotAllowance",  motor.assumptions.hotSpotAllowanceK, "K", "Assumed");
        add("Assumptions", "NoLoadCurrentPct", motor.assumptions.noLoadCurrentPct,  "%", "Typical");

        if (motor.measured) {
            add("Measured", "StatorResistance",   motor.measured.resistanceOhm, "Ω",  "Measured");
            add("Measured", "MeasuredAtTemp",     motor.measured.measuredAtC,  "°C", "Measured");
        }

        add("Operating", "Load",              op.loadPercent,         "%",  "Measured");
        add("Operating", "LineCurrent",       ctx.I_op,               "A",  ctx.I_provenance);
        add("Operating", "LineVoltage",       op.lineVoltageV,        "V",  "Measured");
        add("Operating", "Frequency",         op.frequencyHz,         "Hz", "Measured");
        add("Operating", "AmbientTemp",       op.ambientTempC,        "°C", "Measured");
        add("Operating", "VoltageImbalance",  op.voltageImbalancePct, "%",  "Measured");
        add("Operating", "StartsPerHour",     op.startsPerHour,      "",    "Measured");
        add("Operating", "Runtime",           op.runtimeHours,        "h",   "Measured");

        add("RatedLosses", "Copper",    lr.copperW,     "W", "Calculated");
        add("RatedLosses", "Core",      lr.coreW,       "W", "Calculated");
        add("RatedLosses", "Mechanical", lr.mechanicalW, "W", "Calculated");
        add("RatedLosses", "Stray",     lr.strayW,      "W", "Calculated");
        add("RatedLosses", "Total",    lr.totalW,      "W", "Calculated");

        add("OperatingLosses", "Copper",    losses.copperW,     "W", ctx.R_provenance);
        add("OperatingLosses", "Core",      losses.coreW,       "W", "Calculated");
        add("OperatingLosses", "Mechanical", losses.mechanicalW, "W", "Calculated");
        add("OperatingLosses", "Stray",     losses.strayW,      "W", "Calculated");
        add("OperatingLosses", "Total",    losses.totalW,      "W", "Calculated");

        add("Thermal", "RiseLimit",             ctx.riseLimitK,             "K",   "Derived");
        add("Thermal", "RiseLimitEffective",    ctx.riseLimitK_effective,  "K",   "Calculated");
        add("Thermal", "DeratingFactor",         ctx.derating,              "",     "Derived");
        add("Thermal", "CoolingEffectiveness",   ctx.etaCool,               "",     "Derived");
        add("Thermal", "Gth",                    ctx.Gth,                   "K/W", "Derived");
        add("Thermal", "GthEffective",          ctx.Gth_eff,               "K/W", "Calculated");
        add("Thermal", "Tau",                    ctx.tau,                   "s",   "Typical");
        add("Thermal", "TauMinutes",            ctx.tau / 60,               "min", "Typical");

        add("Temperature", "SteadyStateRise",       d.thetaSS,                "K",  "Estimated");
        add("Temperature", "InitialRise",            d.theta0,                 "K",  "Estimated");
        add("Temperature", "CurrentRise",            d.thetaNow,               "K",  "Estimated");
        add("Temperature", "WindingTemp",            d.windingTempC,           "°C", "Estimated");
        add("Temperature", "SteadyStateWindingTemp", d.steadyStateWindingTempC, "°C", "Estimated");
        add("Temperature", "FrameTemp",              MTDT.thermalModel.getFrameTemperature(ctx.thermalResult.state), "°C", "Typical");
        add("Temperature", "OperatingSpeed",         ctx.n_op,                  "rpm", "Estimated");

        add("Utilization", "ThermalUtilization",   d.utilizationPct,         "%", "Calculated");
        add("Utilization", "ThermalMargin",        d.marginK,                "K", "Calculated");
        add("Utilization", "SteadyStateUtilization", d.steadyStateUtilizationPct, "%", "Calculated");
        add("Utilization", "SteadyStateMargin",     d.steadyStateMarginK,     "K", "Calculated");

        var tripS = MTDT.thermalModel.predictTripTime(
            ctx.thermalResult.state, d.thetaSS, ctx.riseLimitK_effective, ctx.tau);
        var tripStr;
        if (!isFinite(tripS)) { tripStr = "Infinity"; }
        else if (tripS === 0) { tripStr = "0"; }
        else { tripStr = fmt(tripS, 1); }
        add("TripTime", "TimeToLimit",  tripStr,           "s",   "Estimated");
        add("TripTime", "TimeToLimitMin", isFinite(tripS) ? tripS / 60 : "Infinity", "min", "Estimated");

        var conf = ctx.confidence;
        add("Confidence", "Score",    conf.score,  "%", "Calculated");
        add("Confidence", "Base",     conf.base,   "%", "Assumed");
        add("Confidence", "Cap",      conf.cap,    "%", "Assumed");
        add("Confidence", "Missing",  conf.missing.join("; "), "", "");

        ctx.diagnostics.forEach(function (dg, idx) {
            add("Diagnostic_" + (idx + 1), "Cause",        dg.cause,         "",  "Derived");
            add("Diagnostic_" + (idx + 1), "Likelihood",   dg.likelihood,   "%",  "Derived");
            add("Diagnostic_" + (idx + 1), "Severity",     dg.severity,     "",   "Derived");
            add("Diagnostic_" + (idx + 1), "Evidence",     dg.evidence.join("; "), "", "");
            add("Diagnostic_" + (idx + 1), "Recommendation", dg.recommendation, "", "");
        });

        var lines = ["Section,Key,Value,Unit,Provenance"];
        rows.forEach(function (r) {
            lines.push(r.map(csvCell).join(","));
        });
        return lines.join("\r\n");
    }

    function buildJSON(ctx) {
        if (!ctx || !ctx.motor) { return null; }

        var d = ctx.thermalResult.derived;
        var tripS = MTDT.thermalModel.predictTripTime(
            ctx.thermalResult.state, d.thetaSS, ctx.riseLimitK_effective, ctx.tau);

        return {
            meta: {
                application: "Motor Thermal Digital Twin",
                version: MTDT.VERSION || "0.1.0",
                generated: new Date().toISOString(),
                designation: ctx.motor.designation
            },
            motor: ctx.motor,
            operatingData: ctx.op,
            ratedLosses: ctx.lossesRated,
            operatingLosses: ctx.losses,
            thermalParameters: {
                riseLimitK: ctx.riseLimitK,
                riseLimitK_effective: ctx.riseLimitK_effective,
                derating: ctx.derating,
                coolingEffective: ctx.etaCool,
                speedRatio: ctx.speedRatio,
                Gth: ctx.Gth,
                Gth_eff: ctx.Gth_eff,
                tau: ctx.tau,
                tauMinutes: ctx.tau / 60,
                operatingSpeed: ctx.n_op
            },
            temperature: {
                steadyStateRiseK: d.thetaSS,
                initialRiseK: d.theta0,
                currentRiseK: d.thetaNow,
                ambientC: ctx.op.ambientTempC,
                windingTempC: d.windingTempC,
                steadyStateWindingTempC: d.steadyStateWindingTempC,
                frameTempC: MTDT.thermalModel.getFrameTemperature(ctx.thermalResult.state)
            },
            utilization: {
                thermalUtilizationPct: d.utilizationPct,
                thermalMarginK: d.marginK,
                steadyStateUtilizationPct: d.steadyStateUtilizationPct,
                steadyStateMarginK: d.steadyStateMarginK,
                tripTimeS: isFinite(tripS) ? tripS : null,
                tripTimeMin: isFinite(tripS) ? tripS / 60 : null,
                tripTimeNote: !isFinite(tripS) ? "No trip predicted at current load" :
                              (tripS === 0 ? "Already at/over limit" : "")
            },
            resistance: {
                usedOhm: ctx.R_used,
                provenance: ctx.R_provenance,
                coldOhm: ctx.R_cold,
                measuredAtC: ctx.T_cold
            },
            current: {
                operatingA: ctx.I_op,
                provenance: ctx.I_provenance,
                estimatedFromLoad: ctx.op.currentIsEstimated
            },
            confidence: ctx.confidence,
            diagnostics: ctx.diagnostics,
            modelInfo: {
                equation: "theta(t) = theta_ss - (theta_ss - theta_0) * exp(-t/tau)",
                validation: { at1tau: 0.632, at3tau: 0.950, at5tau: 0.993 },
                provenanceConventions: {
                    Measured: "Direct user input from instruments",
                    Calculated: "Derived from equations using measured inputs",
                    Estimated: "Derived using assumed or typical values",
                    Assumed: "Default value, editable in the UI",
                    Derived: "Computed from other derived quantities",
                    Typical: "Empirical approximation (e.g. tau = 1200*sqrt(P))"
                }
            },
            disclaimer: "This application provides an engineering estimate and is not a substitute " +
                         "for physical temperature measurement or OEM thermal protection."
        };
    }

    function triggerDownload(content, filename, mimeType) {
        try {
            var bom = (mimeType.indexOf("csv") >= 0) ? "\uFEFF" : "";
            var blob = new Blob([bom + content], { type: mimeType });

            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();

            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            return true;
        } catch (e) {
            console.error("[MTDT.export] Download failed:", e);
            return false;
        }
    }

    function getContext() {
        var ctx = (MTDT.app && MTDT.app.lastEstimateContext) || MTDT.state;
        if (!ctx || !ctx.motor || !ctx.thermalResult) {
            alert("Please run a thermal estimate first (click 'Run Thermal Estimate').");
            return null;
        }
        return ctx;
    }

    function exportCSV() {
        var ctx = getContext();
        if (!ctx) { return false; }
        var csv = buildCSV(ctx);
        if (!csv) { return false; }
        var name = safeName(ctx.motor.designation);
        var filename = "mtdt_" + name + "_" + ts() + ".csv";
        var ok = triggerDownload(csv, filename, "text/csv;charset=utf-8");
        if (ok) { console.info("[MTDT] CSV exported: " + filename); }
        return ok;
    }

    function exportJSON() {
        var ctx = getContext();
        if (!ctx) { return false; }
        var obj = buildJSON(ctx);
        if (!obj) { return false; }
        var json = JSON.stringify(obj, null, 2);
        var name = safeName(ctx.motor.designation);
        var filename = "mtdt_" + name + "_" + ts() + ".json";
        var ok = triggerDownload(json, filename, "application/json;charset=utf-8");
        if (ok) { console.info("[MTDT] JSON exported: " + filename); }
        return ok;
    }

    function wireButtons() {
        var csv = document.getElementById("btnExportCsv");
        var json = document.getElementById("btnExportJson");
        if (csv) { csv.addEventListener("click", exportCSV); }
        if (json) { json.addEventListener("click", exportJSON); }
    }

    MTDT.exporter = {
        exportCSV: exportCSV,
        exportJSON: exportJSON,
        buildCSV: buildCSV,
        buildJSON: buildJSON,
        triggerDownload: triggerDownload,
        wireButtons: wireButtons
    };

    function init() {
        wireButtons();
        console.info("[MTDT] export.js loaded (CSV + JSON export, UTF-8 BOM)");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
