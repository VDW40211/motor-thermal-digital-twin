/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/app.js
   STEP 3 + 11 + 13 + 15 + 18 + 19 — Central controller.

   ROLE
   - Namespace bootstrap, central state, app-level wiring (theme, input
     coordination), initialization, estimate pipeline, simulation
     controller, auto-run, persistence, validation wiring.

   LOAD ORDER: loads LAST, orchestrates everything.

   RULES:
   - No engineering calculations (they belong in physics/…/thermalModel).
   - One central state object; no loose global variables.
   - DOM work is limited to app-level wiring; rendering lives in ui.js.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};
    MTDT.VERSION = "0.1.0";

    /* ==================================================================
       1. Safe localStorage wrapper
       ================================================================== */
    var STORAGE_PREFIX = "mtdt.";

    MTDT.storage = {
        available: (function () {
            try {
                var k = STORAGE_PREFIX + "__probe__";
                global.localStorage.setItem(k, "1");
                global.localStorage.removeItem(k);
                return true;
            } catch (e) {
                return false;
            }
        }()),

        get: function (key, fallback) {
            if (!this.available) { return fallback; }
            try {
                var raw = global.localStorage.getItem(STORAGE_PREFIX + key);
                return (raw === null) ? fallback : JSON.parse(raw);
            } catch (e) {
                return fallback;
            }
        },

        set: function (key, value) {
            if (!this.available) { return false; }
            try {
                global.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
                return true;
            } catch (e) {
                return false;
            }
        },

        remove: function (key) {
            if (!this.available) { return false; }
            try {
                global.localStorage.removeItem(STORAGE_PREFIX + key);
                return true;
            } catch (e) {
                return false;
            }
        }
    };

    /* ==================================================================
       2. Central application state
       ================================================================== */
    MTDT.state = {
        version: MTDT.VERSION,
        motor: null,
        operatingData: null,
        thermalState: {
            riseK: 0,
            ambientC: null,
            lastUpdate: null,
            initialized: false
        },
        calculatedLosses: null,
        temperature: null,
        confidence: null,
        rootCauses: [],
        simulation: {
            running: false,
            paused: false,
            durationMin: 60,
            stepS: 5,
            elapsedMin: 0,
            series: null
        },
        preferences: {
            theme: "light"
        },
        lastEstimateAt: null
    };

    /* ==================================================================
       3. Theme handling
       ================================================================== */
    function applyTheme(theme) {
        var t = (theme === "dark") ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", t);
        MTDT.state.preferences.theme = t;
    }

    function initTheme() {
        var stored = MTDT.storage.get("theme", null);
        if (stored === "light" || stored === "dark") {
            applyTheme(stored);
            return;
        }
        var prefersDark = false;
        try {
            prefersDark = global.matchMedia &&
                global.matchMedia("(prefers-color-scheme: dark)").matches;
        } catch (e) { /* non-fatal */ }
        applyTheme(prefersDark ? "dark" : "light");
    }

    function toggleTheme() {
        var next = (MTDT.state.preferences.theme === "dark") ? "light" : "dark";
        applyTheme(next);
        MTDT.storage.set("theme", next);
    }

    /* ==================================================================
       4. Input coordination
       ================================================================== */
    function wireAutoCurrent() {
        var chk = document.getElementById("chkAutoCurrent");
        var inp = document.getElementById("inpLineCurrent");
        if (!chk || !inp) { return; }

        function sync() {
            inp.disabled = chk.checked;
        }
        chk.addEventListener("change", sync);
        sync();
    }

    /* ==================================================================
       5. Estimate pipeline
       ================================================================== */
    function runEstimate() {
        var m = MTDT.ui.readMotor();
        var o = MTDT.ui.readOperatingData();
        if (!m.ok || !o.ok) {
            MTDT.ui.setStatus("caution", "CHECK INPUTS");
            MTDT.ui.clearKpis("Fix input errors first");
            return null;
        }
        var motor = m.motor;
        var op = o.data;

        var ratedPowerW = motor.ratedPowerKW * 1000;
        var efficiency = motor.efficiencyPercent / 100;
        var shares = {
            copper: motor.assumptions.copperSharePct / 100,
            core:   motor.assumptions.coreSharePct   / 100,
            mech:   motor.assumptions.mechSharePct   / 100,
            stray:  motor.assumptions.straySharePct  / 100
        };
        var lossesRated = MTDT.motorModel.segregateLosses(ratedPowerW, efficiency, shares);
        if (!lossesRated) {
            MTDT.ui.setStatus("alarm", "CALC ERROR");
            return null;
        }

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

        var I_op, I_provenance;
        if (op.currentIsEstimated) {
            I_op = MTDT.motorModel.estimateCurrent(
                op.loadPercent / 100, motor.ratedCurrentA, motor.assumptions.noLoadCurrentPct);
            I_provenance = "Estimated";
        } else {
            I_op = op.lineCurrentA;
            I_provenance = "Measured";
        }

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

        var elapsedS = op.runtimeHours * 3600;
        var result = MTDT.thermalModel.updateThermalState(MTDT.state.thermalState, {
            Ptotal: Ptotal, Gth: Gth, coolingEffective: etaCool,
            tau: tau, ambientC: op.ambientTempC,
            riseLimitK: riseLimitK_effective, elapsedS: elapsedS
        });

        if (motor.measured && motor.measured.resistanceOhm) {
            var T_winding_est = op.ambientTempC + result.derived.thetaNow;
            R_used = MTDT.physics.hotResistance(R_cold, T_cold, T_winding_est);
            Pcu = MTDT.physics.copperLoss(I_op, R_used);
            Ptotal = MTDT.physics.totalLosses(Pcu, Pcore, Pmech, Pstray);
            result = MTDT.thermalModel.updateThermalState(MTDT.state.thermalState, {
                Ptotal: Ptotal, Gth: Gth, coolingEffective: etaCool,
                tau: tau, ambientC: op.ambientTempC,
                riseLimitK: riseLimitK_effective, elapsedS: elapsedS
            });
        }

        MTDT.state.thermalState = result.state;

        var conf = MTDT.confidence.compute(motor, op);
        MTDT.state.confidence = conf;

        var losses = { copperW: Pcu, coreW: Pcore, mechanicalW: Pmech, strayW: Pstray, totalW: Ptotal };
        var diag = MTDT.rootCause.analyze({
            motor: motor, op: op, derived: result.derived, losses: losses,
            riseLimitK: riseLimitK_effective, coolingType: motor.coolingType,
            operatingSpeed: n_op
        });
        MTDT.state.rootCauses = diag;

        MTDT.state.motor = motor;
        MTDT.state.operatingData = op;
        MTDT.state.calculatedLosses = losses;
        MTDT.state.temperature = result.derived;
        MTDT.state.lastEstimateAt = new Date().toISOString();

        var ctx = {
            motor: motor, op: op, losses: losses, lossesRated: lossesRated,
            R_used: R_used, R_provenance: R_provenance, R_cold: R_cold, T_cold: T_cold,
            I_op: I_op, I_provenance: I_provenance, n_op: n_op,
            riseLimitK: riseLimitK, riseLimitK_effective: riseLimitK_effective,
            derating: derating, Gth: Gth, Gth_eff: result.state.GthEffective,
            tau: tau, etaCool: etaCool, speedRatio: speedRatio,
            thermalResult: result, confidence: conf, diagnostics: diag,
            elapsedS: elapsedS
        };

        MTDT.ui.renderResults(ctx);
        MTDT.charts.updateCharts(ctx);

        MTDT.app.lastEstimateContext = ctx;

        console.info("[MTDT] Estimate complete:", {
            windingTemp: result.derived.windingTempC.toFixed(1) + " C",
            utilization: result.derived.utilizationPct.toFixed(1) + "%",
            confidence: conf.score + "%",
            diagnostics: diag.length
        });

        return ctx;
    }

    /* ==================================================================
       6. SIMULATION CONTROLLER
       ================================================================== */
    var sim = {
        running: false,
        paused: false,
        rafId: null,
        lastFrameMs: 0,
        ctx: null,
        elapsedS: 0,
        durationS: 0,
        stepS: 5,
        series: null,
        cumulativeU: 0,
        cumulativeN: 0
    };

    function simResetState() {
        sim.elapsedS = 0;
        sim.cumulativeU = 0;
        sim.cumulativeN = 0;
        sim.series = { temperature: [], current: [], voltage: [],
                       utilization: [], heatingIndex: [], health: [] };
    }

    function simBuildContext() {
        var m = MTDT.ui.readMotor();
        var o = MTDT.ui.readOperatingData();
        if (!m.ok || !o.ok) { return null; }

        var motor = m.motor, op = o.data;
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

        var R_used, R_cold = null, T_cold = null;
        if (motor.measured && motor.measured.resistanceOhm) {
            R_cold = motor.measured.resistanceOhm;
            T_cold = motor.measured.measuredAtC;
            R_used = R_cold;
        } else {
            R_used = MTDT.motorModel.estimateResistance(lossesRated.copperW, motor.ratedCurrentA);
        }

        var I_op = op.currentIsEstimated
            ? MTDT.motorModel.estimateCurrent(op.loadPercent / 100, motor.ratedCurrentA, motor.assumptions.noLoadCurrentPct)
            : op.lineCurrentA;

        var n_op = MTDT.rootCause.estimateOperatingSpeed(motor, op);

        var riseLimitK = MTDT.motorModel.calculateRatedTempRise(
            motor.insulationClass, motor.assumptions.hotSpotAllowanceK);
        var Gth = MTDT.motorModel.estimateThermalConductance(riseLimitK, lossesRated.totalW);
        var tau = MTDT.motorModel.estimateThermalTimeConstant(motor.ratedPowerKW);
        var derating = MTDT.physics.voltageImbalanceDerating(op.voltageImbalancePct);
        var riseLimitK_eff = riseLimitK * derating;
        var etaCool = MTDT.physics.coolingEffectiveness(motor.coolingType, n_op / motor.ratedSpeedRpm);

        return {
            motor: motor, op: op, lossesRated: lossesRated,
            R_used: R_used, R_cold: R_cold, T_cold: T_cold,
            I_op: I_op, n_op: n_op,
            riseLimitK: riseLimitK, riseLimitK_effective: riseLimitK_eff,
            derating: derating, Gth: Gth, tau: tau, etaCool: etaCool
        };
    }

    function simAppendSample(tS, riseK, windingTempC, utilizationPct) {
        var tMin = tS / 60;
        sim.series.temperature.push({ timeMin: tMin, value: windingTempC });
        sim.series.current.push({ timeMin: tMin, value: sim.ctx.I_op });
        sim.series.voltage.push({ timeMin: tMin, value: sim.ctx.op.lineVoltageV });
        sim.series.utilization.push({ timeMin: tMin, value: utilizationPct });

        sim.cumulativeU += utilizationPct;
        sim.cumulativeN += 1;
        sim.series.heatingIndex.push({ timeMin: tMin, value: sim.cumulativeU / sim.cumulativeN });

        var health = Math.max(0, Math.min(100, 100 - utilizationPct));
        sim.series.health.push({ timeMin: tMin, value: health });
    }

    function simAdvanceOneStep() {
        var c = sim.ctx;
        var stepS = sim.stepS;

        var Pcu = MTDT.physics.copperLoss(c.I_op, c.R_used);
        var Pcore = MTDT.physics.coreLoss(c.op.lineVoltageV, c.op.frequencyHz,
                                           c.lossesRated.coreW, c.motor.ratedVoltageV, c.motor.ratedFrequencyHz);
        var Pmech = MTDT.physics.mechanicalLoss(c.n_op, c.motor.ratedSpeedRpm, c.lossesRated.mechanicalW);
        var Pstray = MTDT.physics.strayLoadLoss(c.I_op, c.motor.ratedCurrentA, c.lossesRated.strayW);
        var Ptotal = MTDT.physics.totalLosses(Pcu, Pcore, Pmech, Pstray);

        var result = MTDT.thermalModel.updateThermalState(MTDT.state.thermalState, {
            Ptotal: Ptotal, Gth: c.Gth, coolingEffective: c.etaCool,
            tau: c.tau, ambientC: c.op.ambientTempC,
            riseLimitK: c.riseLimitK_effective, elapsedS: stepS
        });
        if (!result) { return false; }

        if (c.R_cold !== null) {
            var Tw = c.op.ambientTempC + result.derived.thetaNow;
            var Rhot = MTDT.physics.hotResistance(c.R_cold, c.T_cold, Tw);
            Pcu = MTDT.physics.copperLoss(c.I_op, Rhot);
            Ptotal = MTDT.physics.totalLosses(Pcu, Pcore, Pmech, Pstray);
            result = MTDT.thermalModel.updateThermalState(MTDT.state.thermalState, {
                Ptotal: Ptotal, Gth: c.Gth, coolingEffective: c.etaCool,
                tau: c.tau, ambientC: c.op.ambientTempC,
                riseLimitK: c.riseLimitK_effective, elapsedS: stepS
            });
            if (!result) { return false; }
        }

        MTDT.state.thermalState = result.state;

        simAppendSample(sim.elapsedS + stepS,
                        result.derived.thetaNow,
                        result.derived.windingTempC,
                        result.derived.utilizationPct);

        sim.elapsedS += stepS;
        return true;
    }

    function simUpdateClock() {
        var clock = document.getElementById("simClock");
        var status = document.getElementById("simStatus");
        if (clock) { clock.textContent = (sim.elapsedS / 60).toFixed(1) + " min"; }
        if (status) {
            status.textContent = sim.running ? (sim.paused ? "Paused" : "Running") : "Idle";
        }
    }

    function simFrame(timestampMs) {
        if (!sim.running || sim.paused) { return; }
        if (!sim.lastFrameMs) { sim.lastFrameMs = timestampMs; }

        var stepsPerFrame = 1;
        var maxStepsPerFrame = 60;

        var totalSteps = Math.ceil(sim.durationS / sim.stepS);
        if (totalSteps > 200) { stepsPerFrame = Math.max(1, Math.ceil(totalSteps / 200)); }
        if (stepsPerFrame > maxStepsPerFrame) { stepsPerFrame = maxStepsPerFrame; }

        for (var i = 0; i < stepsPerFrame; i++) {
            if (sim.elapsedS >= sim.durationS) { break; }
            if (!simAdvanceOneStep()) {
                simStop("Error during step");
                return;
            }
        }

        MTDT.charts.updateFromSeries(sim.series);

        var lastTemp = sim.series.temperature.length > 0
            ? sim.series.temperature[sim.series.temperature.length - 1].value : null;
        var lastU = sim.series.utilization.length > 0
            ? sim.series.utilization[sim.series.utilization.length - 1].value : null;
        if (lastTemp !== null && lastU !== null) {
            MTDT.ui.updateMotorVizLive({ windingTempC: lastTemp, utilizationPct: lastU });
        }

        simUpdateClock();

        if (sim.elapsedS >= sim.durationS) {
            simStop("Completed");
            return;
        }

        sim.rafId = global.requestAnimationFrame(simFrame);
    }

    function simStart() {
        var ctx = simBuildContext();
        if (!ctx) {
            MTDT.ui.setStatus("caution", "CHECK INPUTS");
            return;
        }

        MTDT.state.thermalState = MTDT.thermalModel.createInitialState();
        sim.ctx = ctx;
        simResetState();

        var cfg = MTDT.ui.readSimConfig();
        if (!cfg.ok) {
            MTDT.ui.setStatus("caution", "CHECK SIM CONFIG");
            return;
        }
        sim.durationS = cfg.config.durationMin * 60;
        sim.stepS = cfg.config.stepS;

        simAppendSample(0, 0, ctx.op.ambientTempC, 0);

        sim.running = true;
        sim.paused = false;
        sim.lastFrameMs = 0;
        simUpdateClock();
        simToggleButtons();

        sim.rafId = global.requestAnimationFrame(simFrame);
    }

    function simPause() {
        if (!sim.running) { return; }
        sim.paused = !sim.paused;
        simUpdateClock();
        simToggleButtons();
        if (!sim.paused) {
            sim.lastFrameMs = 0;
            sim.rafId = global.requestAnimationFrame(simFrame);
        }
    }

    function simStop(reason) {
        sim.running = false;
        sim.paused = false;
        if (sim.rafId) {
            global.cancelAnimationFrame(sim.rafId);
            sim.rafId = null;
        }
        var status = document.getElementById("simStatus");
        if (status) { status.textContent = reason || "Idle"; }
        simToggleButtons();
    }

    function simReset() {
        simStop("Idle");
        MTDT.state.thermalState = MTDT.thermalModel.createInitialState();
        simResetState();
        MTDT.charts.updateFromSeries(sim.series);
        var clock = document.getElementById("simClock");
        if (clock) { clock.textContent = "0 min"; }
    }

    function simToggleButtons() {
        var start = document.getElementById("btnSimStart");
        var pause = document.getElementById("btnSimPause");
        var reset = document.getElementById("btnSimReset");
        if (start) { start.disabled = sim.running; }
        if (pause) {
            pause.disabled = !sim.running;
            pause.textContent = sim.paused ? "Resume" : "Pause";
        }
        if (reset) { reset.disabled = sim.running; }
    }

    function wireSimulation() {
        var start = document.getElementById("btnSimStart");
        var pause = document.getElementById("btnSimPause");
        var reset = document.getElementById("btnSimReset");
        if (start) { start.addEventListener("click", simStart); }
        if (pause) { pause.addEventListener("click", simPause); }
        if (reset) { reset.addEventListener("click", simReset); }
    }

    /* ==================================================================
       7. AUTO-RUN
       ================================================================== */
    var autoRunEnabled = false;
    var autoRunTimer = null;
    var AUTO_RUN_DEBOUNCE_MS = 300;

    function onAutoRunInput() {
        if (!autoRunEnabled) { return; }
        if (autoRunTimer) { clearTimeout(autoRunTimer); }
        autoRunTimer = setTimeout(function () {
            autoRunTimer = null;
            runEstimate();
        }, AUTO_RUN_DEBOUNCE_MS);
    }

    function wireAutoRun() {
        var chk = document.getElementById("chkAutoRun");
        if (!chk) { return; }

        var inputs = document.querySelectorAll("#inpMotorDesignation, #inpRatedPower, #inpRatedVoltage, " +
            "#inpRatedCurrent, #inpRatedFrequency, #inpRatedSpeed, #inpEfficiency, #inpServiceFactor, " +
            "#selInsulationClass, #selCoolingType, #inpCopperShare, #inpCoreShare, #inpMechShare, " +
            "#inpStrayShare, #inpHotSpotAllowance, #inpNoLoadCurrentPct, #inpMeasuredResistance, " +
            "#inpMeasuredResistanceTemp, #inpLoadPercent, #inpLineCurrent, #inpLineVoltage, " +
            "#inpOperatingFrequency, #inpAmbientTemp, #inpVoltageImbalance, #inpStartsPerHour, " +
            "#inpRuntimeHours");
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener("change", onAutoRunInput);
            if (inputs[i].type === "number" || inputs[i].type === "text") {
                inputs[i].addEventListener("input", onAutoRunInput);
            }
        }

        var chkAuto = document.getElementById("chkAutoCurrent");
        if (chkAuto) { chkAuto.addEventListener("change", onAutoRunInput); }

        chk.addEventListener("change", function () {
            autoRunEnabled = chk.checked;
            if (autoRunEnabled) {
                runEstimate();
            }
        });
    }

    /* ==================================================================
       8. PERSISTENCE
       ================================================================== */
    var KEY_MOTOR_PREFIX  = "motor.";
    var KEY_MOTOR_INDEX   = "motors";
    var KEY_LAST_MOTOR    = "lastMotor";
    var KEY_LAST_OP       = "lastOperating";
    var KEY_PREFS         = "prefs";
    var KEY_AUTOSAVE      = "autoSave";

    var autoSaveEnabled = false;
    var autoSaveTimer = null;
    var AUTO_SAVE_DEBOUNCE_MS = 1000;

    function setPersistenceStatus(state, message) {
        var el = document.getElementById("persistenceStatus");
        if (!el) { return; }
        el.setAttribute("data-state", state);
        el.textContent = message;
    }

    function updatePersistenceStatus() {
        if (!MTDT.storage.available) {
            setPersistenceStatus("unavailable",
                "localStorage unavailable (private browsing or file:// restriction). " +
                "The app works fully; you just can't save motor configurations.");
            return;
        }
        var motorCount = (MTDT.storage.get(KEY_MOTOR_INDEX, []) || []).length;
        var autoSaveStr = MTDT.storage.get(KEY_AUTOSAVE, false) ? "ON" : "OFF";
        var lastMotor = MTDT.storage.get(KEY_LAST_MOTOR, null);
        var msg = "Storage: available · " + motorCount + " motor(s) saved · Auto-Save: " + autoSaveStr;
        if (lastMotor) { msg += " · Last: " + lastMotor; }
        setPersistenceStatus("available", msg);
    }

    function getMotorIndex() {
        return MTDT.storage.get(KEY_MOTOR_INDEX, []) || [];
    }
    function setMotorIndex(arr) {
        return MTDT.storage.set(KEY_MOTOR_INDEX, arr);
    }

    function saveMotor(designation) {
        if (!MTDT.storage.available) {
            setPersistenceStatus("error", "Cannot save — storage unavailable.");
            return false;
        }
        var m = MTDT.ui.readMotor();
        if (!m.ok) {
            setPersistenceStatus("error", "Cannot save — fix input errors first.");
            return false;
        }
        var motor = m.motor;
        var name = designation || motor.designation || "motor";
        var key = KEY_MOTOR_PREFIX + name;

        motor.__savedAt = new Date().toISOString();

        if (!MTDT.storage.set(key, motor)) {
            setPersistenceStatus("error", "Save failed — storage quota exceeded?");
            return false;
        }

        var idx = getMotorIndex();
        if (idx.indexOf(name) < 0) { idx.push(name); }
        setMotorIndex(idx);

        MTDT.storage.set(KEY_LAST_MOTOR, name);

        refreshSavedList();
        updatePersistenceStatus();
        setPersistenceStatus("available", "Saved '" + name + "' at " + new Date().toLocaleTimeString() + ".");
        return true;
    }

    function loadMotor(name) {
        if (!MTDT.storage.available) {
            setPersistenceStatus("error", "Cannot load — storage unavailable.");
            return false;
        }
        if (!name) {
            setPersistenceStatus("error", "No motor name specified.");
            return false;
        }
        var motor = MTDT.storage.get(KEY_MOTOR_PREFIX + name, null);
        if (!motor) {
            setPersistenceStatus("error", "Motor '" + name + "' not found.");
            return false;
        }

        applyMotorToForm(motor);

        var lastOp = MTDT.storage.get(KEY_LAST_OP, null);
        if (lastOp) {
            applyOperatingToForm(lastOp);
        }

        MTDT.storage.set(KEY_LAST_MOTOR, name);
        updatePersistenceStatus();
        setPersistenceStatus("available", "Loaded '" + name + "'.");

        if (autoRunEnabled) { runEstimate(); }
        else { MTDT.ui.setStatus("standby", "STANDBY"); MTDT.ui.clearKpis("Run estimate to compute"); }
        return true;
    }

    function applyMotorToForm(motor) {
        function set(id, val) {
            var el = document.getElementById(id);
            if (el && val !== null && val !== undefined) { el.value = val; }
        }
        set("inpMotorDesignation", motor.designation);
        set("inpRatedPower",       motor.ratedPowerKW);
        set("inpRatedVoltage",     motor.ratedVoltageV);
        set("inpRatedCurrent",     motor.ratedCurrentA);
        set("inpRatedFrequency",   motor.ratedFrequencyHz);
        set("inpRatedSpeed",       motor.ratedSpeedRpm);
        set("inpEfficiency",       motor.efficiencyPercent);
        set("inpServiceFactor",    motor.serviceFactor);
        set("selInsulationClass",  motor.insulationClass);
        set("selCoolingType",      motor.coolingType);

        if (motor.assumptions) {
            set("inpCopperShare",     motor.assumptions.copperSharePct);
            set("inpCoreShare",       motor.assumptions.coreSharePct);
            set("inpMechShare",       motor.assumptions.mechSharePct);
            set("inpStrayShare",      motor.assumptions.straySharePct);
            set("inpHotSpotAllowance", motor.assumptions.hotSpotAllowanceK);
            set("inpNoLoadCurrentPct", motor.assumptions.noLoadCurrentPct);
        }

        if (motor.measured) {
            set("inpMeasuredResistance",      motor.measured.resistanceOhm);
            set("inpMeasuredResistanceTemp",   motor.measured.measuredAtC);
        } else {
            set("inpMeasuredResistance",      "");
            set("inpMeasuredResistanceTemp",   "25");
        }

        var event = new Event("change");
        var anyField = document.getElementById("inpRatedPower");
        if (anyField) { anyField.dispatchEvent(event); }
    }

    function applyOperatingToForm(op) {
        function set(id, val) {
            var el = document.getElementById(id);
            if (el && val !== null && val !== undefined) { el.value = val; }
        }
        set("inpLoadPercent",        op.loadPercent);
        set("inpLineCurrent",        op.lineCurrentA);
        set("inpLineVoltage",        op.lineVoltageV);
        set("inpOperatingFrequency", op.frequencyHz);
        set("inpAmbientTemp",        op.ambientTempC);
        set("inpVoltageImbalance",   op.voltageImbalancePct);
        set("inpStartsPerHour",      op.startsPerHour);
        set("inpRuntimeHours",       op.runtimeHours);

        var chkAuto = document.getElementById("chkAutoCurrent");
        if (chkAuto) {
            chkAuto.checked = !!op.currentIsEstimated;
            try { chkAuto.dispatchEvent(new Event("change")); } catch (e) { /* ignore */ }
        }
    }

    function deleteSavedMotor(name) {
        if (!MTDT.storage.available) { return false; }
        MTDT.storage.remove(KEY_MOTOR_PREFIX + name);
        var idx = getMotorIndex();
        idx = idx.filter(function (n) { return n !== name; });
        setMotorIndex(idx);

        var last = MTDT.storage.get(KEY_LAST_MOTOR, null);
        if (last === name) { MTDT.storage.remove(KEY_LAST_MOTOR); }

        refreshSavedList();
        updatePersistenceStatus();
        setPersistenceStatus("available", "Deleted '" + name + "'.");
        return true;
    }

    function clearAllSaved() {
        if (!MTDT.storage.available) { return; }
        if (!confirm("Delete all saved motor configurations? This cannot be undone.")) { return; }
        var idx = getMotorIndex();
        idx.forEach(function (n) { MTDT.storage.remove(KEY_MOTOR_PREFIX + n); });
        setMotorIndex([]);
        MTDT.storage.remove(KEY_LAST_MOTOR);

        refreshSavedList();
        updatePersistenceStatus();
        setPersistenceStatus("available", "All saved motors cleared.");
    }

    function refreshSavedList() {
        var list = document.getElementById("savedMotorsList");
        if (!list) { return; }
        list.innerHTML = "";

        if (!MTDT.storage.available) {
            list.innerHTML = "<em>Storage unavailable.</em>";
            return;
        }

        var idx = getMotorIndex();
        if (idx.length === 0) {
            list.innerHTML = "<em>No saved motors.</em>";
            return;
        }

        idx.forEach(function (name) {
            var motor = MTDT.storage.get(KEY_MOTOR_PREFIX + name, null);
            if (!motor) { return; }

            var item = document.createElement("div");
            item.className = "saved-motor-item";

            var info = document.createElement("div");
            var nameEl = document.createElement("div");
            nameEl.className = "saved-motor-item__name";
            nameEl.textContent = name;
            var metaEl = document.createElement("div");
            metaEl.className = "saved-motor-item__meta";
            metaEl.textContent = motor.ratedPowerKW + " kW · " +
                                  motor.ratedVoltageV + " V · " +
                                  motor.insulationClass + " · " +
                                  motor.coolingType + " · saved " +
                                  new Date(motor.__savedAt || Date.now()).toLocaleDateString();
            info.appendChild(nameEl);
            info.appendChild(metaEl);
            item.appendChild(info);

            var loadBtn = document.createElement("button");
            loadBtn.className = "saved-motor-item__load";
            loadBtn.type = "button";
            loadBtn.textContent = "Load";
            loadBtn.addEventListener("click", function () { loadMotor(name); });
            item.appendChild(loadBtn);

            var delBtn = document.createElement("button");
            delBtn.className = "saved-motor-item__delete";
            delBtn.type = "button";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", function () {
                if (confirm("Delete saved motor '" + name + "'?")) { deleteSavedMotor(name); }
            });
            item.appendChild(delBtn);

            list.appendChild(item);
        });
    }

    function autoSaveMaybe() {
        if (!autoSaveEnabled || !MTDT.storage.available) { return; }
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); }
        autoSaveTimer = setTimeout(function () {
            autoSaveTimer = null;
            var o = MTDT.ui.readOperatingData();
            if (o.ok) { MTDT.storage.set(KEY_LAST_OP, o.data); }

            var m = MTDT.ui.readMotor();
            if (m.ok && m.motor.designation) {
                saveMotorQuiet(m.motor.designation, m.motor);
            }
        }, AUTO_SAVE_DEBOUNCE_MS);
    }

    function saveMotorQuiet(name, motor) {
        motor.__savedAt = new Date().toISOString();
        MTDT.storage.set(KEY_MOTOR_PREFIX + name, motor);
        var idx = getMotorIndex();
        if (idx.indexOf(name) < 0) { idx.push(name); setMotorIndex(idx); }
        MTDT.storage.set(KEY_LAST_MOTOR, name);
    }

    function setAutoSave(enabled) {
        autoSaveEnabled = !!enabled;
        MTDT.storage.set(KEY_AUTOSAVE, autoSaveEnabled);
        var btn = document.getElementById("btnAutoSaveToggle");
        if (btn) {
            btn.textContent = "Auto-Save: " + (autoSaveEnabled ? "On" : "Off");
            btn.classList.toggle("btn--primary", autoSaveEnabled);
            btn.classList.toggle("btn--ghost", !autoSaveEnabled);
        }
        updatePersistenceStatus();
    }

    function toggleAutoSave() {
        setAutoSave(!autoSaveEnabled);
        if (autoSaveEnabled) {
            setPersistenceStatus("available", "Auto-Save enabled. Changes save 1s after you stop typing.");
            autoSaveMaybe();
        } else {
            setPersistenceStatus("available", "Auto-Save disabled. Use 'Save Motor' to persist manually.");
        }
    }

    function restoreOnLoad() {
        if (!MTDT.storage.available) { return; }

        var prefs = MTDT.storage.get(KEY_PREFS, null);
        if (prefs && typeof prefs === "object") {
            /* Theme handled by initTheme */
        }

        var autoSave = MTDT.storage.get(KEY_AUTOSAVE, false);
        if (autoSave) { setAutoSave(true); }

        var lastOp = MTDT.storage.get(KEY_LAST_OP, null);
        if (lastOp) {
            applyOperatingToForm(lastOp);
        }

        var lastMotorName = MTDT.storage.get(KEY_LAST_MOTOR, null);
        if (lastMotorName) {
            var motor = MTDT.storage.get(KEY_MOTOR_PREFIX + lastMotorName, null);
            if (motor) {
                applyMotorToForm(motor);
                setPersistenceStatus("available",
                    "Restored '" + lastMotorName + "' from previous session.");
            }
        }
    }

    function wirePersistence() {
        var btnSave = document.getElementById("btnSaveMotor");
        var btnLoad = document.getElementById("btnLoadMotor");
        var btnClear = document.getElementById("btnClearSaved");
        var btnAutoSave = document.getElementById("btnAutoSaveToggle");

        if (btnSave) {
            btnSave.addEventListener("click", function () {
                var m = MTDT.ui.readMotor();
                if (!m.ok) {
                    setPersistenceStatus("error", "Fix input errors before saving.");
                    return;
                }
                saveMotor(m.motor.designation);
            });
        }

        if (btnLoad) {
            btnLoad.addEventListener("click", function () {
                var idx = getMotorIndex();
                if (idx.length === 0) {
                    setPersistenceStatus("error", "No saved motors to load.");
                    return;
                }
                loadMotor(idx[idx.length - 1]);
            });
        }

        if (btnClear) { btnClear.addEventListener("click", clearAllSaved); }
        if (btnAutoSave) { btnAutoSave.addEventListener("click", toggleAutoSave); }

        var inputs = document.querySelectorAll(
            "#inpMotorDesignation, #inpRatedPower, #inpRatedVoltage, #inpRatedCurrent, " +
            "#inpRatedFrequency, #inpRatedSpeed, #inpEfficiency, #inpServiceFactor, " +
            "#selInsulationClass, #selCoolingType, #inpCopperShare, #inpCoreShare, " +
            "#inpMechShare, #inpStrayShare, #inpHotSpotAllowance, #inpNoLoadCurrentPct, " +
            "#inpMeasuredResistance, #inpMeasuredResistanceTemp, #inpLoadPercent, " +
            "#inpLineCurrent, #inpLineVoltage, #inpOperatingFrequency, #inpAmbientTemp, " +
            "#inpVoltageImbalance, #inpStartsPerHour, #inpRuntimeHours");
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener("change", autoSaveMaybe);
            if (inputs[i].type === "number" || inputs[i].type === "text") {
                inputs[i].addEventListener("input", autoSaveMaybe);
            }
        }
        var chkAuto = document.getElementById("chkAutoCurrent");
        if (chkAuto) { chkAuto.addEventListener("change", autoSaveMaybe); }
    }

    /* ==================================================================
       9. VALIDATION wiring
       ================================================================== */
    function wireValidation() {
        var btn = document.getElementById("btnRunValidation");
        if (!btn) { return; }
        btn.addEventListener("click", function () {
            MTDT.validation.runAll();
        });
    }

    /* ==================================================================
       10. Initialization
       ================================================================== */
    function init() {
        initTheme();

        var btnTheme = document.getElementById("btnThemeToggle");
        if (btnTheme) { btnTheme.addEventListener("click", toggleTheme); }

        var btnCalc = document.getElementById("btnCalculate");
        if (btnCalc) { btnCalc.addEventListener("click", runEstimate); }

        wireAutoCurrent();
        wireSimulation();
        wireAutoRun();
        wirePersistence();
        wireValidation();

        restoreOnLoad();
        refreshSavedList();
        updatePersistenceStatus();

        console.info(
            "[MTDT] Motor Thermal Digital Twin v" + MTDT.VERSION +
            " — controller initialized (Phase 7: simulation + 6 charts)."
        );
        console.info("[MTDT] Namespace members:", Object.keys(MTDT).join(", "));
        console.info("[MTDT] localStorage available:", MTDT.storage.available);
    }

    /* ==================================================================
       11. Public surface + DOM-ready bootstrap
       ================================================================== */
    MTDT.app = {
        init: init,
        runEstimate: runEstimate
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
