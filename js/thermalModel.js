/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/thermalModel.js
   STEP 8 / PHASE 3 — First-order thermal state machine.

   ROLE
   - The thermal state machine: holds current rise, advances it through time,
     predicts future temperature and trip time, exposes derived quantities
     (utilization, margin, frame temperature).
   - Pure functions. No DOM access. No state writes to MTDT.state —
     the caller (app.js) owns MTDT.state.thermalState.
   - Depends only on MTDT.physics (firstOrderThermal, thermalUtilization).

   THERMAL MEMORY CONTRACT
   - createInitialState() returns a cold, uninitialized state.
   - updateThermalState(state, input) reads state.riseK as θ_0 and returns
     a NEW state object — the caller decides whether to persist it.
   - On first call (state.initialized === false), θ_0 = 0 (cold start).
   - On subsequent calls, the previous rise is carried forward — the model
     remembers temperature between calculations.

   VALIDATION CHECKPOINTS (per spec)
   - 1τ → 63.2% of the gap from θ_0 to θ_ss
   - 3τ → 95.0%
   - 5τ → 99.3%
   - validateTimeConstantCheckpoints() verifies these numerically and is
     exercised by the STEP 19 test suite.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};
    var physics = MTDT.physics;

    if (!physics) {
        console.error("[MTDT.thermalModel] FATAL: MTDT.physics not loaded. Check script order in index.html.");
        return;
    }

    function validFinite(x)   { return typeof x === "number" && isFinite(x); }
    function validNonNeg(x)   { return validFinite(x) && x >= 0; }
    function validPositive(x) { return validFinite(x) && x > 0; }
    function validRange(x, lo, hi) {
        return validFinite(x) && x >= lo && x <= hi;
    }
    function warn(fnName, msg) { console.warn("[MTDT.thermalModel." + fnName + "] " + msg); }

    var DEFAULT_FRAME_FACTOR = 0.6;

    function createInitialState() {
        return {
            riseK: 0,
            ambientC: null,
            steadyStateRiseK: 0,
            coolingEffective: 1.0,
            GthEffective: null,
            tau: null,
            riseLimitK: null,
            lastUpdate: null,
            initialized: false
        };
    }

    function computeEffectiveConductance(Gth, coolingEffective) {
        if (!validPositive(Gth)) {
            warn("computeEffectiveConductance", "Gth must be positive; got " + Gth);
            return NaN;
        }
        if (!validRange(coolingEffective, 0.001, 10)) {
            warn("computeEffectiveConductance", "coolingEffective must be in [0.001, 10]; got " + coolingEffective);
            return NaN;
        }
        return Gth / coolingEffective;
    }

    function updateThermalState(state, input) {
        if (!state || typeof state !== "object") {
            warn("updateThermalState", "state must be an object");
            return null;
        }
        if (!input || typeof input !== "object") {
            warn("updateThermalState", "input must be an object");
            return null;
        }

        var Ptotal          = Number(input.Ptotal);
        var Gth             = Number(input.Gth);
        var cooling         = Number(input.coolingEffective);
        var tau             = Number(input.tau);
        var ambientC        = Number(input.ambientC);
        var riseLimitK      = Number(input.riseLimitK);
        var elapsedS        = Number(input.elapsedS);

        if (!validNonNeg(Ptotal))      { warn("updateThermalState", "Ptotal must be non-negative finite");      return null; }
        if (!validPositive(Gth))        { warn("updateThermalState", "Gth must be positive");                    return null; }
        if (!validRange(cooling, 0.001, 10)) { warn("updateThermalState", "coolingEffective must be in [0.001, 10]"); return null; }
        if (!validPositive(tau))        { warn("updateThermalState", "tau must be positive");                    return null; }
        if (!validFinite(ambientC))     { warn("updateThermalState", "ambientC must be finite");                 return null; }
        if (!validPositive(riseLimitK)) { warn("updateThermalState", "riseLimitK must be positive");              return null; }
        if (!validNonNeg(elapsedS))     { warn("updateThermalState", "elapsedS must be non-negative finite");    return null; }

        var GthEff   = Gth / cooling;
        var thetaSS  = Ptotal * GthEff;
        var theta0   = state.initialized ? state.riseK : 0;
        var thetaNow = physics.firstOrderThermal(thetaSS, theta0, elapsedS, tau);

        var newState = {
            riseK:             thetaNow,
            ambientC:          ambientC,
            steadyStateRiseK:  thetaSS,
            coolingEffective:  cooling,
            GthEffective:      GthEff,
            tau:                tau,
            riseLimitK:        riseLimitK,
            lastUpdate:         new Date().toISOString(),
            initialized:        true
        };

        var derived = {
            thetaSS:                 thetaSS,
            theta0:                  theta0,
            thetaNow:               thetaNow,
            windingTempC:            ambientC + thetaNow,
            steadyStateWindingTempC: ambientC + thetaSS,
            utilizationPct:         physics.thermalUtilization(thetaNow, riseLimitK),
            steadyStateUtilizationPct: physics.thermalUtilization(thetaSS, riseLimitK),
            marginK:                riseLimitK - thetaNow,
            steadyStateMarginK:     riseLimitK - thetaSS,
            frameTempC:             ambientC + DEFAULT_FRAME_FACTOR * thetaNow
        };

        return { state: newState, derived: derived };
    }

    function predictTemperature(state, steadyStateRiseK, futureS, tauS) {
        if (!state || !state.initialized) {
            warn("predictTemperature", "state must be initialized");
            return NaN;
        }
        if (!validNonNeg(steadyStateRiseK)) {
            warn("predictTemperature", "steadyStateRiseK must be non-negative finite");
            return NaN;
        }
        if (!validNonNeg(futureS)) {
            warn("predictTemperature", "futureS must be non-negative finite");
            return NaN;
        }
        if (!validPositive(tauS)) {
            warn("predictTemperature", "tauS must be positive");
            return NaN;
        }
        return physics.firstOrderThermal(steadyStateRiseK, state.riseK, futureS, tauS);
    }

    function predictTripTime(state, steadyStateRiseK, riseLimitK, tauS) {
        if (!state || !state.initialized) {
            warn("predictTripTime", "state must be initialized");
            return NaN;
        }
        if (!validNonNeg(steadyStateRiseK)) {
            warn("predictTripTime", "steadyStateRiseK must be non-negative finite");
            return NaN;
        }
        if (!validPositive(riseLimitK)) {
            warn("predictTripTime", "riseLimitK must be positive");
            return NaN;
        }
        if (!validPositive(tauS)) {
            warn("predictTripTime", "tauS must be positive");
            return NaN;
        }

        var theta0 = state.riseK;
        var thetaSS = steadyStateRiseK;

        if (theta0 >= riseLimitK) { return 0; }
        if (thetaSS <= riseLimitK) { return Infinity; }
        if (thetaSS <= theta0) { return Infinity; }

        var ratio = (thetaSS - riseLimitK) / (thetaSS - theta0);
        if (ratio <= 0) { return 0; }
        if (ratio >= 1) { return Infinity; }

        var t = -tauS * Math.log(ratio);
        return t > 0 ? t : 0;
    }

    function getThermalUtilization(state, riseLimitK) {
        if (!state || !state.initialized) {
            warn("getThermalUtilization", "state must be initialized");
            return NaN;
        }
        if (!validPositive(riseLimitK)) {
            warn("getThermalUtilization", "riseLimitK must be positive");
            return NaN;
        }
        if (!validNonNeg(state.riseK)) {
            warn("getThermalUtilization", "state.riseK must be non-negative finite");
            return NaN;
        }
        return physics.thermalUtilization(state.riseK, riseLimitK);
    }

    function getThermalMargin(state, riseLimitK) {
        if (!state || !state.initialized) {
            warn("getThermalMargin", "state must be initialized");
            return NaN;
        }
        if (!validPositive(riseLimitK)) {
            warn("getThermalMargin", "riseLimitK must be positive");
            return NaN;
        }
        if (!validNonNeg(state.riseK)) {
            warn("getThermalMargin", "state.riseK must be non-negative finite");
            return NaN;
        }
        return riseLimitK - state.riseK;
    }

    function getFrameTemperature(state, frameFactor) {
        if (!state || !state.initialized) {
            warn("getFrameTemperature", "state must be initialized");
            return NaN;
        }
        if (state.ambientC === null || !validFinite(state.ambientC)) {
            warn("getFrameTemperature", "state.ambientC must be finite");
            return NaN;
        }
        if (!validNonNeg(state.riseK)) {
            warn("getFrameTemperature", "state.riseK must be non-negative finite");
            return NaN;
        }
        var k = (frameFactor === undefined || frameFactor === null)
            ? DEFAULT_FRAME_FACTOR
            : Number(frameFactor);
        if (!validRange(k, 0, 1)) {
            warn("getFrameTemperature", "frameFactor must be in [0, 1]; got " + k);
            return NaN;
        }
        return state.ambientC + k * state.riseK;
    }

    function validateTimeConstantCheckpoints() {
        var thetaSS = 100;
        var theta0 = 0;
        var tau = 100;

        var at1tau = physics.firstOrderThermal(thetaSS, theta0, tau, tau) / thetaSS;
        var at3tau = physics.firstOrderThermal(thetaSS, theta0, 3 * tau, tau) / thetaSS;
        var at5tau = physics.firstOrderThermal(thetaSS, theta0, 5 * tau, tau) / thetaSS;

        var expected1tau = 1 - Math.exp(-1);
        var expected3tau = 1 - Math.exp(-3);
        var expected5tau = 1 - Math.exp(-5);

        return {
            at1tau: at1tau,
            at3tau: at3tau,
            at5tau: at5tau,
            expected1tau: expected1tau,
            expected3tau: expected3tau,
            expected5tau: expected5tau,
            pass: Math.abs(at1tau - 0.632) < 0.001 &&
                  Math.abs(at3tau - 0.950) < 0.001 &&
                  Math.abs(at5tau - 0.993) < 0.001
        };
    }

    MTDT.thermalModel = {
        createInitialState: createInitialState,
        computeEffectiveConductance: computeEffectiveConductance,
        updateThermalState: updateThermalState,
        predictTemperature: predictTemperature,
        predictTripTime: predictTripTime,
        getThermalUtilization: getThermalUtilization,
        getThermalMargin: getThermalMargin,
        getFrameTemperature: getFrameTemperature,
        validateTimeConstantCheckpoints: validateTimeConstantCheckpoints,
        DEFAULT_FRAME_FACTOR: DEFAULT_FRAME_FACTOR
    };

    console.info("[MTDT] thermalModel.js loaded (state machine: update / predict / trip / util / margin / frame)");

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
