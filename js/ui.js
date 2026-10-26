/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/ui.js
   STEP 4 + 11 + 14 + 15 — UI layer (DOM rendering, input validation,
   KPI cards, calculation worksheets, calculation trace, motor viz).

   ROLE
   - The DOM layer: reads inputs, validates them, renders KPI cards, status
     badge, "Show Calculation" panels, motor SVG coloring, calc trace.
   - Provides the API consumed by app.js (controller).
   - Contains NO engineering formulas. Numeric ranges are input sanity only.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    /* ==================================================================
       1. Field registry
       ================================================================== */
    var FIELDS = [
        { id: "inpMotorDesignation", key: "designation",       group: "motor", type: "text",   required: true, maxLen: 40 },
        { id: "inpRatedPower",       key: "ratedPowerKW",      group: "motor", type: "number", min: 0.1, max: 10000 },
        { id: "inpRatedVoltage",     key: "ratedVoltageV",     group: "motor", type: "number", min: 50,  max: 15000 },
        { id: "inpRatedCurrent",     key: "ratedCurrentA",     group: "motor", type: "number", min: 0.1, max: 10000 },
        { id: "inpRatedFrequency",   key: "ratedFrequencyHz",  group: "motor", type: "number", min: 1,   max: 400 },
        { id: "inpRatedSpeed",       key: "ratedSpeedRpm",     group: "motor", type: "number", min: 1,   max: 60000 },
        { id: "inpEfficiency",       key: "efficiencyPercent", group: "motor", type: "number", min: 10,  max: 100, maxExclusive: true },
        { id: "inpServiceFactor",    key: "serviceFactor",     group: "motor", type: "number", min: 1,   max: 1.5 },
        { id: "selInsulationClass",  key: "insulationClass",   group: "motor", type: "select", options: ["A", "E", "B", "F", "H"] },
        { id: "selCoolingType",      key: "coolingType",       group: "motor", type: "select", options: ["TEFC", "ODP", "TENV", "FORCED"] },
        { id: "inpCopperShare",      key: "copperSharePct",    group: "assumptions", type: "number", min: 1, max: 99 },
        { id: "inpCoreShare",        key: "coreSharePct",      group: "assumptions", type: "number", min: 1, max: 99 },
        { id: "inpMechShare",        key: "mechSharePct",      group: "assumptions", type: "number", min: 1, max: 99 },
        { id: "inpStrayShare",       key: "straySharePct",     group: "assumptions", type: "number", min: 1, max: 99 },
        { id: "inpHotSpotAllowance", key: "hotSpotAllowanceK", group: "assumptions", type: "number", min: 0, max: 30 },
        { id: "inpNoLoadCurrentPct", key: "noLoadCurrentPct",  group: "assumptions", type: "number", min: 5, max: 60 },
        { id: "inpMeasuredResistance",     key: "resistanceOhm", group: "measured", type: "number", optional: true, min: 0.0001, max: 100 },
        { id: "inpMeasuredResistanceTemp", key: "measuredAtC",   group: "measured", type: "number", optional: true, min: -50, max: 250 },
        { id: "inpLoadPercent",        key: "loadPercent",         group: "operating", type: "number", min: 0, max: 300 },
        { id: "inpLineCurrent",        key: "lineCurrentA",        group: "operating", type: "number", min: 0.1, max: 10000 },
        { id: "inpLineVoltage",        key: "lineVoltageV",        group: "operating", type: "number", min: 50, max: 15000 },
        { id: "inpOperatingFrequency", key: "frequencyHz",         group: "operating", type: "number", min: 5, max: 120 },
        { id: "inpAmbientTemp",        key: "ambientTempC",        group: "operating", type: "number", min: -40, max: 80 },
        { id: "inpVoltageImbalance",   key: "voltageImbalancePct", group: "operating", type: "number", min: 0, max: 10 },
        { id: "inpStartsPerHour",      key: "startsPerHour",       group: "operating", type: "number", min: 0, max: 60 },
        { id: "inpRuntimeHours",       key: "runtimeHours",        group: "operating", type: "number", min: 0, max: 8760 },
        { id: "inpSimDuration",        key: "durationMin",         group: "sim", type: "number", min: 1, max: 720 },
        { id: "inpSimStep",            key: "stepS",               group: "sim", type: "number", min: 1, max: 60 }
    ];

    var STATUS_KINDS = ["standby", "normal", "caution", "alarm", "critical"];
    var KPI_KEYS = ["windingTemp", "utilization", "margin", "totalLosses",
                    "timeConstant", "confidence", "health", "tripTime"];
    var PROVENANCE_CLASS = {
        "Measured":   "label--measured",
        "Calculated": "label--calculated",
        "Estimated":  "label--estimated",
        "Assumed":    "label--assumed",
        "Derived":    "label--derived",
        "Typical":    "label--typical"
    };
    var SHARE_IDS = ["inpCopperShare", "inpCoreShare", "inpMechShare", "inpStrayShare"];

    var lastValidation = {};
    var errorCount = 0;
    var statusBase = { kind: "standby", text: "STANDBY" };
    var defaults = {};
    var badgeEl = null;

    /* ==================================================================
       2. Helpers
       ================================================================== */
    function isAutoCurrent() {
        var chk = document.getElementById("chkAutoCurrent");
        return !!(chk && chk.checked);
    }
    function getBadge() {
        if (!badgeEl) { badgeEl = document.getElementById("statusBadge"); }
        return badgeEl;
    }
    function val(id) {
        var r = lastValidation[id];
        return r ? r.value : undefined;
    }
    function validFinite(x) { return typeof x === "number" && isFinite(x); }

    /* ==================================================================
       3. Validation
       ================================================================== */
    function validateField(def) {
        var el = def.el;

        if (def.type === "select") {
            var ok = def.options.indexOf(el.value) >= 0;
            return { ok: ok, value: ok ? el.value : null, message: ok ? null : "Invalid selection" };
        }

        var raw = (el.value === null || el.value === undefined) ? "" : String(el.value).trim();

        if (def.type === "text") {
            if (raw === "") {
                return { ok: !def.required, value: "", message: def.required ? "Required" : null };
            }
            if (def.maxLen && raw.length > def.maxLen) {
                return { ok: false, value: raw, message: "Too long (max " + def.maxLen + " characters)" };
            }
            return { ok: true, value: raw, message: null };
        }

        if (def.id === "inpLineCurrent" && isAutoCurrent()) {
            return { ok: true, value: null, message: null };
        }

        if (raw === "") {
            if (def.optional) { return { ok: true, value: null, message: null }; }
            var reqMsg = (def.id === "inpLineCurrent")
                ? "Required when auto-estimate is off"
                : "Required";
            return { ok: false, value: null, message: reqMsg };
        }

        var n = Number(raw);
        if (!isFinite(n)) {
            return { ok: false, value: null, message: "Enter a number" };
        }
        if (def.min !== undefined && n < def.min) {
            return { ok: false, value: n, message: "Must be \u2265 " + def.min };
        }
        if (def.max !== undefined) {
            if (def.maxExclusive && n >= def.max) {
                return { ok: false, value: n, message: "Must be below " + def.max };
            }
            if (!def.maxExclusive && n > def.max) {
                return { ok: false, value: n, message: "Must be \u2264 " + def.max };
            }
        }
        return { ok: true, value: n, message: null };
    }

    function validateAll() {
        lastValidation = {};
        FIELDS.forEach(function (def) {
            if (!def.el) { return; }
            lastValidation[def.id] = validateField(def);
        });

        var allSharesValid = SHARE_IDS.every(function (id) {
            return lastValidation[id] && lastValidation[id].ok;
        });
        if (allSharesValid) {
            var sum = 0;
            SHARE_IDS.forEach(function (id) { sum += lastValidation[id].value; });
            if (Math.abs(sum - 100) > 0.01) {
                var msg = "Loss shares must total 100% \u2014 currently " + sum + "%";
                SHARE_IDS.forEach(function (id) {
                    lastValidation[id] = { ok: false, value: lastValidation[id].value, message: msg };
                });
            }
        }

        errorCount = 0;
        Object.keys(lastValidation).forEach(function (id) {
            if (!lastValidation[id].ok) { errorCount += 1; }
        });
    }

    function setFieldError(def, message) {
        var field = def.el.closest(".form-field");
        if (!field) { return; }
        var span = field.querySelector(".field-error");
        if (message) {
            if (!span) {
                span = document.createElement("span");
                span.className = "field-error";
                span.setAttribute("aria-live", "polite");
                field.appendChild(span);
            }
            span.textContent = message;
            field.classList.add("form-field--invalid");
            def.el.setAttribute("aria-invalid", "true");
        } else {
            if (span) { span.parentNode.removeChild(span); }
            field.classList.remove("form-field--invalid");
            def.el.removeAttribute("aria-invalid");
        }
    }

    function renderFieldStates() {
        FIELDS.forEach(function (def) {
            if (!def.el) { return; }
            var r = lastValidation[def.id];
            setFieldError(def, (r && !r.ok) ? (r.message || "Invalid value") : null);
        });
    }

    function renderStatus() {
        var badge = getBadge();
        if (!badge) { return; }
        if (errorCount > 0) {
            badge.className = "badge badge--caution";
            badge.textContent = "Check inputs (" + errorCount + ")";
        } else {
            badge.className = "badge badge--" + statusBase.kind;
            badge.textContent = statusBase.text;
        }
    }

    function setStatus(kind, text) {
        var k = STATUS_KINDS.indexOf(kind) >= 0 ? kind : "standby";
        statusBase = { kind: k, text: String(text || k) };
        renderStatus();
    }

    /* ==================================================================
       4. Input readers
       ================================================================== */
    function collectErrors(groupMap) {
        var out = [];
        FIELDS.forEach(function (def) {
            if (!groupMap[def.group]) { return; }
            var r = lastValidation[def.id];
            if (r && !r.ok) {
                out.push({ id: def.id, key: def.key, message: r.message || "Invalid value" });
            }
        });
        return out;
    }

    function readMotor() {
        validateAll();
        renderFieldStates();
        renderStatus();
        var errors = collectErrors({ motor: 1, assumptions: 1, measured: 1 });
        if (errors.length) { return { ok: false, motor: null, errors: errors }; }

        var rOhm = val("inpMeasuredResistance");
        var tC = val("inpMeasuredResistanceTemp");

        return {
            ok: true,
            errors: [],
            motor: {
                designation:       val("inpMotorDesignation"),
                ratedPowerKW:      val("inpRatedPower"),
                ratedVoltageV:     val("inpRatedVoltage"),
                ratedCurrentA:     val("inpRatedCurrent"),
                ratedFrequencyHz:  val("inpRatedFrequency"),
                ratedSpeedRpm:     val("inpRatedSpeed"),
                efficiencyPercent: val("inpEfficiency"),
                serviceFactor:     val("inpServiceFactor"),
                insulationClass:   val("selInsulationClass"),
                coolingType:       val("selCoolingType"),
                assumptions: {
                    copperSharePct:    val("inpCopperShare"),
                    coreSharePct:      val("inpCoreShare"),
                    mechSharePct:      val("inpMechShare"),
                    straySharePct:     val("inpStrayShare"),
                    hotSpotAllowanceK: val("inpHotSpotAllowance"),
                    noLoadCurrentPct:  val("inpNoLoadCurrentPct")
                },
                measured: (rOhm !== null && rOhm !== undefined) ? {
                    resistanceOhm: rOhm,
                    measuredAtC: (tC === null || tC === undefined) ? 25 : tC
                } : null
            }
        };
    }

    function readOperatingData() {
        validateAll();
        renderFieldStates();
        renderStatus();
        var errors = collectErrors({ operating: 1 });
        if (errors.length) { return { ok: false, data: null, errors: errors }; }

        var auto = isAutoCurrent();
        return {
            ok: true,
            errors: [],
            data: {
                loadPercent:         val("inpLoadPercent"),
                lineCurrentA:        auto ? null : val("inpLineCurrent"),
                currentIsEstimated:  auto,
                lineVoltageV:        val("inpLineVoltage"),
                frequencyHz:         val("inpOperatingFrequency"),
                ambientTempC:        val("inpAmbientTemp"),
                voltageImbalancePct: val("inpVoltageImbalance"),
                startsPerHour:       val("inpStartsPerHour"),
                runtimeHours:        val("inpRuntimeHours")
            }
        };
    }

    function readSimConfig() {
        validateAll();
        renderFieldStates();
        renderStatus();
        var errors = collectErrors({ sim: 1 });
        if (errors.length) { return { ok: false, config: null, errors: errors }; }
        return {
            ok: true,
            errors: [],
            config: { durationMin: val("inpSimDuration"), stepS: val("inpSimStep") }
        };
    }

    /* ==================================================================
       5. KPI cards
       ================================================================== */
    function setKpi(key, opts) {
        var card = document.querySelector('.kpi-card[data-kpi="' + key + '"]');
        if (!card) { return false; }
        opts = opts || {};

        var num = card.querySelector(".kpi-number");
        if (num) {
            num.textContent = (opts.value === null || opts.value === undefined) ? "\u2014" : String(opts.value);
        }
        if (opts.unit !== undefined) {
            var unit = card.querySelector(".kpi-unit");
            if (unit) { unit.textContent = opts.unit; }
        }
        if (opts.sub !== undefined) {
            var sub = card.querySelector(".kpi-sub");
            if (sub) { sub.textContent = opts.sub; }
        }
        if (opts.state) {
            card.setAttribute("data-state", opts.state);
        } else {
            card.removeAttribute("data-state");
        }
        if (opts.provenance && PROVENANCE_CLASS[opts.provenance]) {
            var prov = card.querySelector("[data-provenance]");
            if (prov) {
                prov.className = "label " + PROVENANCE_CLASS[opts.provenance];
                prov.textContent = opts.provenance;
            }
        }
        return true;
    }

    function clearKpis(message) {
        KPI_KEYS.forEach(function (key) {
            setKpi(key, { value: null, sub: message });
        });
    }

    function showCalculation(id, text) {
        var el = document.getElementById(id);
        if (el) { el.textContent = String(text || ""); }
    }

    /* ==================================================================
       6. Reset Inputs
       ================================================================== */
    function captureDefaults() {
        defaults = {};
        FIELDS.forEach(function (def) {
            if (def.el) { defaults[def.id] = def.el.value; }
        });
        var chk = document.getElementById("chkAutoCurrent");
        defaults.__autoCurrent = !!(chk && chk.checked);
    }

    function resetInputs() {
        FIELDS.forEach(function (def) {
            if (!def.el) { return; }
            if (Object.prototype.hasOwnProperty.call(defaults, def.id)) {
                def.el.value = defaults[def.id];
            }
        });

        var chk = document.getElementById("chkAutoCurrent");
        if (chk) {
            chk.checked = !!defaults.__autoCurrent;
            try { chk.dispatchEvent(new Event("change")); } catch (e) { /* ignore */ }
        }

        validateAll();
        renderFieldStates();
        setStatus("standby", "STANDBY");
        clearKpis("Awaiting calculation");
    }

    /* ==================================================================
       7. Wiring + init
       ================================================================== */
    function onFieldChange() {
        validateAll();
        renderFieldStates();
        renderStatus();
    }

    function wireCalcToggles() {
        var buttons = document.querySelectorAll(".kpi-calc-toggle");
        buttons.forEach(function (btn) {
            var targetId = btn.getAttribute("data-calc-target");
            var target = targetId ? document.getElementById(targetId) : null;
            if (!target) { return; }

            if (!target.textContent.trim()) {
                target.textContent =
                    "No calculation available yet.\n\n" +
                    "Once the physics engine is active, this panel will show " +
                    "the equation, the substituted input values, and the result.";
            }

            btn.setAttribute("aria-expanded", "false");
            btn.addEventListener("click", function () {
                var show = target.hidden;
                target.hidden = !show;
                btn.textContent = show ? "Hide Calculation" : "Show Calculation";
                btn.setAttribute("aria-expanded", show ? "true" : "false");
            });
        });
    }

    /* ==================================================================
       8. Temperature → color (RdYlBu scale)
       ================================================================== */
    var TEMP_STOPS = [
        { t: 20,  c: [44, 123, 182] },
        { t: 60,  c: [146, 197, 222] },
        { t: 100, c: [255, 255, 191] },
        { t: 140, c: [253, 174, 97] },
        { t: 180, c: [215, 25, 28] }
    ];

    function rgbToHex(rgb) {
        return "#" + rgb.map(function (v) {
            var h = v.toString(16);
            return h.length === 1 ? "0" + h : h;
        }).join("");
    }

    function tempToColor(tempC) {
        if (!validFinite(tempC)) { return rgbToHex(TEMP_STOPS[2].c); }
        if (tempC <= TEMP_STOPS[0].t) { return rgbToHex(TEMP_STOPS[0].c); }
        if (tempC >= TEMP_STOPS[TEMP_STOPS.length - 1].t) { return rgbToHex(TEMP_STOPS[TEMP_STOPS.length - 1].c); }
        for (var i = 1; i < TEMP_STOPS.length; i++) {
            if (tempC <= TEMP_STOPS[i].t) {
                var lo = TEMP_STOPS[i - 1], hi = TEMP_STOPS[i];
                var f = (tempC - lo.t) / (hi.t - lo.t);
                return rgbToHex([
                    Math.round(lo.c[0] + (hi.c[0] - lo.c[0]) * f),
                    Math.round(lo.c[1] + (hi.c[1] - lo.c[1]) * f),
                    Math.round(lo.c[2] + (hi.c[2] - lo.c[2]) * f)
                ]);
            }
        }
        return rgbToHex(TEMP_STOPS[TEMP_STOPS.length - 1].c);
    }

    function utilToState(u) {
        if (u >= 100) { return "alarm"; }
        if (u >= 80) { return "caution"; }
        return "normal";
    }

    /* ==================================================================
       9. Main render entry point
       ================================================================== */
    function renderResults(ctx) {
        renderKpis(ctx);
        renderCalculations(ctx);
        renderCalcTrace(ctx);
        renderDiagnostics(ctx.diagnostics);
        renderMotorViz(ctx);
        renderStatusFromResults(ctx);
    }

    /* ==================================================================
       10. KPI rendering
       ================================================================== */
    function renderKpis(ctx) {
        var d = ctx.thermalResult.derived;
        var u = d.utilizationPct;

        setKpi("windingTemp", {
            value: d.windingTempC.toFixed(1),
            unit: "\u00B0C",
            sub: "Rise " + d.thetaNow.toFixed(1) + " K above ambient",
            state: utilToState(u),
            provenance: "Estimated"
        });

        setKpi("utilization", {
            value: u.toFixed(1),
            unit: "%",
            sub: "Limit " + ctx.riseLimitK_effective.toFixed(0) + " K" +
                 (ctx.derating < 1 ? " (derated " + (ctx.derating * 100).toFixed(0) + "%)" : ""),
            state: utilToState(u),
            provenance: "Calculated"
        });

        setKpi("margin", {
            value: d.marginK.toFixed(0),
            unit: "K",
            sub: d.marginK >= 0 ? "Headroom available" : "OVER LIMIT",
            state: d.marginK > 20 ? "normal" : (d.marginK > 0 ? "caution" : "alarm"),
            provenance: "Calculated"
        });

        setKpi("totalLosses", {
            value: (ctx.losses.totalW / 1000).toFixed(2),
            unit: "kW",
            sub: "Cu " + (ctx.losses.copperW / 1000).toFixed(1) +
                 " / Fe " + (ctx.losses.coreW / 1000).toFixed(1) +
                 " / Mech " + (ctx.losses.mechanicalW / 1000).toFixed(1) +
                 " / Stray " + (ctx.losses.strayW / 1000).toFixed(1) + " kW",
            provenance: "Estimated"
        });

        setKpi("timeConstant", {
            value: (ctx.tau / 60).toFixed(0),
            unit: "min",
            sub: "\u03C4 = 1200 \u00D7 \u221A" + ctx.motor.ratedPowerKW + " kW",
            provenance: "Typical"
        });

        setKpi("confidence", {
            value: ctx.confidence.score,
            unit: "%",
            sub: ctx.confidence.missing.length + " factor(s) limiting",
            state: MTDT.confidence.scoreToStatus(ctx.confidence.score) === "normal" ? "normal" : "caution",
            provenance: MTDT.confidence.scoreToProvenance(ctx.confidence.score)
        });

        var health = Math.max(0, Math.min(100, 100 - u));
        setKpi("health", {
            value: health.toFixed(0),
            unit: "/100",
            sub: health > 50 ? "Healthy" : (health > 20 ? "Marginal" : "At limit"),
            state: health > 50 ? "normal" : (health > 20 ? "caution" : "alarm"),
            provenance: "Derived"
        });

        var tripS = MTDT.thermalModel.predictTripTime(
            ctx.thermalResult.state, d.thetaSS, ctx.riseLimitK_effective, ctx.tau);
        var tripDisplay, tripUnit, tripSub, tripState;
        if (!isFinite(tripS) || tripS === Infinity) {
            tripDisplay = "\u221E"; tripUnit = ""; tripSub = "No trip predicted at current load";
            tripState = "normal";
        } else if (tripS === 0) {
            tripDisplay = "0"; tripUnit = ""; tripSub = "Already at/over limit";
            tripState = "alarm";
        } else {
            var tripMin = tripS / 60;
            if (tripMin < 60) { tripDisplay = tripMin.toFixed(1); tripUnit = "min"; }
            else { tripDisplay = (tripMin / 60).toFixed(1); tripUnit = "h"; }
            tripSub = "to reach thermal limit";
            tripState = (tripMin < 30) ? "caution" : "normal";
        }
        setKpi("tripTime", {
            value: tripDisplay, unit: tripUnit, sub: tripSub, state: tripState,
            provenance: "Estimated"
        });
    }

    /* ==================================================================
       11. Calculation worksheets
       ================================================================== */
    function renderCalculations(ctx) {
        var d = ctx.thermalResult.derived;
        var motor = ctx.motor, op = ctx.op, losses = ctx.losses, lr = ctx.lossesRated;
        var tauMin = (ctx.tau / 60).toFixed(0);

        function refs(eqNumbers) {
            return "References: " + eqNumbers.map(function (n) {
                return "Eq " + n;
            }).join(", ");
        }

        showCalculation("calcWindingTemp", [
            "WINDING TEMPERATURE",
            refs([13, 14, 20, 16, 15, 18, 10, 11, 21, 22]),
            "",
            "T_winding = T_ambient + \u03B8_now",
            "",
            "Step 1: steady-state rise",
            "  \u03B8_ss = P_total \u00D7 G_th / \u03B7_cool",
            "       = " + losses.totalW.toFixed(0) + " \u00D7 " + ctx.Gth.toFixed(5) + " / " + ctx.etaCool.toFixed(3),
            "       = " + d.thetaSS.toFixed(1) + " K",
            "",
            "Step 2: actual rise (first-order response)",
            "  \u03B8_now = \u03B8_ss \u2212 (\u03B8_ss \u2212 \u03B8_0) \u00D7 e^(\u2212t/\u03C4)",
            "  \u03B8_0 = " + d.theta0.toFixed(1) + " K  (prior rise, thermal memory)",
            "  t = " + (ctx.elapsedS / 3600).toFixed(2) + " h = " + ctx.elapsedS.toFixed(0) + " s",
            "  \u03C4 = " + ctx.tau.toFixed(0) + " s (" + tauMin + " min)",
            "  \u03B8_now = " + d.thetaNow.toFixed(1) + " K",
            "",
            "Step 3: absolute temperature",
            "  T = " + op.ambientTempC + " + " + d.thetaNow.toFixed(1) + " = " + d.windingTempC.toFixed(1) + " \u00B0C",
            "",
            "Provenance: Estimated (single-node first-order model)"
        ].join("\n"));

        showCalculation("calcUtilization", [
            "THERMAL UTILIZATION",
            refs([18, 11, 12]),
            "",
            "U = (\u03B8_actual / \u03B8_limit) \u00D7 100",
            "",
            "\u03B8_actual = " + d.thetaNow.toFixed(1) + " K",
            "\u03B8_limit = " + ctx.riseLimitK + " K (Class " + motor.insulationClass +
            ", 40\u00B0C ambient, " + motor.assumptions.hotSpotAllowanceK + " K hot-spot)",
            "Derating D = " + ctx.derating.toFixed(3) + " (imbalance " + op.voltageImbalancePct + "%)",
            "\u03B8_limit_eff = " + ctx.riseLimitK + " \u00D7 " + ctx.derating.toFixed(3) + " = " + ctx.riseLimitK_effective.toFixed(1) + " K",
            "",
            "U = (" + d.thetaNow.toFixed(1) + " / " + ctx.riseLimitK_effective.toFixed(1) + ") \u00D7 100",
            "  = " + d.utilizationPct.toFixed(1) + " %",
            "",
            "Provenance: Calculated"
        ].join("\n"));

        showCalculation("calcMargin", [
            "THERMAL MARGIN",
            refs([24]),
            "",
            "margin = \u03B8_limit \u2212 \u03B8_actual",
            "",
            "margin = " + ctx.riseLimitK_effective.toFixed(1) + " \u2212 " + d.thetaNow.toFixed(1),
            "       = " + d.marginK.toFixed(1) + " K",
            "",
            d.marginK > 0 ? "Positive = headroom available" :
                (d.marginK === 0 ? "At limit" : "Negative = OVER LIMIT"),
            "",
            "Provenance: Calculated"
        ].join("\n"));

        showCalculation("calcTotalLosses", [
            "TOTAL LOSSES",
            refs([13, 1, 2, 3, 4, 5]),
            "",
            "P_total = P_cu + P_core + P_mech + P_stray",
            "",
            "P_cu = 3 \u00D7 I\u00B2 \u00D7 R",
            "  I = " + ctx.I_op.toFixed(1) + " A (" + ctx.I_provenance + ")",
            "  R = " + ctx.R_used.toFixed(5) + " \u03A9 (" + ctx.R_provenance +
            (ctx.R_provenance === "Measured" ? ", corrected to " + d.windingTempC.toFixed(0) + "\u00B0C" : "") + ")",
            "  P_cu = " + losses.copperW.toFixed(0) + " W",
            "",
            "P_core = " + lr.coreW.toFixed(0) + " \u00D7 (" + op.lineVoltageV + "/" + motor.ratedVoltageV + ")\u00B2 \u00D7 (" + op.frequencyHz + "/" + motor.ratedFrequencyHz + ")^1.5",
            "       = " + losses.coreW.toFixed(0) + " W",
            "",
            "P_mech = " + lr.mechanicalW.toFixed(0) + " \u00D7 (" + ctx.n_op.toFixed(0) + "/" + motor.ratedSpeedRpm + ")^2.5",
            "       = " + losses.mechanicalW.toFixed(0) + " W",
            "",
            "P_stray = " + lr.strayW.toFixed(0) + " \u00D7 (" + ctx.I_op.toFixed(0) + "/" + motor.ratedCurrentA + ")\u00B2",
            "        = " + losses.strayW.toFixed(0) + " W",
            "",
            "P_total = " + losses.totalW.toFixed(0) + " W = " + (losses.totalW / 1000).toFixed(2) + " kW",
            "",
            "Provenance: Estimated"
        ].join("\n"));

        showCalculation("calcTimeConstant", [
            "THERMAL TIME CONSTANT",
            refs([15]),
            "",
            "\u03C4 = 1200 \u00D7 \u221A(P_rated_kW)",
            "",
            "\u03C4 = 1200 \u00D7 \u221A" + motor.ratedPowerKW + " = " + ctx.tau.toFixed(0) + " s",
            "    = " + tauMin + " min = " + (ctx.tau / 3600).toFixed(2) + " h",
            "",
            "Validation: 1\u03C4\u219263.2%, 3\u03C4\u219295.0%, 5\u03C4\u219299.3%",
            "",
            "Provenance: Typical (empirical TEFC, \u00B150%)"
        ].join("\n"));

        showCalculation("calcConfidence",
            "Confidence: rule-based scoring (base 65%, cap 95%)\n\n" +
            ctx.confidence.explanation);

        var health = Math.max(0, Math.min(100, 100 - d.utilizationPct));
        showCalculation("calcHealth", [
            "THERMAL HEALTH SCORE",
            refs([12]),
            "",
            "Health = clamp(100 \u2212 Utilization, 0, 100)",
            "",
            "Utilization = " + d.utilizationPct.toFixed(1) + "%",
            "Health = 100 \u2212 " + d.utilizationPct.toFixed(1) + " = " + health.toFixed(0) + " / 100",
            "",
            "Interpretation:",
            "  100 = no thermal stress (idle)",
            "  50  = half thermal budget consumed",
            "  0   = at thermal limit (rated operation by design)",
            "",
            "Note: at rated load & steady state, utilization = 100% by design.",
            "Health reflects remaining headroom, not motor condition.",
            "",
            "Provenance: Derived"
        ].join("\n"));

        var tripS = MTDT.thermalModel.predictTripTime(
            ctx.thermalResult.state, d.thetaSS, ctx.riseLimitK_effective, ctx.tau);
        if (!isFinite(tripS) || tripS === Infinity) {
            showCalculation("calcTripTime", [
                "PREDICTED TIME TO LIMIT",
                refs([23]),
                "",
                "t_trip = \u2212\u03C4 \u00D7 ln((\u03B8_ss \u2212 \u03B8_limit) / (\u03B8_ss \u2212 \u03B8_0))",
                "",
                "\u03B8_ss = " + d.thetaSS.toFixed(1) + " K  (\u2264 limit " + ctx.riseLimitK_effective.toFixed(1) + " K)",
                "\u2192 motor will NOT trip at current load",
                "",
                "t_trip = \u221E",
                "",
                "Provenance: Estimated"
            ].join("\n"));
        } else if (tripS === 0) {
            showCalculation("calcTripTime", [
                "PREDICTED TIME TO LIMIT",
                refs([23]),
                "",
                "\u03B8_0 \u2265 \u03B8_limit \u2192 already at/over limit",
                "",
                "\u03B8_0 = " + d.theta0.toFixed(1) + " K, limit = " + ctx.riseLimitK_effective.toFixed(1) + " K",
                "",
                "t_trip = 0",
                "",
                "Provenance: Estimated"
            ].join("\n"));
        } else {
            showCalculation("calcTripTime", [
                "PREDICTED TIME TO LIMIT",
                refs([23]),
                "",
                "t_trip = \u2212\u03C4 \u00D7 ln((\u03B8_ss \u2212 \u03B8_limit) / (\u03B8_ss \u2212 \u03B8_0))",
                "",
                "\u03B8_ss = " + d.thetaSS.toFixed(1) + " K",
                "\u03B8_0 = " + d.theta0.toFixed(1) + " K",
                "\u03B8_limit = " + ctx.riseLimitK_effective.toFixed(1) + " K",
                "\u03C4 = " + ctx.tau.toFixed(0) + " s",
                "",
                "t_trip = " + tripS.toFixed(0) + " s = " + (tripS / 60).toFixed(1) + " min",
                "",
                "Provenance: Estimated"
            ].join("\n"));
        }
    }

    /* ==================================================================
       12. Calculation Trace
       ================================================================== */
    function provClass(p) {
        var map = {
            "Measured": "calctrace-prov--measured",
            "Calculated": "calctrace-prov--calculated",
            "Estimated": "calctrace-prov--estimated",
            "Assumed": "calctrace-prov--assumed",
            "Derived": "calctrace-prov--derived",
            "Typical": "calctrace-prov--typical"
        };
        return map[p] || "calctrace-prov--derived";
    }

    function renderCalcTrace(ctx) {
        var list = document.getElementById("calcTraceList");
        var meta = document.getElementById("calcTraceMeta");
        if (!list || !meta) { return; }
        list.innerHTML = "";

        var d = ctx.thermalResult.derived;
        var motor = ctx.motor, op = ctx.op, losses = ctx.losses, lr = ctx.lossesRated;

        var entries = [
            {
                eq: 13, name: "Loss Segregation",
                formula: "P_loss = P_rated \u00D7 (1/\u03B7 \u2212 1)",
                subst: motor.ratedPowerKW + " kW \u00D7 (1/" + (motor.efficiencyPercent / 100).toFixed(2) + " \u2212 1)",
                result: lr.totalW.toFixed(0) + " W (Cu " + lr.copperW.toFixed(0) +
                        " / Fe " + lr.coreW.toFixed(0) + " / Mech " + lr.mechanicalW.toFixed(0) +
                        " / Stray " + lr.strayW.toFixed(0) + ")",
                prov: "Assumed"
            },
            {
                eq: ctx.R_provenance === "Measured" ? null : 14,
                name: "Stator Resistance",
                formula: ctx.R_provenance === "Measured"
                    ? "R_measured = " + ctx.R_cold + " \u03A9 @ " + ctx.T_cold + "\u00B0C (corrected to operating temp via Eq 9)"
                    : "R = P_cu,rated / (3 \u00D7 I_rated\u00B2)",
                subst: ctx.R_provenance === "Measured"
                    ? "hotResistance(" + ctx.R_cold + ", " + ctx.T_cold + ", " + d.windingTempC.toFixed(0) + ")"
                    : lr.copperW.toFixed(0) + " / (3 \u00D7 " + motor.ratedCurrentA + "\u00B2)",
                result: ctx.R_used.toFixed(5) + " \u03A9",
                prov: ctx.R_provenance
            },
            {
                eq: ctx.I_provenance === "Measured" ? null : 20,
                name: "Operating Current",
                formula: ctx.I_provenance === "Measured"
                    ? "I_measured = " + op.lineCurrentA + " A (user-supplied)"
                    : "I(L) = I_rated \u00D7 (NL% / 100) + (I_rated \u2212 I_rated \u00D7 NL% / 100) \u00D7 L",
                subst: ctx.I_provenance === "Measured"
                    ? "Direct measurement"
                    : motor.ratedCurrentA + " \u00D7 " + (motor.assumptions.noLoadCurrentPct / 100).toFixed(2) +
                      " + (" + motor.ratedCurrentA + " \u2212 " + (motor.ratedCurrentA * motor.assumptions.noLoadCurrentPct / 100).toFixed(1) +
                      ") \u00D7 " + (op.loadPercent / 100).toFixed(2),
                result: ctx.I_op.toFixed(1) + " A",
                prov: ctx.I_provenance
            },
            {
                eq: 1, name: "Copper Loss",
                formula: "P_cu = 3 \u00D7 I\u00B2 \u00D7 R",
                subst: "3 \u00D7 " + ctx.I_op.toFixed(1) + "\u00B2 \u00D7 " + ctx.R_used.toFixed(5),
                result: losses.copperW.toFixed(0) + " W",
                prov: "Calculated"
            },
            {
                eq: 2, name: "Core Loss",
                formula: "P_core = P_core,rated \u00D7 (V/V_rated)\u00B2 \u00D7 (f/f_rated)^1.5",
                subst: lr.coreW.toFixed(0) + " \u00D7 (" + op.lineVoltageV + "/" + motor.ratedVoltageV +
                       ")\u00B2 \u00D7 (" + op.frequencyHz + "/" + motor.ratedFrequencyHz + ")^1.5",
                result: losses.coreW.toFixed(0) + " W",
                prov: "Calculated"
            },
            {
                eq: 3, name: "Mechanical Loss",
                formula: "P_mech = P_mech,rated \u00D7 (n/n_rated)^2.5",
                subst: lr.mechanicalW.toFixed(0) + " \u00D7 (" + ctx.n_op.toFixed(0) + "/" + motor.ratedSpeedRpm + ")^2.5",
                result: losses.mechanicalW.toFixed(0) + " W",
                prov: "Calculated"
            },
            {
                eq: 4, name: "Stray Load Loss",
                formula: "P_stray = P_stray,rated \u00D7 (I/I_rated)\u00B2",
                subst: lr.strayW.toFixed(0) + " \u00D7 (" + ctx.I_op.toFixed(0) + "/" + motor.ratedCurrentA + ")\u00B2",
                result: losses.strayW.toFixed(0) + " W",
                prov: "Calculated"
            },
            {
                eq: 5, name: "Total Losses",
                formula: "P_total = P_cu + P_core + P_mech + P_stray",
                subst: losses.copperW.toFixed(0) + " + " + losses.coreW.toFixed(0) + " + " +
                       losses.mechanicalW.toFixed(0) + " + " + losses.strayW.toFixed(0),
                result: losses.totalW.toFixed(0) + " W (" + (losses.totalW / 1000).toFixed(2) + " kW)",
                prov: "Calculated"
            },
            {
                eq: 18, name: "Rated Temperature Rise",
                formula: "\u0394\u03B8_rated = T_class_max \u2212 40 \u2212 hot-spot allowance",
                subst: MTDT.motorModel.getInsulationLimit(motor.insulationClass) + " \u2212 40 \u2212 " + motor.assumptions.hotSpotAllowanceK,
                result: ctx.riseLimitK.toFixed(0) + " K",
                prov: "Derived"
            },
            {
                eq: 16, name: "Thermal Conductance",
                formula: "G_th = \u0394\u03B8_rated / P_loss_total,rated",
                subst: ctx.riseLimitK.toFixed(0) + " / " + lr.totalW.toFixed(0),
                result: ctx.Gth.toFixed(5) + " K/W",
                prov: "Derived"
            },
            {
                eq: 15, name: "Thermal Time Constant",
                formula: "\u03C4 = 1200 \u00D7 \u221A(P_rated_kW)",
                subst: "1200 \u00D7 \u221A" + motor.ratedPowerKW,
                result: ctx.tau.toFixed(0) + " s (" + tauMin + " min)",
                prov: "Typical"
            },
            {
                eq: 11, name: "Voltage Imbalance Derating",
                formula: "D(u) = piecewise per NEMA MG-1",
                subst: "u = " + op.voltageImbalancePct + "%",
                result: ctx.derating.toFixed(3) + " (\u0394\u03B8_limit \u00D7 D = " + ctx.riseLimitK_effective.toFixed(1) + " K)",
                prov: "Derived"
            },
            {
                eq: 10, name: "Cooling Effectiveness",
                formula: "\u03B7_cool = clamp((n/n_rated)^p, 0.20, 1.0)",
                subst: "type=" + motor.coolingType + ", ratio=" + ctx.speedRatio.toFixed(3),
                result: ctx.etaCool.toFixed(3),
                prov: "Derived"
            },
            {
                eq: 21, name: "Effective Conductance",
                formula: "G_th_eff = G_th / \u03B7_cool",
                subst: ctx.Gth.toFixed(5) + " / " + ctx.etaCool.toFixed(3),
                result: ctx.Gth_eff.toFixed(5) + " K/W",
                prov: "Calculated"
            },
            {
                eq: 22, name: "Thermal State Advance",
                formula: "\u03B8_ss = P_total \u00D7 G_th_eff ; \u03B8_now = \u03B8_ss \u2212 (\u03B8_ss \u2212 \u03B8_0) \u00D7 e^(\u2212t/\u03C4)",
                subst: losses.totalW.toFixed(0) + " \u00D7 " + ctx.Gth_eff.toFixed(5) + " ; t=" + (ctx.elapsedS / 3600).toFixed(2) + "h, \u03B8_0=" + d.theta0.toFixed(1),
                result: "\u03B8_ss=" + d.thetaSS.toFixed(1) + " K, \u03B8_now=" + d.thetaNow.toFixed(1) + " K, T_winding=" + d.windingTempC.toFixed(1) + "\u00B0C",
                prov: "Estimated"
            },
            {
                eq: 12, name: "Thermal Utilization",
                formula: "U = (\u03B8_actual / \u03B8_limit,eff) \u00D7 100",
                subst: d.thetaNow.toFixed(1) + " / " + ctx.riseLimitK_effective.toFixed(1),
                result: d.utilizationPct.toFixed(1) + "%",
                prov: "Calculated"
            },
            {
                eq: 24, name: "Thermal Margin",
                formula: "margin = \u03B8_limit,eff \u2212 \u03B8_actual",
                subst: ctx.riseLimitK_effective.toFixed(1) + " \u2212 " + d.thetaNow.toFixed(1),
                result: d.marginK.toFixed(1) + " K",
                prov: "Calculated"
            },
            {
                eq: 23, name: "Predicted Trip Time",
                formula: "t_trip = \u2212\u03C4 \u00D7 ln((\u03B8_ss \u2212 \u03B8_limit) / (\u03B8_ss \u2212 \u03B8_0))",
                subst: "\u03B8_ss=" + d.thetaSS.toFixed(1) + ", \u03B8_limit=" + ctx.riseLimitK_effective.toFixed(1) + ", \u03B8_0=" + d.theta0.toFixed(1),
                result: (function () {
                    var t = MTDT.thermalModel.predictTripTime(
                        ctx.thermalResult.state, d.thetaSS, ctx.riseLimitK_effective, ctx.tau);
                    if (!isFinite(t)) { return "\u221E (no trip predicted)"; }
                    if (t === 0) { return "0 (already at/over limit)"; }
                    return (t / 60).toFixed(1) + " min";
                })(),
                prov: "Estimated"
            },
            {
                eq: 25, name: "Frame Temperature",
                formula: "T_frame = T_ambient + k_frame \u00D7 \u0394\u03B8_winding",
                subst: op.ambientTempC + " + 0.6 \u00D7 " + d.thetaNow.toFixed(1),
                result: MTDT.thermalModel.getFrameTemperature(ctx.thermalResult.state).toFixed(1) + "\u00B0C",
                prov: "Typical"
            },
            {
                eq: null, name: "Confidence Score",
                formula: "Rule-based scoring (base 65%, cap 95%)",
                subst: ctx.confidence.factors.filter(function (f) { return f.applied && f.delta !== 0; }).length + " factors applied",
                result: ctx.confidence.score + "%",
                prov: "Calculated"
            },
            {
                eq: null, name: "Diagnostics",
                formula: "Rule-based root-cause analysis (10 categories)",
                subst: "Operating point evaluated against 10 rules",
                result: ctx.diagnostics.length + " firing, " + ctx.diagnostics.filter(function (x) { return x.severity === "high"; }).length + " high",
                prov: "Derived"
            }
        ];

        var frag = document.createDocumentFragment();
        entries.forEach(function (e) {
            var li = document.createElement("li");
            li.className = "calctrace-item";

            var nameSpan = document.createElement("span");
            nameSpan.className = "calctrace-name";
            nameSpan.textContent = e.name;
            li.appendChild(nameSpan);

            if (e.eq) {
                var eqSpan = document.createElement("span");
                eqSpan.className = "calctrace-eq";
                eqSpan.textContent = "Eq " + e.eq;
                li.appendChild(eqSpan);
            }

            var provSpan = document.createElement("span");
            provSpan.className = "calctrace-prov " + provClass(e.prov);
            provSpan.textContent = e.prov;
            li.appendChild(provSpan);

            var formulaDiv = document.createElement("div");
            formulaDiv.className = "calctrace-formula";
            formulaDiv.textContent = e.formula;
            li.appendChild(formulaDiv);

            var substDiv = document.createElement("div");
            substDiv.className = "calctrace-formula";
            substDiv.textContent = "= " + e.subst;
            li.appendChild(substDiv);

            var resultDiv = document.createElement("div");
            resultDiv.className = "calctrace-result";
            resultDiv.textContent = "\u2192 " + e.result;
            li.appendChild(resultDiv);

            frag.appendChild(li);
        });
        list.appendChild(frag);

        var ts = new Date().toLocaleString();
        meta.textContent = "Pipeline executed at " + ts + " \u2014 " + entries.length +
                          " steps. Equations 1\u201325 + rule-based confidence & diagnostics.";
    }

    /* ==================================================================
       13. Diagnostics list
       ================================================================== */
    function renderDiagnostics(diag) {
        var list = document.getElementById("rootCauseList");
        if (!list) { return; }
        list.innerHTML = "";

        if (!diag || diag.length === 0) {
            var empty = document.createElement("li");
            empty.className = "root-cause-item root-cause-item--placeholder";
            empty.textContent = "No diagnostic concerns \u2014 operating point within safe limits.";
            list.appendChild(empty);
            return;
        }

        diag.forEach(function (d) {
            var li = document.createElement("li");
            li.className = "root-cause-item";
            li.setAttribute("data-severity", d.severity);
            li.setAttribute("data-cause-id", d.id);

            var header = document.createElement("div");
            header.className = "rc-item__header";
            var title = document.createElement("strong");
            title.className = "rc-item__title";
            title.textContent = d.cause;
            var score = document.createElement("span");
            score.className = "rc-item__score";
            score.textContent = "Likelihood " + d.likelihood + "% \u00B7 " + d.severity.toUpperCase();
            header.appendChild(title);
            header.appendChild(score);
            li.appendChild(header);

            if (d.evidence && d.evidence.length > 0) {
                var ev = document.createElement("div");
                ev.className = "rc-item__evidence";
                ev.textContent = d.evidence.join("; ");
                li.appendChild(ev);
            }
            if (d.recommendation) {
                var rec = document.createElement("div");
                rec.className = "rc-item__recommendation";
                rec.textContent = "\u2192 " + d.recommendation;
                li.appendChild(rec);
            }
            list.appendChild(li);
        });
    }

    /* ==================================================================
       14. Motor SVG visualization
       ================================================================== */
    function setColor(svg, selector, color) {
        var els = svg.querySelectorAll(selector);
        for (var i = 0; i < els.length; i++) { els[i].style.fill = color; }
    }

    function setText(svg, selector, text) {
        var el = svg.querySelector(selector);
        if (el) { el.textContent = text; }
    }

    function ensureTempLabels(svg) {
        if (svg.querySelector("#svgTempLabelWinding")) { return; }
        var ns = "http://www.w3.org/2000/svg";
        function makeLabel(id, x, y) {
            var t = document.createElementNS(ns, "text");
            t.setAttribute("id", id);
            t.setAttribute("x", x);
            t.setAttribute("y", y);
            t.setAttribute("class", "svg-temp-label");
            svg.appendChild(t);
        }
        makeLabel("svgTempLabelFrame",   100, 358);
        makeLabel("svgTempLabelWinding", 310, 358);
        makeLabel("svgTempLabelHotSpot", 530, 358);
    }

    function ensureHotSpot(svg) {
        var existing = svg.querySelector("#svgHotSpot");
        if (existing) { return existing; }
        var ns = "http://www.w3.org/2000/svg";
        var c = document.createElementNS(ns, "circle");
        c.setAttribute("id", "svgHotSpot");
        c.setAttribute("cx", "310");
        c.setAttribute("cy", "129");
        c.setAttribute("r", "4");
        c.setAttribute("class", "svg-hotspot");
        c.setAttribute("stroke", "rgba(0,0,0,0.55)");
        c.setAttribute("stroke-width", "0.8");
        svg.appendChild(c);
        return c;
    }

    function applyPulse(svg, utilizationPct) {
        var windings = svg.querySelectorAll(".part-winding");
        for (var m = 0; m < windings.length; m++) {
            windings[m].classList.remove("svg-pulse-alarm", "svg-pulse-caution");
            if (utilizationPct >= 100) { windings[m].classList.add("svg-pulse-alarm"); }
            else if (utilizationPct >= 80) { windings[m].classList.add("svg-pulse-caution"); }
        }
    }

    function applyRotation(svg, n_op) {
        var rotorGroup = svg.querySelector("#svgRotorGroup");
        var fanGroup = svg.querySelector("#svgFanGroup");
        if (!rotorGroup || !fanGroup) { return; }

        if (n_op > 10) {
            var durationSec = Math.max(0.3, 2960 / n_op);
            svg.style.setProperty("--spin-duration", durationSec + "s");
            rotorGroup.classList.add("svg-rotor-spin");
            fanGroup.classList.add("svg-fan-spin");
            rotorGroup.classList.remove("svg-spin-paused");
            fanGroup.classList.remove("svg-spin-paused");
        } else {
            rotorGroup.classList.add("svg-rotor-spin", "svg-spin-paused");
            fanGroup.classList.add("svg-fan-spin", "svg-spin-paused");
        }
    }

    function renderMotorViz(ctx) {
        var d = ctx.thermalResult.derived;
        var svg = document.getElementById("svgMotor");
        if (!svg) { return; }

        var windingTempC = d.windingTempC;
        var rotorTempC  = windingTempC * 1.05;
        var frameTempC  = MTDT.thermalModel.getFrameTemperature(ctx.thermalResult.state);

        setColor(svg, ".part-winding", tempToColor(windingTempC));
        setColor(svg, ".part-rotor",   tempToColor(rotorTempC));
        setColor(svg, ".part-stator",  tempToColor(frameTempC));

        applyRotation(svg, ctx.n_op || 0);
        applyPulse(svg, d.utilizationPct);

        var hotSpotAllowance = ctx.motor.assumptions.hotSpotAllowanceK;
        var hotSpotTempC = windingTempC + hotSpotAllowance;
        var hotspot = ensureHotSpot(svg);
        hotspot.style.fill = tempToColor(hotSpotTempC);

        ensureTempLabels(svg);
        setText(svg, "#svgTempLabelWinding", "Winding: " + windingTempC.toFixed(0) + "\u00B0C");
        setText(svg, "#svgTempLabelFrame",   "Frame: "   + frameTempC.toFixed(0)   + "\u00B0C");
        setText(svg, "#svgTempLabelHotSpot", "Hot-spot: " + hotSpotTempC.toFixed(0) + "\u00B0C");

        var tmax = MTDT.motorModel.getInsulationLimit(ctx.motor.insulationClass);
        var maxEl = document.getElementById("vizLegendMax");
        if (maxEl) { maxEl.textContent = tmax + "\u00B0C"; }
    }

    function updateMotorVizLive(simState) {
        var svg = document.getElementById("svgMotor");
        if (!svg || !simState) { return; }

        var windingTempC = simState.windingTempC;
        setColor(svg, ".part-winding", tempToColor(windingTempC));
        setColor(svg, ".part-rotor",   tempToColor(windingTempC * 1.05));

        applyPulse(svg, simState.utilizationPct);

        ensureTempLabels(svg);
        setText(svg, "#svgTempLabelWinding", "Winding: " + windingTempC.toFixed(0) + "\u00B0C");

        var hotspot = svg.querySelector("#svgHotSpot");
        if (hotspot) {
            var allow = (MTDT.state.motor && MTDT.state.motor.assumptions)
                ? MTDT.state.motor.assumptions.hotSpotAllowanceK : 10;
            hotspot.style.fill = tempToColor(windingTempC + allow);
            setText(svg, "#svgTempLabelHotSpot",
                    "Hot-spot: " + (windingTempC + allow).toFixed(0) + "\u00B0C");
        }
    }

    /* ==================================================================
       15. Status badge from utilization + diagnostics
       (Named renderStatusFromResults to avoid colliding with the
        badge-only renderStatus() declared earlier in this file.)
       ================================================================== */
    function renderStatusFromResults(ctx) {
        var d = ctx.thermalResult.derived;
        var diag = ctx.diagnostics;
        var hasHigh = diag.some(function (x) { return x.severity === "high" && x.fires; });
        var hasMedium = diag.some(function (x) { return x.severity === "medium" && x.fires; });

        var kind, text;
        if (d.utilizationPct >= 100 || hasHigh) {
            kind = "alarm"; text = "ALARM";
        } else if (d.utilizationPct >= 80 || hasMedium) {
            kind = "caution"; text = "CAUTION";
        } else {
            kind = "normal"; text = "NORMAL";
        }
        setStatus(kind, text);
    }

    /* ==================================================================
       16. Init + public surface
       ================================================================== */
    function init() {
        var missing = 0;
        FIELDS.forEach(function (def) {
            def.el = document.getElementById(def.id);
            if (!def.el) {
                missing += 1;
                console.warn("[MTDT] ui.js: element not found in DOM: " + def.id);
                return;
            }
            def.el.addEventListener("change", onFieldChange);
        });

        var chk = document.getElementById("chkAutoCurrent");
        if (chk) { chk.addEventListener("change", onFieldChange); }

        captureDefaults();
        wireCalcToggles();

        var btnReset = document.getElementById("btnResetInputs");
        if (btnReset) { btnReset.addEventListener("click", resetInputs); }

        validateAll();
        renderFieldStates();
        renderStatus();

        console.info("[MTDT] ui.js initialized \u2014 " + (FIELDS.length - missing) +
            " fields registered, defaults captured, " + errorCount + " validation errors.");
    }

    MTDT.ui = {
        init: init,
        readMotor: readMotor,
        readOperatingData: readOperatingData,
        readSimConfig: readSimConfig,
        setStatus: setStatus,
        setKpi: setKpi,
        clearKpis: clearKpis,
        showCalculation: showCalculation,
        isAutoCurrent: isAutoCurrent,
        resetInputs: resetInputs,
        renderResults: renderResults,
        updateMotorVizLive: updateMotorVizLive
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
