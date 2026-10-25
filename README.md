# Motor Thermal Digital Twin

A professional, browser-based **Motor Thermal Digital Twin** that estimates motor thermal condition using electrical operating parameters, first-order thermal modeling, engineering equations, and transparent rule-based diagnostics.

**Engineering estimate only — not a substitute for physical temperature measurement or OEM thermal protection.**

---

## Live Demo

Once deployed to GitHub Pages, the application is accessible at:

```
https://<your-username>.github.io/motor-thermal-digital-twin/
```

---

## Features

### Engineering Core
- First-order thermal model with thermal memory (state persists between calculations)
- Loss segregation (copper / core / mechanical / stray) with editable shares
- Cooling-effectiveness model for TEFC / ODP / TENV / FORCED cooling types
- Voltage imbalance derating per NEMA MG-1 Part 14
- Insulation class limits per IEC 60034-1 (Classes A / E / B / F / H)
- Hot-spot allowance methodology (default 10 K, editable)
- Stator resistance estimation from rated copper loss, or measured input
- Operating current estimation from load (linear no-load -> rated model)
- Thermal time constant estimation (empirical tau = 1200*sqrt(P_kW))
- Trip-time prediction with proper edge-case handling

### User Interface
- 8 KPI cards with provenance labels (Measured / Calculated / Estimated / Assumed / Derived / Typical)
- Inline SVG motor visualization with temperature-based coloring and rotation animation
- 6 native-canvas charts (Temperature, Current, Voltage, Utilization, Heating Index, Health Score)
- Calculation Trace — sequential audit trail of every equation used
- "Show Calculation" worksheets for every KPI
- Rule-based diagnostics across 10 categories
- Confidence scoring (base 65%, cap 95%, never 100%)
- Simulation mode with deterministic time-step core
- Light/dark themes with OS-preference detection
- Fully responsive (375 / 768 / 1024 / 1440 px breakpoints)

### Data & Export
- Print-to-PDF report (10 sections, browser native)
- CSV export with UTF-8 BOM (Excel-compatible)
- JSON export (machine-readable, self-documenting)
- localStorage persistence (motor configs, operating data, preferences)
- Auto-save mode (debounced 1s)

### Validation
- 6 spec-defined validation tests with automated pass/fail checks
- Time-constant checkpoints verified (1tau -> 63.2%, 3tau -> 95.0%, 5tau -> 99.3%)

---

## Technology

- HTML5 + CSS3 + vanilla JavaScript (ES5-compatible)
- Zero build process, works from file://
- Native Canvas API for charts (no Chart.js / D3 dependency)
- localStorage for persistence (no backend, no database)
- Blob + URL.createObjectURL for export (no server-side file generation)
- @media print + window.print() for PDF (no jsPDF / pdfmake dependency)
- Classic scripts with namespace guard (ES modules break file://)

**No Node.js. No npm. No build step. No backend. No database. Zero runtime dependencies.**

---

## Project Structure

```
motor-thermal-digital-twin/
|
|-- index.html              Main page (semantic HTML, inline SVG motor)
|-- styles.css              All styling (themes, responsive, print)
|-- README.md               This file
|
|-- js/
|   |-- app.js              Central controller + state + simulation
|   |-- physics.js          Engineering equations (12 functions)
|   |-- motorModel.js       Nameplate -> motor parameters (8 functions)
|   |-- thermalModel.js     First-order thermal state machine
|   |-- confidence.js       Rule-based confidence scoring
|   |-- rootCause.js        10-category rule-based diagnostics
|   |-- ui.js               DOM rendering + input validation
|   |-- charts.js           Native canvas chart engine (6 charts)
|   |-- reports.js          Print-to-PDF report (10 sections)
|   |-- export.js           CSV + JSON export
|   `-- validation.js       6 spec-defined validation tests
|
`-- assets/
    `-- README.md           Placeholder (folder for future icons/favicon)
```

### Script Load Order

```
js/physics.js       — pure engineering equations
js/motorModel.js    — nameplate -> motor parameters
js/thermalModel.js  — first-order thermal state
js/confidence.js    — confidence scoring
js/rootCause.js     — rule-based diagnostics
js/charts.js        — native canvas charts
js/reports.js       — print report
js/export.js        — CSV/JSON export
js/validation.js    — validation suite
js/ui.js            — DOM layer (loads late, after all data modules)
js/app.js           — controller (loads last, orchestrates everything)
```

---

## Engineering Equations

The application implements 25 numbered equations. Every KPI has a "Show Calculation" worksheet.

| Eq | Name | Formula |
|----|------|---------|
| 1 | Copper Loss | Pcu = 3 * I^2 * R |
| 2 | Core Loss | Pcore = Pcore,rated * (V/V_rated)^2 * (f/f_rated)^1.5 |
| 3 | Mechanical Loss | Pmech = Pmech,rated * (n/n_rated)^2.5 |
| 4 | Stray Load Loss | Pstray = Pstray,rated * (I/I_rated)^2 |
| 5 | Total Losses | Ptotal = Pcu + Pcore + Pmech + Pstray |
| 6 | Temperature Rise | dtheta_ss = P_total * G_th |
| 7 | First-Order Thermal | theta(t) = theta_ss - (theta_ss - theta_0) * e^(-t/tau) |
| 8 | Insulation Life | L(T) = L_rated * 2^((T_rated - T_actual)/10) |
| 9 | Hot Resistance | R_hot = R_cold * (T_cold + 234.5) / (T_hot + 234.5) |
| 10 | Cooling Effectiveness | eta_cool = clamp((n/n_rated)^p, 0.20, 1.0) |
| 11 | Voltage Imbalance Derating | NEMA MG-1 piecewise |
| 12 | Thermal Utilization | U = (dtheta_actual / dtheta_limit) * 100% |
| 13 | Loss Segregation | P_loss = P_rated * (1/eta - 1) |
| 14 | Resistance Estimation | R = P_cu,rated / (3 * I_rated^2) |
| 15 | Thermal Time Constant | tau = 1200 * sqrt(P_kW) |
| 16 | Thermal Conductance | G_th = dtheta_rated / P_loss_rated |
| 17 | Insulation Class Limit | IEC 60034-1 (A/E/B/F/H) |
| 18 | Rated Temperature Rise | dtheta_rated = T_class - 40 - hot_spot_allowance |
| 19 | Service Factor | rated_with_SF = rated * SF |
| 20 | Current Estimation | I(L) = I_no_load + (I_rated - I_no_load) * L |
| 21 | Effective Conductance | G_th_eff = G_th / eta_cool |
| 22 | Thermal State Advance | theta_now = theta_ss - (theta_ss - theta_0) * e^(-dt/tau) |
| 23 | Trip Time | t_trip = -tau * ln((theta_ss - theta_limit)/(theta_ss - theta_0)) |
| 24 | Thermal Margin | margin = theta_limit - theta_actual |
| 25 | Frame Temperature | T_frame = T_ambient + k_frame * dtheta_winding |

---

## Provenance Labels

Every value displayed carries a provenance label:

| Label | Meaning |
|---|---|
| Measured | Direct user input from instruments |
| Calculated | Derived from equations using measured inputs |
| Estimated | Derived using assumed or typical values |
| Assumed | Default value, editable in the UI |
| Derived | Computed from other derived quantities |
| Typical | Empirical approximation (e.g. tau = 1200*sqrt(P)) |

---

## Deployment to GitHub Pages

1. Create a new public repository on GitHub named `motor-thermal-digital-twin`.
2. Upload all files (index.html, styles.css, README.md, js/, assets/).
3. Go to Settings -> Pages -> Source: Deploy from a branch -> Branch: main / (root).
4. Wait 1-5 minutes for the build.
5. Access at https://<your-username>.github.io/motor-thermal-digital-twin/

---

## Validation

Click "Run Validation Suite" at the bottom of the application to run 6 automated tests:

1. Rated Condition — 75 kW, 400 V, 130 A, 50 Hz, Class F, TEFC at 100% load
2. No Load — verifies very low copper loss and low utilization
3. Overload 150% — verifies increased losses, over-limit utilization, diagnostics fire
4. Low Speed 25 Hz — verifies reduced cooling effectiveness, low-speed diagnostic fires
5. High Ambient 55C — verifies high winding temp, high-ambient diagnostic fires
6. Time Constant Checkpoints — verifies 1tau -> 63.2%, 3tau -> 95.0%, 5tau -> 99.3%

---

## Privacy

- No data leaves the browser.
- All calculations run client-side.
- Motor configurations are stored in localStorage (browser-only).
- No analytics, no tracking, no third-party requests.
- Works fully offline once loaded.

---

## Disclaimer

This application provides an engineering estimate and is not a substitute for physical temperature measurement or OEM thermal protection.

The first-order thermal model, loss segregation, and rule-based diagnostics are approximations. Real motor thermal behavior depends on factors not modeled here (VFD harmonics, duty cycles, altitude, frame-specific cooling design). Always validate against measured temperature data (RTD/thermocouple) and OEM thermal curves for critical applications.
