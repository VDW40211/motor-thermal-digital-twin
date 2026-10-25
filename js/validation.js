/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/validation.js
   STEP 19 / PHASE 13 — Automated validation suite.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    function validFinite(x) { return typeof x === "number" && isFinite(x); }
    function warn(msg) { console.warn("[MTDT.validation] " + msg); }

    function approx(actual, expected, tolerance) {
        if (!validFinite(actual) || !validFinite(expected)) { return false; }
        return Math.abs(actual - expected) <= tolerance;
    }

    function approxRel(actual, expected, relTolerance) {
        if (!validFinite(actual) || !validFinite(expected)) { return false; }
        return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9) <= relTolerance;
    }

    function buildContext(motor, op, options) {
        options = options || {};
        var startCold = options.startCold !== false;

        var ratedPowerW = motor.ratedPowerKW * 1000;
        var efficiency = motor.efficiencyPercent / 100;
        var shares = {
            copper: motor.assumptions.copperSharePct / 100,
            core:   motor.assumptions.coreSharePct   / 100,
            mech:   motor.assumptions.mechSharePct   / 100,
            stray:  motor.assumptions.straySharePct  / 100
        };
        var lossesRated = MTDT.motorModel.segregateLosses(ratedPowerW, efficiency, shares);
        if (!lossesRated) { return null; }

        var R_used, R_provenance, R_cold = null, T_cold = null;
        if (motor.measured && motor.measured.resistanceOhm) {
            R_cold = motor.measured.resistanceOhm;
            T_cold = motor.measured.measuredAtC;
            R_used = R_cold;
            R_provenance = "Measured";
        } else {
            R_used = MTDT.motorModel.estimateResistance(lossesRated.copperW, motor.ratedCurrentA);
            R_provenance = "Estimated";
        }

        var I_op = op.currentIsEstimated
            ? MTDT.motorModel.estimateCurrent(op.loadPercent / 100, motor.ratedCurrentA, motor.assumptions.noLoadCurrentPct)
            : op.lineCurrentA;
        var I_provenance = op.currentIsEstimated ? "Estimated" : "Measured";

        var n_op = MTDT.rootCause.estimateOperatingSpeed(motor, op);

        var Pcu    = MTDT.physics.copperLoss(I_op, R_used);
        var Pcore  = MTDT.physics.coreLoss(op.lineVoltageV, op.frequencyHz,
                                            lossesRated.coreW, motor.ratedVoltageV, motor.ratedFrequencyHz);
        var Pmech  = MTDT.physics.mechanicalLoss(n_op, motor.ratedSpeedRpm, lossesRated.mechanicalW);
        var Pstray = MTDT.physics.strayLoadLoss(I_op, motor.ratedCurrentA, lossesRated.strayW);
        var Ptotal = MTDT.physics.totalLosses(Pcu, Pcore, Pmech, Pstray);

        var riseLimitK = MTDT.motorModel.calculateRatedTempRise(
            motor.insulationClass, motor.assumptions.hotSpotAllowanceK);
        var Gth = MTDT.motorModel.estimateThermalConductance(riseLimitK, lossesRated.totalW);
        var tau = MTDT.motorModel.estimateThermalTimeConstant(motor.ratedPowerKW);
        var derating = MTDT.physics.voltageImbalanceDerating(op.voltageImbalancePct);
        var riseLimitK_effective = riseLimitK * derating;
        var speedRatio = n_op / motor.ratedSpeedRpm;
        var etaCool = MTDT.physics.coolingEffectiveness(motor.coolingType, speedRatio);

        var thermalState = startCold
            ? MTDT.thermalModel.createInitialState()
            : (MTDT.state.thermalState || MTDT.thermalModel.createInitialState());

        var elapsedS = op.runtimeHours * 3600;
        var result = MTDT.thermalModel.updateThermalState(thermalState, {
            Ptotal: Ptotal, Gth: Gth, coolingEffective: etaCool,
            tau: tau, ambientC: op.ambientTempC,
            riseLimitK: riseLimitK_effective, elapsedS: elapsedS
        });

        if (motor.measured && motor.measured.resistanceOhm) {
            var T_winding_est = op.ambientTempC + result.derived.thetaNow;
            R_used = MTDT.physics.hotResistance(R_cold, T_cold, T_winding_est);
            Pcu = MTDT.physics.copperLoss(I_op, R_used);
            Ptotal = MTDT.physics.totalLosses(Pcu, Pcore, Pmech, Pstray);
            result = MTDT.thermalModel.updateThermalState(thermalState, {
                Ptotal: Ptotal, Gth: Gth, coolingEffective: etaCool,
                tau: tau, ambientC: op.ambientTempC,
                riseLimitK: riseLimitK_effective, elapsedS: elapsedS
            });
        }

        var conf = MTDT.confidence.compute(motor, op);
        var losses = { copperW: Pcu, coreW: Pcore, mechanicalW: Pmech, strayW: Pstray, totalW: Ptotal };
        var diag = MTDT.rootCause.analyze({
            motor: motor, op: op, derived: result.derived, losses: losses,
            riseLimitK: riseLimitK_effective, coolingType: motor.coolingType,
            operatingSpeed: n_op
        });

        return {
            motor: motor, op: op, losses: losses, lossesRated: lossesRated,
            R_used: R_used, R_provenance: R_provenance,
            I_op: I_op, I_provenance: I_provenance, n_op: n_op,
            riseLimitK: riseLimitK, riseLimitK_effective: riseLimitK_effective,
            derating: derating, Gth: Gth, Gth_eff: result.state.GthEffective,
            tau: tau, etaCool: etaCool, speedRatio: speedRatio,
            thermalResult: result, confidence: conf, diagnostics: diag,
            elapsedS: elapsedS
        };
    }

    function defaultMotor() {
        return {
            designation: "TEST-MOTOR",
            ratedPowerKW: 75, ratedVoltageV: 400, ratedCurrentA: 130,
            ratedFrequencyHz: 50, ratedSpeedRpm: 1480,
            efficiencyPercent: 93, serviceFactor: 1.0,
            insulationClass: "F", coolingType: "TEFC",
            assumptions: {
                copperSharePct: 60, coreSharePct: 20, mechSharePct: 10, straySharePct: 10,
                hotSpotAllowanceK: 10, noLoadCurrentPct: 30
            },
            measured: null
        };
    }

    function defaultOp() {
        return {
            loadPercent: 100, lineCurrentA: null, currentIsEstimated: true,
            lineVoltageV: 400, frequencyHz: 50, ambientTempC: 40,
            voltageImbalancePct: 0, startsPerHour: 0, runtimeHours: 8
        };
    }

    function check(name, actual, expected, tolerance, isRelative) {
        var pass = isRelative
            ? approxRel(actual, expected, tolerance)
            : approx(actual, expected, tolerance);
        return {
            name: name,
            actual: actual,
            expected: expected,
            tolerance: tolerance,
            pass: pass
        };
    }

    function checkLT(name, actual, threshold) {
        var pass = validFinite(actual) && actual < threshold;
        return { name: name, actual: actual, expected: "< " + threshold, tolerance: 0, pass: pass };
    }

    function checkGT(name, actual, threshold) {
        var pass = validFinite(actual) && actual > threshold;
        return { name: name, actual: actual, expected: "> " + threshold, tolerance: 0, pass: pass };
    }

    function checkEq(name, actual, expected) {
        return { name: name, actual: actual, expected: expected, tolerance: 0, pass: actual === expected };
    }

    function checkIncludes(name, array, predicate) {
        var found = array.some(predicate);
        return { name: name, actual: found ? "found" : "not found", expected: "found", tolerance: 0, pass: found };
    }

    function test1_ratedCondition() {
        var motor = defaultMotor();
        var op = defaultOp();
        var ctx = buildContext(motor, op);
        if (!ctx) { return { name: "Rated Condition", pass: false, checks: [], error: "Pipeline failed" }; }

        var d = ctx.thermalResult.derived;
        var checks = [
            check("Total losses (W)",     ctx.losses.totalW,   5645, 10),
            check("Copper loss (W)",       ctx.losses.copperW, 3387, 10),
            check("Operating current (A)", ctx.I_op,           130,  0.01),
            check("Stator resistance (Ω)", ctx.R_used,        0.0668, 0.001),
            check("Rise limit (K)",        ctx.riseLimitK,    105,  0.01),
            check("Thermal conductance (K/W)", ctx.Gth,        0.01860, 0.0001),
            check("Time constant (s)",     ctx.tau,            10392, 1),
            check("Steady-state rise (K)",  d.thetaSS,         105,  0.5),
            check("Current rise (K)",       d.thetaNow,        98.4, 1.0),
            check("Winding temp (°C)",      d.windingTempC,    138.4, 1.0),
            check("Utilization (%)",        d.utilizationPct,  93.7, 1.0),
            check("Margin (K)",             d.marginK,         6.6,  1.0),
            check("Confidence (%)",         ctx.confidence.score, 89, 0),
            checkEq("Diagnostics firing",   ctx.diagnostics.length, 0)
        ];

        return {
            name: "Rated Condition",
            description: "75 kW, 400 V, 130 A, 50 Hz, 1480 rpm, 93% eff, SF 1.0, Class F, TEFC. 100% load, 40°C ambient, 8h runtime.",
            checks: checks,
            pass: checks.every(function (c) { return c.pass; })
        };
    }

    function test2_noLoad() {
        var motor = defaultMotor();
        var op = defaultOp();
        op.loadPercent = 0;
        var ctx = buildContext(motor, op);
        if (!ctx) { return { name: "No Load", pass: false, checks: [], error: "Pipeline failed" }; }

        var d = ctx.thermalResult.derived;
        var checks = [
            check("Operating current (A)",  ctx.I_op,           39,   0.01),
            checkLT("Copper loss (W)",       ctx.losses.copperW, 500),
            checkLT("Total losses (W)",      ctx.losses.totalW,  2500),
            checkLT("Steady-state rise (K)", d.thetaSS,         50),
            checkLT("Winding temp (°C)",     d.windingTempC,    100),
            checkLT("Utilization (%)",       d.utilizationPct, 50)
        ];

        return {
            name: "No Load",
            description: "Same motor at 0% load. Expected: very low copper loss (< 500 W vs 3387 W rated), utilization < 50%.",
            checks: checks,
            pass: checks.every(function (c) { return c.pass; })
        };
    }

    function test3_overload() {
        var motor = defaultMotor();
        var op = defaultOp();
        op.loadPercent = 150;
        var ctx = buildContext(motor, op);
        if (!ctx) { return { name: "Overload 150%", pass: false, checks: [], error: "Pipeline failed" }; }

        var d = ctx.thermalResult.derived;
        var checks = [
            check("Operating current (A)",  ctx.I_op,           175.5, 0.01),
            checkGT("Copper loss (W)",       ctx.losses.copperW, 5000),
            checkGT("Steady-state rise (K)", d.thetaSS,         140),
            checkGT("Utilization (%)",       d.utilizationPct,  100),
            checkLT("Margin (K)",            d.marginK,         0),
            checkIncludes("Overload diagnostic fires",
                ctx.diagnostics,
                function (dg) { return dg.id === "overload" && dg.severity === "high"; }),
            checkIncludes("Mechanical overload fires",
                ctx.diagnostics,
                function (dg) { return dg.id === "mechanical-overload"; })
        ];

        return {
            name: "Overload 150%",
            description: "Same motor at 150% load. Expected: copper loss > 5000 W, utilization > 100%, margin < 0 K, overload + mechanical-overload diagnostics fire.",
            checks: checks,
            pass: checks.every(function (c) { return c.pass; })
        };
    }

    function test4_lowSpeed() {
        var motor = defaultMotor();
        var op = defaultOp();
        op.loadPercent = 80;
        op.lineVoltageV = 200;
        op.frequencyHz = 25;
        var ctx = buildContext(motor, op);
        if (!ctx) { return { name: "Low Speed 25 Hz", pass: false, checks: [], error: "Pipeline failed" }; }

        var d = ctx.thermalResult.derived;
        var checks = [
            check("Operating speed (rpm)",  ctx.n_op,          742,  5),
            check("Speed ratio",             ctx.speedRatio,   0.50, 0.02),
            checkLT("Cooling effectiveness", ctx.etaCool,      0.50),
            checkGT("Steady-state rise (K)", d.thetaSS,        140),
            checkGT("Utilization (%)",       d.utilizationPct, 100),
            checkIncludes("Low-speed-cooling fires",
                ctx.diagnostics,
                function (dg) { return dg.id === "low-speed-cooling" && dg.fires; })
        ];

        return {
            name: "Low Speed 25 Hz (TEFC)",
            description: "Same motor at 80% load, 200 V, 25 Hz (constant V/Hz). Expected: cooling < 0.50, utilization > 100%, low-speed-cooling diagnostic fires.",
            checks: checks,
            pass: checks.every(function (c) { return c.pass; })
        };
    }

    function test5_highAmbient() {
        var motor = defaultMotor();
        var op = defaultOp();
        op.ambientTempC = 55;
        var ctx = buildContext(motor, op);
        if (!ctx) { return { name: "High Ambient", pass: false, checks: [], error: "Pipeline failed" }; }

        var d = ctx.thermalResult.derived;
        var checks = [
            checkGT("Winding temp (°C)", d.windingTempC, 150),
            check("Utilization (%)",      d.utilizationPct, 93.7, 1.0),
            checkIncludes("High-ambient fires",
                ctx.diagnostics,
                function (dg) { return dg.id === "high-ambient" && dg.fires; }),
            checkIncludes("High-ambient severity high",
                ctx.diagnostics,
                function (dg) { return dg.id === "high-ambient" && dg.severity === "high"; })
        ];

        return {
            name: "High Ambient (55°C)",
            description: "Same motor at 100% load, ambient 55°C (> 40°C reference). Expected: winding temp > 150°C, high-ambient diagnostic fires with high severity.",
            checks: checks,
            pass: checks.every(function (c) { return c.pass; })
        };
    }

    function test6_timeConstant() {
        var chk = MTDT.thermalModel.validateTimeConstantCheckpoints();
        var checks = [
            check("1τ reaches 63.2%", chk.at1tau, 0.632, 0.001),
            check("3τ reaches 95.0%", chk.at3tau, 0.950, 0.001),
            check("5τ reaches 99.3%", chk.at5tau, 0.993, 0.001)
        ];

        return {
            name: "Thermal Time Constant Checkpoints",
            description: "Verifies first-order response: 1τ → 63.2%, 3τ → 95.0%, 5τ → 99.3% of steady-state.",
            checks: checks,
            pass: checks.every(function (c) { return c.pass; })
        };
    }

    function runAll() {
        console.info("[MTDT] Validation suite starting...");
        var tests = [
            test1_ratedCondition,
            test2_noLoad,
            test3_overload,
            test4_lowSpeed,
            test5_highAmbient,
            test6_timeConstant
        ];

        var results = tests.map(function (testFn) {
            try {
                return testFn();
            } catch (e) {
                return {
                    name: testFn.name,
                    pass: false,
                    error: e.message,
                    checks: []
                };
            }
        });

        var passCount = results.filter(function (r) { return r.pass; }).length;
        var totalCount = results.length;
        var overall = passCount === totalCount ? "pass" : (passCount > 0 ? "partial" : "fail");

        console.info("[MTDT] Validation complete: " + passCount + "/" + totalCount + " tests passed.");
        results.forEach(function (r) {
            var status = r.pass ? "PASS" : "FAIL";
            console.info("  [" + status + "] " + r.name);
            if (!r.pass && r.checks) {
                r.checks.forEach(function (c) {
                    if (!c.pass) {
                        console.warn("    FAIL: " + c.name + " — expected " + c.expected +
                                   ", got " + c.actual + " (tol " + c.tolerance + ")");
                    }
                });
            }
        });

        render(results, overall, passCount, totalCount);

        return { results: results, overall: overall, passCount: passCount, totalCount: totalCount };
    }

    function render(results, overall, passCount, totalCount) {
        var summary = document.getElementById("validationSummary");
        var list = document.getElementById("validationList");
        if (!summary || !list) { return; }

        summary.setAttribute("data-state", overall);
        summary.textContent = "Validation: " + passCount + "/" + totalCount + " tests passed. " +
            (overall === "pass" ? "All checks OK." :
             overall === "partial" ? "Some tests failed — see details below." :
             "All tests failed — see details below.");

        list.innerHTML = "";
        results.forEach(function (r, idx) {
            var li = document.createElement("li");
            li.className = "validation-item";
            li.setAttribute("data-pass", r.pass ? "true" : "false");

            var header = document.createElement("div");
            header.className = "validation-item__header";

            var num = document.createElement("span");
            num.className = "validation-item__num";
            num.textContent = "TEST " + String(idx + 1).padStart(2, "0");
            header.appendChild(num);

            var name = document.createElement("span");
            name.className = "validation-item__name";
            name.textContent = r.name;
            header.appendChild(name);

            var badge = document.createElement("span");
            badge.className = "validation-item__badge " + (r.pass ? "validation-item__badge--pass" : "validation-item__badge--fail");
            badge.textContent = r.pass ? "PASS" : "FAIL";
            header.appendChild(badge);

            li.appendChild(header);

            if (r.description) {
                var desc = document.createElement("div");
                desc.className = "validation-item__desc";
                desc.textContent = r.description;
                li.appendChild(desc);
            }

            if (r.error) {
                var err = document.createElement("div");
                err.className = "validation-item__desc";
                err.style.color = "var(--alarm)";
                err.textContent = "Error: " + r.error;
                li.appendChild(err);
            }

            if (r.checks && r.checks.length > 0) {
                var ul = document.createElement("ul");
                ul.className = "validation-checks";
                r.checks.forEach(function (c) {
                    var ci = document.createElement("li");
                    ci.className = "validation-check";
                    var icon = document.createElement("span");
                    icon.className = "validation-check__icon " + (c.pass ? "validation-check__icon--pass" : "validation-check__icon--fail");
                    icon.textContent = c.pass ? "✓" : "✗";
                    var text = document.createElement("span");
                    text.className = "validation-check__text";
                    text.innerHTML = "<strong>" + c.name + ":</strong> expected " + c.expected +
                        ", got " + (typeof c.actual === "number" ? c.actual.toFixed(4) : c.actual) +
                        (c.tolerance > 0 ? " (±" + c.tolerance + ")" : "");
                    ci.appendChild(icon);
                    ci.appendChild(text);
                    ul.appendChild(ci);
                });
                li.appendChild(ul);
            }

            list.appendChild(li);
        });
    }

    MTDT.validation = {
        runAll: runAll,
        buildContext: buildContext,
        tests: {
            test1_ratedCondition: test1_ratedCondition,
            test2_noLoad: test2_noLoad,
            test3_overload: test3_overload,
            test4_lowSpeed: test4_lowSpeed,
            test5_highAmbient: test5_highAmbient,
            test6_timeConstant: test6_timeConstant
        }
    };

    console.info("[MTDT] validation.js loaded (6 spec-defined tests)");

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
