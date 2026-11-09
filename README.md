# 🛠️ Motor Thermal Digital Twin

> **Sensor-free motor thermal estimation tool** built with Next.js 16, TypeScript, Tailwind CSS 4, and shadcn/ui — using IEEE 112, IEC 60034-1/-2, and NEMA MG-1 engineering standards.

[![Deploy to GitHub Pages](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Engineering Foundation](#engineering-foundation)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
  - [Option A: Vercel (recommended)](#option-a-vercel-recommended)
  - [Option B: GitHub Pages](#option-b-github-pages)
  - [Option C: Netlify](#option-c-netlify)
  - [Option D: Self-hosted](#option-d-self-hosted)
- [Project Structure](#project-structure)
- [Usage Guide](#usage-guide)
- [API Reference (Engineering)](#api-reference-engineering)
- [Accuracy & Limitations](#accuracy--limitations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

The **Motor Thermal Digital Twin** is a web-based engineering tool that estimates the thermal state of an induction motor **without requiring physical temperature sensors**. It uses a lumped-parameter, first-order thermal model to predict winding temperatures, loss segregation, insulation life, and root-cause probabilities from motor nameplate data and operating conditions.

The app is **100% client-side** — all calculations run in the browser using Zustand-managed state and pure TypeScript engineering functions. No backend, no database, no API keys required.

---

## Features

### 🎯 Core Engineering
- **First-order ODE thermal model** with time-constant τ prediction
- **IEEE 112 / IEC 60034-2 loss segregation**: copper (I²R), core (Steinmetz), mechanical, stray load
- **NEMA MG-1 voltage imbalance derating** (§14.36)
- **Montsinger's rule** for insulation life (halves every +10°C)
- **IEC 60034-1 insulation classes**: A (105°C) / B (130°C) / F (155°C) / H (180°C)
- **Cooling effectiveness** models for TEFC, ODP, WP-II, TEAO, TEBV enclosures

### 📊 Real-time Dashboard
- 8 KPI cards: winding temp, thermal utilization, losses, load %, health score, confidence, time-to-trip, insulation life
- 4 animated 270° donut gauges with color-coded risk thresholds
- Live SVG motor cross-section with thermally-colored windings and rotating fan animation
- Stacked loss breakdown bar with rated-comparison delta
- 6-metric trend chart (Recharts) with 120-minute simulation capability

### 🔍 Intelligence
- **Root cause analysis** — 9 cause categories with sigmoid-based probability mapping (overload, low-speed cooling, voltage deviation, oversizing, undersizing, high ambient, V imbalance, I imbalance, frequent starts)
- **Dynamic confidence scoring** (65–95% range) based on data completeness
- **Engineering transparency panel** — expandable accordions showing every equation, input, and standard reference

### 💼 Productivity
- Export to CSV / JSON / Excel (XML Spreadsheet)
- Print/PDF support with print-optimized styles
- Cold-start reset and Defaults restore
- Fully responsive (mobile → 4K desktop)
- Dark industrial glassmorphism UI with sticky footer
- Reduced-motion accessibility support

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, static export) |
| Language | **TypeScript 5** (strict mode) |
| Styling | **Tailwind CSS 4** + **tw-animate-css** |
| UI Library | **shadcn/ui** (New York style) + **Radix UI** primitives |
| Icons | **lucide-react** |
| Charts | **Recharts** 2.15 |
| State | **Zustand** 5 (client state, 50ms debounced recalc) |
| Fonts | Geist Sans / Geist Mono (via `next/font`) |

**Zero backend dependencies.** No Prisma, no database, no auth, no SDKs.

---

## Engineering Foundation

All physics are documented with standards references in source comments:

| Equation | Standard | File |
|---|---|---|
| `P_cu = 3 × I² × R` | Ohm's law (3-phase) | `physics.ts` |
| `P_core = P_rated × (V/V_r)² × (f/f_r)^1.6` | Steinmetz | `physics.ts` |
| `P_stray ∝ (I/I_r)²` | IEEE 112 / IEC 60034-2 | `physics.ts` |
| `θ(t) = θ_ss − (θ_ss − θ₀) × e^(−t/τ)` | First-order ODE | `physics.ts` |
| `R_hot = R_cold × (235 + T_hot)/(235 + T_cold)` | Copper temp coeff | `physics.ts` |
| `Life = 2^(−ΔT/10)` | Montsinger's rule | `physics.ts` |
| Derating `= 1 − 0.05 × V_imb^1.3` | NEMA MG-1 §14.36 | `physics.ts` |
| Insulation temp limits | IEC 60034-1 | `types.ts` |

---

## Quick Start

### Prerequisites
- **Node.js 18+** (Node 20 recommended)
- npm, pnpm, or bun

### Local Development

```bash
# 1. Install dependencies
npm install
# or: pnpm install / bun install

# 2. Start dev server (http://localhost:3000)
npm run dev

# 3. Build for production (outputs to ./out/)
npm run build

# 4. Preview production build
npx serve out -l 3000
```

---

## Deployment

This app produces a **fully static site** (`output: "export"` → `./out/`), so it deploys to any static host. Below are 4 deployment paths.

### Option A: Vercel (recommended)

The fastest path — Vercel is Next.js's parent company.

1. Push this repo to GitHub (`git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main`)
2. Go to **[vercel.com/new](https://vercel.com/new)** and import the repo
3. Vercel auto-detects Next.js — just click **Deploy**
4. Live in ~60 seconds at `https://<repo>.vercel.app`

**No env vars needed.** Vercel handles everything automatically.

---

### Option B: GitHub Pages

A GitHub Actions workflow is included at `.github/workflows/deploy.yml` — it builds and publishes automatically on every push to `main`/`master`.

#### Steps

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Motor Thermal Digital Twin"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Enable GitHub Pages:**
   - Go to your repo → **Settings** → **Pages**
   - Under **Source**, select **GitHub Actions**
   - The included workflow will handle the rest

3. **Trigger the deployment:**
   - Push any commit to `main`, or
   - Go to **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**

4. **Wait ~2 minutes**, then visit:
   ```
   https://<your-username>.github.io/<your-repo>/
   ```

#### How it works

The workflow at `.github/workflows/deploy.yml`:
- Sets `DEPLOY_TARGET=github-pages` and `NEXT_PUBLIC_REPO_NAME=<repo-name>`
- The `next.config.ts` reads these to configure `basePath` and `assetPrefix`
- Builds static export to `./out/`
- Uploads as GitHub Pages artifact

> ⚠️ **Repo name matters**: GitHub Pages serves from `/<repo>/`, so the `basePath` must match. The workflow auto-detects this from `${{ github.event.repository.name }}` — **no manual config needed**.

---

### Option C: Netlify

1. Push to GitHub
2. Go to **[netlify.com](https://app.netlify.com/start)** → import the repo
3. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `out`
4. Click **Deploy**

Add a `netlify.toml` (optional):
```toml
[build]
  command = "npm run build"
  publish = "out"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

### Option D: Self-hosted

Build and serve with any static file server:

```bash
npm run build
# Serve ./out with nginx, caddy, serve, http-server, etc.
npx serve out -l 3000
```

For a **custom domain or root deploy** (no subpath), no env vars needed — the build works out-of-the-box.

---

## Project Structure

```
motor-thermal-digital-twin/
├── .github/workflows/
│   └── deploy.yml                    # GitHub Pages CI/CD
├── public/
│   ├── logo.svg
│   └── robots.txt
├── src/
│   ├── app/
│   │   ├── api/route.ts              # Health-check placeholder
│   │   ├── globals.css               # Dark industrial theme + animations
│   │   ├── layout.tsx                # Root layout + metadata
│   │   └── page.tsx                  # Main dashboard page
│   ├── components/
│   │   ├── motor/                    # 11 motor-specific components
│   │   │   ├── KPICards.tsx          # 8 KPI cards + 4 gauges
│   │   │   ├── GaugeWidget.tsx       # Animated 270° arc gauge
│   │   │   ├── MotorSVG.tsx          # SVG motor cross-section
│   │   │   ├── MotorInfoForm.tsx     # Nameplate inputs (9 fields)
│   │   │   ├── OperatingForm.tsx     # Operating conditions + sliders
│   │   │   ├── RootCausePanel.tsx    # 9 root cause cards
│   │   │   ├── TrendChart.tsx        # Recharts 6-metric trend
│   │   │   ├── CalculationPanel.tsx  # Engineering transparency
│   │   │   ├── LossBreakdown.tsx     # Stacked loss bar
│   │   │   ├── ExportMenu.tsx        # CSV/JSON/Excel/Print
│   │   │   └── DisclaimerFooter.tsx  # Sticky footer
│   │   └── ui/                       # 48 shadcn/ui components
│   ├── lib/
│   │   ├── motor/                    # 7 pure-engineering modules
│   │   │   ├── types.ts              # Interfaces + IEC/NEMA constants
│   │   │   ├── physics.ts            # 16+ pure physics functions
│   │   │   ├── motor-model.ts        # Parameter estimation
│   │   │   ├── thermal-model.ts      # State machine + simulation
│   │   │   ├── confidence.ts         # Dynamic confidence scoring
│   │   │   ├── root-cause.ts         # 9 root cause analyzers
│   │   │   └── index.ts             # Barrel export
│   │   └── utils.ts                  # cn() class merger
│   ├── hooks/                        # use-toast, use-mobile
│   └── store/
│       └── motor-store.ts            # Zustand store + recalc pipeline
├── .env.example
├── .gitignore
├── components.json                   # shadcn config
├── eslint.config.mjs
├── next.config.ts                    # Static export + basePath
├── next-env.d.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

---

## Usage Guide

### 1. Enter Motor Nameplate
Fill the **Motor Nameplate** panel (left column):
- Rated power (kW), voltage (V), current (A), speed (RPM), frequency (Hz)
- Number of poles, efficiency (decimal), power factor, service factor
- Insulation class (A/B/F/H) and enclosure type (TEFC/ODP/WP-II/TEAO/TEBV)

### 2. Set Operating Conditions
Fill the **Operating Conditions** panel (right column):
- Actual supply voltage, load current, frequency, speed, ambient temp
- Use the **Quick Adjust** sliders for current and frequency
- Optional advanced params: V/I imbalance, starts/hour, torque %

### 3. Read the Dashboard
- **KPI cards** show live winding temp, thermal utilization, losses, load, health, confidence, time-to-trip, insulation life
- **4 gauges** visualize critical metrics with color thresholds
- **Motor SVG** shows thermally-colored windings with rotating fan
- **Loss Breakdown** shows where energy is being lost

### 4. Explore Analysis Tabs

| Tab | What it shows |
|---|---|
| **Analysis** | Root cause probabilities + Thermal Trend chart |
| **Simulation** | 120-min thermal trend + Engineering calcs |
| **Engineering** | Expandable equations, inputs, references |

### 5. Run a Simulation
- Click **Simulate 120min** in the Thermal Trend panel
- Watch temperature rise from cold start to steady state
- Switch metrics via the chip buttons (6 metrics available)
- A red dashed **Trip** line shows the insulation class limit

### 6. Export Reports
Click **Export** (top right) → choose:
- **CSV** — spreadsheet-friendly tabular data
- **JSON** — full structured report with all calculations
- **Excel (XML)** — opens in Excel/Google Sheets
- **Print / PDF** — uses browser's print dialog with print-optimized CSS

---

## API Reference (Engineering)

### Physics Functions (`src/lib/motor/physics.ts`)

| Function | Returns | Reference |
|---|---|---|
| `copperLoss(I, R)` | `3 × I² × R` | Ohm's law, 3-phase |
| `coreLoss(V, f, ...)` | `P_rated × (V/V_r)² × (f/f_r)^1.6` | Steinmetz |
| `mechanicalLoss(n, ...)` | `P_rated × (n/n_r)` | Friction + windage |
| `strayLoadLoss(I, ...)` | `P_rated × (I/I_r)²` | IEEE 112 |
| `firstOrderThermal(T_ss, T_0, t, τ)` | `T_ss − (T_ss − T_0) × e^(−t/τ)` | First-order ODE |
| `insulationLifeFactor(T, T_rated, T_amb)` | `2^(−ΔT/10)` | Montsinger's rule |
| `hotResistance(R_cold, T_cold, T_hot)` | `R_cold × (235 + T_hot)/(235 + T_cold)` | Copper temp coeff |
| `coolingEffectiveness(enclosure, n_ratio)` | `0.15–1.0` | TEFC: `n^0.8` |
| `voltageImbalanceDerating(V_imb%)` | `0.75–1.0` | NEMA MG-1 §14.36 |
| `timeToReachTemp(T_now, T_ss, T_target, τ)` | `−τ × ln((T_ss − T_target)/(T_ss − T_now))` min | Inverse first-order |
| `healthScore(util, life, load)` | `0–100` weighted | Composite |
| `tempToColor(T, T_min, T_max)` | RGB string | Blue → Cyan → Green → Yellow → Red |

### Store Actions (`src/store/motor-store.ts`)

| Action | Purpose |
|---|---|
| `updateNameplate(partial)` | Update nameplate → triggers 50ms debounced recalc |
| `updateOperating(partial)` | Update conditions → triggers recalc |
| `resetThermalState()` | Cold-start the thermal model to ambient |
| `runSimulation(durationMin)` | Generate trend data (default 120 min, 0.5-min steps) |
| `loadDefaults()` | Restore the default 75 kW TEFC Class F motor |

---

## Accuracy & Limitations

### What this tool DOES well
- ✅ **Trend monitoring** — relative changes are accurate
- ✅ **Comparative analysis** — A/B between motors or conditions
- ✅ **Root cause identification** — when thresholds are clearly crossed
- ✅ **Educational transparency** — every equation is documented

### What this tool CANNOT do
- ❌ **Replace physical sensors** — this is estimation, not measurement
- ❌ **Capture hot-spot temperatures** — uses lumped winding temp
- ❌ **Model VFD harmonic heating** — assumes sinusoidal supply
- ❌ **Account for rotor heating** — stator-only model
- ❌ **Predict bearing failures** — thermal model is winding-centric

### Expected Accuracy

| Metric | Typical Error | Notes |
|---|---|---|
| Steady-state temp | ±10–15°C | Better at rated load, worse at overload |
| Time constant τ | ±30–40% | Depends on motor size estimation |
| Time-to-trip | ±50% | Compound error of τ + steady-state |
| Insulation life | Order-of-magnitude | Montsinger's rule is an approximation |
| Confidence cap | 95% max | Lumped-model assumption always remains |

### When NOT to use this tool
- Safety-critical thermal protection (use physical RTDs/thermistors instead)
- Legal/compliance documentation
- Highly dynamic loads with frequent transients
- Motors with unusual cooling arrangements

---

## Troubleshooting

### Build fails on GitHub Pages with 404 for assets
- Ensure `DEPLOY_TARGET=github-pages` and `NEXT_PUBLIC_REPO_NAME=<repo>` are set
- The workflow handles this automatically; for manual builds, set them in your shell

### Hydration mismatch warning
- This is harmless — the app uses a mounted-gate to avoid hydration issues
- If it persists, ensure you're running the latest `next` version

### Charts not rendering
- The Thermal Trend chart requires clicking **Simulate 120min** first
- An empty state is shown otherwise (by design)

### Mobile layout issues
- The app is fully responsive down to 360px width
- On very narrow screens, the 3-column layout stacks vertically

### Fonts not loading
- The app uses `next/font/google` for Geist Sans/Mono — requires internet access at build time
- For air-gapped builds, replace with system fonts in `layout.tsx`

---

## License

MIT License — see [LICENSE](LICENSE) file.

You are free to:
- ✅ Use commercially
- ✅ Modify and distribute
- ✅ Use in proprietary projects

Provided "AS IS" without warranty. **This is an engineering estimation tool, not a safety-critical measurement device.**

---

## Acknowledgments

Engineering references:
- **IEEE Std 112** — Test Procedure for Polyphase Induction Motors
- **IEC 60034-1** — Rotating electrical machines: Rating and performance
- **IEC 60034-2** — Methods for determining losses and efficiency
- **NEMA MG-1** — Motors and Generators
- **Steinmetz equation** — Core loss modeling
- **Montsinger's rule** — Insulation thermal life

Built with:
- [Next.js](https://nextjs.org/) by Vercel
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) by shadcn
- [Recharts](https://recharts.org/) — charting
- [Radix UI](https://www.radix-ui.com/) — accessible primitives
- [Zustand](https://github.com/pmndrs/zustand) — state management
- [Lucide](https://lucide.dev/) — icons

---

**Disclaimer:** This tool uses a lumped-parameter first-order thermal model. Real motors have distributed thermal networks, hot-spot variations, and manufacturing tolerances. Results are indicative for monitoring trends, not absolute values. Always validate against physical measurements for critical applications.
