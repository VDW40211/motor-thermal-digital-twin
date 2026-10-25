/* ==========================================================================
   MOTOR THERMAL DIGITAL TWIN — js/charts.js
   STEP 12 + 13 / PHASE 7 — Native canvas chart engine (6 charts).

   ROLE
   - Lightweight, dependency-free chart renderer using native Canvas API.
   - HiDPI-aware (devicePixelRatio scaling).
   - Auto-resize via ResizeObserver.
   - 6 charts: Temperature, Current, Voltage, Utilization, Heating Index, Health.
   ========================================================================== */
(function (global) {
    "use strict";

    var MTDT = global.MTDT || {};

    function validFinite(x) { return typeof x === "number" && isFinite(x); }
    function warn(msg) { console.warn("[MTDT.charts] " + msg); }

    var COLORS = {
        primary: "#0e6e63",
        primarySoft: "rgba(14, 110, 99, 0.15)",
        warn: "#9a5b04",
        warnSoft: "rgba(154, 91, 4, 0.12)",
        alarm: "#b3261e",
        alarmSoft: "rgba(179, 38, 30, 0.12)",
        ok: "#2e7d32",
        ink: "#23271f",
        inkSoft: "#5a6055",
        grid: "rgba(35, 40, 32, 0.08)",
        gridStrong: "rgba(35, 40, 32, 0.18)",
        axis: "#5a6055",
        bg: "#ffffff"
    };

    function isDark() {
        return document.documentElement.getAttribute("data-theme") === "dark";
    }

    function palette() {
        if (!isDark()) { return COLORS; }
        return {
            primary: "#46c4ae",
            primarySoft: "rgba(70, 196, 174, 0.18)",
            warn: "#dfb263",
            warnSoft: "rgba(223, 178, 99, 0.15)",
            alarm: "#ef8b7f",
            alarmSoft: "rgba(239, 139, 127, 0.15)",
            ok: "#82c98c",
            ink: "#e6e3d9",
            inkSoft: "#a3a89b",
            grid: "rgba(255, 255, 255, 0.07)",
            gridStrong: "rgba(255, 255, 255, 0.15)",
            axis: "#a3a89b",
            bg: "#171d20"
        };
    }

    function createChart(canvasId, options) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) {
            warn("createChart: canvas '" + canvasId + "' not found");
            return null;
        }
        options = options || {};

        var state = {
            canvas: canvas,
            ctx: canvas.getContext("2d"),
            options: options,
            series: [],
            ro: null,
            dpr: 1
        };

        function resize() {
            var rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) { return; }
            state.dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * state.dpr);
            canvas.height = Math.round(rect.height * state.dpr);
            canvas.style.width = rect.width + "px";
            canvas.style.height = rect.height + "px";
            state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            draw();
        }

        function setData(series) {
            state.series = series || [];
            draw();
        }

        function computeBounds() {
            var xMin = validFinite(options.xMin) ? options.xMin : Infinity;
            var xMax = validFinite(options.xMax) ? options.xMax : -Infinity;
            var yMin = validFinite(options.yMin) ? options.yMin : Infinity;
            var yMax = validFinite(options.yMax) ? options.yMax : -Infinity;

            state.series.forEach(function (s) {
                s.points.forEach(function (p) {
                    if (validFinite(p.x)) {
                        if (!validFinite(options.xMin) && p.x < xMin) { xMin = p.x; }
                        if (!validFinite(options.xMax) && p.x > xMax) { xMax = p.x; }
                    }
                    if (validFinite(p.y)) {
                        if (!validFinite(options.yMin) && p.y < yMin) { yMin = p.y; }
                        if (!validFinite(options.yMax) && p.y > yMax) { yMax = p.y; }
                    }
                });
            });

            if (options.limitLines) {
                options.limitLines.forEach(function (ll) {
                    if (validFinite(ll.value)) {
                        if (ll.value < yMin) { yMin = ll.value; }
                        if (ll.value > yMax) { yMax = ll.value; }
                    }
                });
            }

            if (yMin === Infinity || yMax === -Infinity) {
                yMin = 0; yMax = 1;
            } else {
                var pad = (yMax - yMin) * 0.08;
                if (pad === 0) { pad = Math.abs(yMax) * 0.1 || 1; }
                yMin -= pad; yMax += pad;
            }

            if (xMin === Infinity || xMax === -Infinity) {
                xMin = 0; xMax = 1;
            } else {
                var xpad = (xMax - xMin) * 0.04;
                if (xpad === 0) { xpad = 1; }
                xMin -= xpad; xMax += xpad;
            }

            return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };
        }

        function colorFor(kind) {
            var p = palette();
            if (!kind || kind === "primary") { return p.primary; }
            if (kind === "warn") { return p.warn; }
            if (kind === "alarm") { return p.alarm; }
            if (kind === "ok") { return p.ok; }
            return p.primary;
        }

        function softColorFor(kind) {
            var p = palette();
            if (!kind || kind === "primary") { return p.primarySoft; }
            if (kind === "warn") { return p.warnSoft; }
            if (kind === "alarm") { return p.alarmSoft; }
            if (kind === "ok") { return "rgba(46, 125, 50, 0.12)"; }
            return p.primarySoft;
        }

        function draw() {
            var ctx = state.ctx;
            var rect = canvas.getBoundingClientRect();
            var W = rect.width, H = rect.height;
            if (W === 0 || H === 0) { return; }

            var p = palette();
            var ml = 44, mr = 12, mt = 8, mb = 24;
            var plotW = W - ml - mr;
            var plotH = H - mt - mb;

            ctx.fillStyle = p.bg;
            ctx.fillRect(0, 0, W, H);

            var bounds = computeBounds();
            var xMin = bounds.xMin, xMax = bounds.xMax;
            var yMin = bounds.yMin, yMax = bounds.yMax;

            function xToPx(x) { return ml + (x - xMin) / (xMax - xMin) * plotW; }
            function yToPx(y) { return mt + (1 - (y - yMin) / (yMax - yMin)) * plotH; }

            if (options.zones) {
                options.zones.forEach(function (z) {
                    var y1 = yToPx(Math.max(z.from, yMin));
                    var y2 = yToPx(Math.min(z.to, yMax));
                    if (y2 < y1) { var t = y1; y1 = y2; y2 = t; }
                    ctx.fillStyle = softColorFor(z.colorKind);
                    ctx.fillRect(ml, y1, plotW, y2 - y1);
                });
            }

            ctx.strokeStyle = p.grid;
            ctx.lineWidth = 1;
            ctx.font = "10px ui-monospace, Consolas, monospace";
            ctx.fillStyle = p.inkSoft;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            var ySteps = 5;
            for (var i = 0; i <= ySteps; i++) {
                var yVal = yMin + (yMax - yMin) * i / ySteps;
                var yPx = yToPx(yVal);
                ctx.beginPath();
                ctx.moveTo(ml, yPx);
                ctx.lineTo(ml + plotW, yPx);
                ctx.strokeStyle = (i === 0 || i === ySteps) ? p.gridStrong : p.grid;
                ctx.stroke();
                ctx.fillText(yVal.toFixed(yVal < 10 && yVal > -10 ? 1 : 0), ml - 6, yPx);
            }

            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            var xSteps = 6;
            for (var j = 0; j <= xSteps; j++) {
                var xVal = xMin + (xMax - xMin) * j / xSteps;
                var xPx = xToPx(xVal);
                ctx.beginPath();
                ctx.moveTo(xPx, mt);
                ctx.lineTo(xPx, mt + plotH);
                ctx.strokeStyle = (j === 0 || j === xSteps) ? p.gridStrong : p.grid;
                ctx.stroke();
                ctx.fillText(xVal.toFixed(xVal < 10 && xVal > -10 ? 1 : 0), xPx, mt + plotH + 4);
            }

            if (options.limitLines) {
                options.limitLines.forEach(function (ll) {
                    if (!validFinite(ll.value)) { return; }
                    var yPx = yToPx(ll.value);
                    if (yPx < mt || yPx > mt + plotH) { return; }
                    ctx.strokeStyle = colorFor(ll.colorKind);
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([5, 4]);
                    ctx.beginPath();
                    ctx.moveTo(ml, yPx);
                    ctx.lineTo(ml + plotW, yPx);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    if (ll.label) {
                        ctx.font = "9px ui-monospace, Consolas, monospace";
                        ctx.fillStyle = colorFor(ll.colorKind);
                        ctx.textAlign = "left";
                        ctx.textBaseline = "middle";
                        ctx.fillText(ll.label, ml + 4, yPx - 6);
                    }
                });
            }

            state.series.forEach(function (s) {
                if (!s.points || s.points.length === 0) { return; }
                ctx.strokeStyle = colorFor(s.colorKind);
                ctx.fillStyle = softColorFor(s.colorKind);
                ctx.lineWidth = 1.8;
                if (s.dashed) { ctx.setLineDash([4, 3]); }

                ctx.beginPath();
                var started = false;
                for (var k = 0; k < s.points.length; k++) {
                    var pt = s.points[k];
                    if (!validFinite(pt.x) || !validFinite(pt.y)) { continue; }
                    var px = xToPx(pt.x);
                    var py = yToPx(pt.y);
                    if (!started) {
                        ctx.moveTo(px, py);
                        started = true;
                    } else {
                        ctx.lineTo(px, py);
                    }
                }
                ctx.stroke();
                ctx.setLineDash([]);

                if (s.fill && started) {
                    ctx.beginPath();
                    started = false;
                    for (var m = 0; m < s.points.length; m++) {
                        var pt2 = s.points[m];
                        if (!validFinite(pt2.x) || !validFinite(pt2.y)) { continue; }
                        var px2 = xToPx(pt2.x);
                        var py2 = yToPx(pt2.y);
                        if (!started) {
                            ctx.moveTo(px2, py2);
                            started = true;
                        } else {
                            ctx.lineTo(px2, py2);
                        }
                    }
                    if (started) {
                        var lastPt = s.points[s.points.length - 1];
                        var firstPt = s.points[0];
                        ctx.lineTo(xToPx(lastPt.x), mt + plotH);
                        ctx.lineTo(xToPx(firstPt.x), mt + plotH);
                        ctx.closePath();
                        ctx.fill();
                    }
                }

                if (s.marker && started) {
                    var lastPt3 = s.points[s.points.length - 1];
                    if (validFinite(lastPt3.x) && validFinite(lastPt3.y)) {
                        var mx = xToPx(lastPt3.x);
                        var my = yToPx(lastPt3.y);
                        ctx.fillStyle = colorFor(s.colorKind);
                        ctx.beginPath();
                        ctx.arc(mx, my, 3.5, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.strokeStyle = p.bg;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                }
            });

            ctx.strokeStyle = p.gridStrong;
            ctx.lineWidth = 1;
            ctx.strokeRect(ml, mt, plotW, plotH);

            ctx.fillStyle = p.inkSoft;
            ctx.font = "9px ui-monospace, Consolas, monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            if (options.yUnit) {
                ctx.save();
                ctx.translate(8, mt + plotH / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.textAlign = "center";
                ctx.fillText(options.yUnit, 0, 0);
                ctx.restore();
            }
            if (options.xUnit) {
                ctx.textAlign = "center";
                ctx.fillText(options.xUnit, ml + plotW / 2, H - 8);
            }
        }

        function destroy() {
            if (state.ro) {
                state.ro.disconnect();
                state.ro = null;
            }
        }

        if (global.ResizeObserver) {
            state.ro = new ResizeObserver(function () { resize(); });
            state.ro.observe(canvas);
        } else {
            global.addEventListener("resize", resize);
        }

        setTimeout(resize, 0);

        return {
            canvas: canvas,
            options: options,
            setData: setData,
            draw: draw,
            destroy: destroy
        };
    }

    var instances = {};

    function initTemperatureChart() {
        var c = createChart("chartTemperature", {
            xLabel: "Time", xUnit: "min",
            yLabel: "Temperature", yUnit: "°C",
            limitLines: [
                { value: 155, label: "Class F limit", colorKind: "alarm" },
                { value: 40, label: "Ambient", colorKind: "ink" }
            ],
            zones: [
                { from: 155, to: 1000, colorKind: "alarm" }
            ]
        });
        if (c) { instances.temperature = c; }
        return c;
    }

    function initCurrentChart() {
        var c = createChart("chartCurrent", {
            xLabel: "Time", xUnit: "min",
            yLabel: "Current", yUnit: "A",
            limitLines: [
                { value: 130, label: "Rated", colorKind: "primary" }
            ]
        });
        if (c) { instances.current = c; }
        return c;
    }

    function initVoltageChart() {
        var c = createChart("chartVoltage", {
            xLabel: "Time", xUnit: "min",
            yLabel: "Voltage", yUnit: "V",
            limitLines: []
        });
        if (c) { instances.voltage = c; }
        return c;
    }

    function initUtilizationChart() {
        var c = createChart("chartUtilization", {
            xLabel: "Time", xUnit: "min",
            yLabel: "Utilization", yUnit: "%",
            yMin: 0, yMax: 150,
            limitLines: [
                { value: 100, label: "Limit", colorKind: "alarm" },
                { value: 80,  label: "Caution", colorKind: "warn" }
            ],
            zones: [
                { from: 0,  to: 80,  colorKind: "ok" },
                { from: 80, to: 100, colorKind: "warn" },
                { from: 100, to: 150, colorKind: "alarm" }
            ]
        });
        if (c) { instances.utilization = c; }
        return c;
    }

    function initHeatingIndexChart() {
        var c = createChart("chartHeatingIndex", {
            xLabel: "Time", xUnit: "min",
            yLabel: "Heating Index", yUnit: "%",
            yMin: 0, yMax: 150,
            limitLines: [
                { value: 100, label: "Limit", colorKind: "alarm" }
            ]
        });
        if (c) { instances.heatingIndex = c; }
        return c;
    }

    function initHealthChart() {
        var c = createChart("chartHealth", {
            xLabel: "Time", xUnit: "min",
            yLabel: "Health", yUnit: "/100",
            yMin: 0, yMax: 100,
            limitLines: [
                { value: 50, label: "Marginal", colorKind: "warn" },
                { value: 20, label: "At limit", colorKind: "alarm" }
            ],
            zones: [
                { from: 50,  to: 100, colorKind: "ok" },
                { from: 20,  to: 50,  colorKind: "warn" },
                { from: 0,   to: 20,  colorKind: "alarm" }
            ]
        });
        if (c) { instances.health = c; }
        return c;
    }

    function updateFromSeries(seriesMap) {
        if (instances.temperature && seriesMap.temperature) {
            instances.temperature.setData([{
                name: "Winding temperature",
                points: seriesMap.temperature.map(function (p) { return { x: p.timeMin, y: p.value }; }),
                colorKind: "primary",
                fill: true,
                marker: true
            }]);
            instances.temperature.draw();
        }

        if (instances.current && seriesMap.current) {
            instances.current.setData([{
                name: "Line current",
                points: seriesMap.current.map(function (p) { return { x: p.timeMin, y: p.value }; }),
                colorKind: "primary",
                marker: true
            }]);
            instances.current.draw();
        }

        if (instances.voltage && seriesMap.voltage) {
            instances.voltage.setData([{
                name: "Line voltage",
                points: seriesMap.voltage.map(function (p) { return { x: p.timeMin, y: p.value }; }),
                colorKind: "primary",
                marker: true
            }]);
            instances.voltage.draw();
        }

        if (instances.utilization && seriesMap.utilization) {
            instances.utilization.setData([{
                name: "Thermal utilization",
                points: seriesMap.utilization.map(function (p) { return { x: p.timeMin, y: p.value }; }),
                colorKind: "primary",
                fill: true,
                marker: true
            }]);
            instances.utilization.draw();
        }

        if (instances.heatingIndex && seriesMap.heatingIndex) {
            instances.heatingIndex.setData([{
                name: "Heating index (cumulative avg)",
                points: seriesMap.heatingIndex.map(function (p) { return { x: p.timeMin, y: p.value }; }),
                colorKind: "warn",
                fill: true,
                marker: true
            }]);
            instances.heatingIndex.draw();
        }

        if (instances.health && seriesMap.health) {
            instances.health.setData([{
                name: "Thermal health",
                points: seriesMap.health.map(function (p) { return { x: p.timeMin, y: p.value }; }),
                colorKind: "ok",
                marker: true
            }]);
            instances.health.draw();
        }
    }

    function updateCharts(ctx) {
        if (!ctx || !ctx.thermalResult) { return; }

        var d = ctx.thermalResult.derived;
        var tau = ctx.tau;
        var tauMin = tau / 60;
        var xMax = 5 * tauMin;
        var steps = 60;
        var ambient = ctx.op.ambientTempC;
        var thetaSS = d.thetaSS;
        var riseLimit = ctx.riseLimitK_effective;
        var windingNow = d.windingTempC;
        var classLimit = MTDT.motorModel.getInsulationLimit(ctx.motor.insulationClass);

        if (instances.temperature) {
            var tempPoints = [];
            for (var i = 0; i <= steps; i++) {
                var tMin = (i / steps) * xMax;
                var tS = tMin * 60;
                var rise = MTDT.physics.firstOrderThermal(thetaSS, 0, tS, tau);
                tempPoints.push({ x: tMin, y: ambient + rise });
            }
            var opTimeMin = Math.min(ctx.elapsedS / 60, xMax);
            tempPoints.push({ x: opTimeMin, y: windingNow });

            instances.temperature.setData([{
                name: "Winding temperature (cold-start response)",
                points: tempPoints,
                colorKind: "primary",
                fill: true,
                marker: true
            }]);
            instances.temperature.options.limitLines = [
                { value: classLimit, label: "Class " + ctx.motor.insulationClass + " limit", colorKind: "alarm" },
                { value: ambient, label: "Ambient", colorKind: "ink" }
            ];
            instances.temperature.options.zones = [
                { from: classLimit, to: 1000, colorKind: "alarm" }
            ];
            instances.temperature.draw();
        }

        if (instances.current) {
            var Iop = ctx.I_op;
            var Irated = ctx.motor.ratedCurrentA;
            instances.current.setData([{
                name: "Operating current",
                points: [{ x: 0, y: Iop }, { x: xMax, y: Iop }],
                colorKind: "primary",
                marker: true
            }]);
            instances.current.options.limitLines = [
                { value: Irated, label: "Rated " + Irated + " A", colorKind: "primary" }
            ];
            instances.current.draw();
        }

        if (instances.voltage) {
            var Vop = ctx.op.lineVoltageV;
            var Vrated = ctx.motor.ratedVoltageV;
            instances.voltage.setData([{
                name: "Operating voltage",
                points: [{ x: 0, y: Vop }, { x: xMax, y: Vop }],
                colorKind: "primary",
                marker: true
            }]);
            instances.voltage.options.limitLines = [
                { value: Vrated, label: "Rated " + Vrated + " V", colorKind: "primary" }
            ];
            instances.voltage.draw();
        }

        if (instances.utilization) {
            var utilPoints = [];
            for (var j = 0; j <= steps; j++) {
                var tMinU = (j / steps) * xMax;
                var tSU = tMinU * 60;
                var riseU = MTDT.physics.firstOrderThermal(thetaSS, 0, tSU, tau);
                var uU = MTDT.physics.thermalUtilization(riseU, riseLimit);
                utilPoints.push({ x: tMinU, y: uU });
            }
            utilPoints.push({ x: Math.min(ctx.elapsedS / 60, xMax), y: d.utilizationPct });
            instances.utilization.setData([{
                name: "Utilization (cold-start response)",
                points: utilPoints,
                colorKind: "primary",
                fill: true,
                marker: true
            }]);
            instances.utilization.draw();
        }

        if (instances.heatingIndex) {
            var hiPoints = [];
            var sumU = 0;
            var cntU = 0;
            for (var k = 0; k <= steps; k++) {
                var tMinH = (k / steps) * xMax;
                var tSH = tMinH * 60;
                var riseH = MTDT.physics.firstOrderThermal(thetaSS, 0, tSH, tau);
                var uH = MTDT.physics.thermalUtilization(riseH, riseLimit);
                sumU += uH; cntU += 1;
                hiPoints.push({ x: tMinH, y: sumU / cntU });
            }
            instances.heatingIndex.setData([{
                name: "Heating index (cumulative avg utilization)",
                points: hiPoints,
                colorKind: "warn",
                fill: true,
                marker: true
            }]);
            instances.heatingIndex.draw();
        }

        if (instances.health) {
            var healthPoints = [];
            for (var l = 0; l <= steps; l++) {
                var tMinHe = (l / steps) * xMax;
                var tSHe = tMinHe * 60;
                var riseHe = MTDT.physics.firstOrderThermal(thetaSS, 0, tSHe, tau);
                var uHe = MTDT.physics.thermalUtilization(riseHe, riseLimit);
                var healthVal = Math.max(0, Math.min(100, 100 - uHe));
                healthPoints.push({ x: tMinHe, y: healthVal });
            }
            var opHealth = Math.max(0, Math.min(100, 100 - d.utilizationPct));
            healthPoints.push({ x: Math.min(ctx.elapsedS / 60, xMax), y: opHealth });
            instances.health.setData([{
                name: "Thermal health (cold-start response)",
                points: healthPoints,
                colorKind: "ok",
                marker: true
            }]);
            instances.health.draw();
        }
    }

    function init() {
        initTemperatureChart();
        initCurrentChart();
        initVoltageChart();
        initUtilizationChart();
        initHeatingIndexChart();
        initHealthChart();
        console.info("[MTDT] charts.js initialized (parts A+B: 6 charts)");
    }

    MTDT.charts = {
        init: init,
        createChart: createChart,
        updateCharts: updateCharts,
        updateFromSeries: updateFromSeries,
        instances: instances
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    global.MTDT = MTDT;

}(typeof window !== "undefined" ? window : this));
