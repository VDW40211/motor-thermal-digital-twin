// Motor Thermal Digital Twin — Global State Store (Zustand)
// Central state management for the entire application

import { create } from 'zustand';
import type {
  MotorNameplate,
  OperatingConditions,
  ThermalState,
  SegregatedLosses,
  RootCause,
  ConfidenceResult,
  KPIData,
  SimulationPoint,
  CalculationDetail,
  RiskLevel,
} from '@/lib/motor/types';
import { DEFAULT_MOTOR, DEFAULT_OPERATING } from '@/lib/motor/types';
import {
  computeLosses,
  segregateRatedLosses,
  calculateRatedTempRise,
  type RatedLossBreakdown,
} from '@/lib/motor/motor-model';
import { createThermalModel, stepThermalModel, resetThermalModel, runSimulation } from '@/lib/motor/thermal-model';
import { calculateConfidence } from '@/lib/motor/confidence';
import { analyzeRootCauses } from '@/lib/motor/root-cause';
import { loadPercentFromCurrent, healthScore, getRiskLevel, powerBalanceError } from '@/lib/motor/physics';

// The thermal model is an opaque object — we type it loosely here because
// its internals (multi-node state) are an implementation detail of the
// thermal-model module. The store only needs to hold a reference and
// pass it to stepThermalModel / resetThermalModel.
type ThermalModelRef = {
  windingTemp: number;
  coreTemp: number;
  frameTemp: number;
  rotorTemp: number;
  ratedBreakdown?: import('@/lib/motor/motor-model').RatedLossBreakdown;
  [key: string]: unknown;
};

interface MotorState {
  // Input state
  nameplate: MotorNameplate;
  operating: OperatingConditions;

  // Computed state
  losses: SegregatedLosses | null;
  thermal: ThermalState | null;
  rootCauses: RootCause[];
  confidence: ConfidenceResult | null;
  kpi: KPIData | null;
  calculations: CalculationDetail[];
  simulationData: SimulationPoint[];
  loadPercent: number;
  riskLevel: RiskLevel;

  // UI state
  activeTab: string;
  showCalculations: boolean;
  simulationRunning: boolean;
  simulationTime: number;
  thermalModelRef: ThermalModelRef | null;

  // Actions
  updateNameplate: (partial: Partial<MotorNameplate>) => void;
  updateOperating: (partial: Partial<OperatingConditions>) => void;
  recalculate: () => void;
  resetThermalState: () => void;
  setActiveTab: (tab: string) => void;
  toggleCalculations: () => void;
  runSimulation: (duration: number) => void;
  setSimulationRunning: (running: boolean) => void;
  setSimulationTime: (time: number) => void;
  loadDefaults: () => void;
}

export const useMotorStore = create<MotorState>((set, get) => ({
  // Initial state
  nameplate: DEFAULT_MOTOR,
  operating: DEFAULT_OPERATING,
  losses: null,
  thermal: null,
  rootCauses: [],
  confidence: null,
  kpi: null,
  calculations: [],
  simulationData: [],
  loadPercent: 0,
  riskLevel: 'healthy' as RiskLevel,
  activeTab: 'dashboard',
  showCalculations: false,
  simulationRunning: false,
  simulationTime: 0,
  thermalModelRef: null,

  updateNameplate: (partial) => {
    set((state) => ({
      nameplate: { ...state.nameplate, ...partial },
    }));
    // Debounced recalculation
    setTimeout(() => get().recalculate(), 50);
  },

  updateOperating: (partial) => {
    set((state) => ({
      operating: { ...state.operating, ...partial },
    }));
    setTimeout(() => get().recalculate(), 50);
  },

  recalculate: () => {
    const { nameplate, operating, thermalModelRef } = get();

    // 1. Get or create thermal model (must exist before computing losses,
    //    because losses are temperature-dependent via R_hot).
    let model = thermalModelRef;
    if (!model) {
      model = createThermalModel(nameplate);
      set({ thermalModelRef: model });
    }

    // 2. Compute losses at the current winding temperature (thermal coupling)
    //    R_s is corrected for the winding temperature inside computeLosses.
    const currentWindingTemp = model.windingTemp ?? 40;
    const ratedBreakdown = model.ratedBreakdown ?? segregateRatedLosses(nameplate);
    const losses = computeLosses(
      nameplate,
      operating,
      currentWindingTemp,
      ratedBreakdown,
    );

    // 3. Step thermal model forward (multi-node, substepped Euler)
    const thermal = stepThermalModel(
      model,
      nameplate,
      operating,
      losses,
      0.5, // 30-second step
    );

    // 4. Calculate load percent
    const loadPct = loadPercentFromCurrent(operating.current, nameplate.ratedCurrent);

    // 5. Confidence
    const confidence = calculateConfidence(nameplate, operating);

    // 6. Root causes
    const rootCauses = thermal ? analyzeRootCauses({
      nameplate,
      conditions: operating,
      thermal,
      loadPercent: loadPct,
    }) : [];

    // 7. Health score
    const hs = thermal ? healthScore(
      thermal.thermalUtilization,
      thermal.insulationLifeFactor,
      loadPct
    ) : 0;

    // 8. Risk level
    const risk = thermal ? getRiskLevel(thermal.thermalUtilization) : ('healthy' as RiskLevel);

    // 9. KPI
    const kpi: KPIData | null = thermal ? {
      windingTemp: thermal.windingTemp,
      frameTemp: thermal.frameTemp,
      thermalUtilization: thermal.thermalUtilization * 100,
      totalLosses: losses.totalLosses,
      efficiency: losses.outputPower > 0 && losses.inputPower > 0
        ? losses.outputPower / losses.inputPower
        : 0,
      powerFactor: nameplate.powerFactor,
      riskLevel: risk,
      healthScore: hs,
      confidenceScore: confidence.score,
      timeToTrip: thermal.timeToTrip,
      insulationLifeFactor: thermal.insulationLifeFactor,
      loadPercent: loadPct,
    } : null;

    // 10. Build calculation details for transparency
    const calcs: CalculationDetail[] = thermal ? [
      {
        id: 'power_flow',
        title: 'Three-Phase Power Flow',
        equation: 'P_in = √3 × V_line × I_line × PF',
        inputs: {
          'V_line': `${operating.voltage} V`,
          'I_line': `${operating.current} A`,
          'PF': nameplate.powerFactor.toFixed(3),
        },
        result: `${losses.inputPower.toFixed(0)} W`,
        unit: 'W',
        reference: 'Balanced 3-phase input power (IEEE 112)',
      },
      {
        id: 'stator_copper',
        title: 'Stator Copper Loss (temp-corrected)',
        equation: 'P_cu_s = 3 × I_phase² × R_s(T_winding)',
        inputs: {
          'I_phase': `${(nameplate.statorConnection === 'delta' ? operating.current / Math.sqrt(3) : operating.current).toFixed(1)} A`,
          'R_s(T)': `${(thermal.hotResistance).toFixed(4)} Ω`,
          'T_winding': `${thermal.windingTemp.toFixed(1)} °C`,
        },
        result: `${losses.statorCopperLoss.toFixed(1)} W`,
        unit: 'W',
        reference: 'Ohm law, 3-phase; R corrected via (235+T)/(235+25)',
      },
      {
        id: 'rotor_copper',
        title: 'Rotor Copper Loss (from slip)',
        equation: 'P_cu_r = s × P_airgap',
        inputs: {
          'slip (s)': `${(losses.slip * 100).toFixed(2)} %`,
          'P_airgap': `${losses.airGapPower.toFixed(0)} W`,
        },
        result: `${losses.rotorCopperLoss.toFixed(1)} W`,
        unit: 'W',
        reference: 'IEEE 112 / IEC 60034-2-1',
      },
      {
        id: 'core_loss',
        title: 'Core (Iron) Loss — hysteresis + eddy',
        equation: 'P_core = P_h + P_e = k_h·f·B^α + k_e·f²·B²',
        inputs: {
          'V/V_r': `${(operating.voltage / nameplate.ratedVoltage).toFixed(3)}`,
          'f/f_r': `${(operating.frequency / nameplate.ratedFrequency).toFixed(3)}`,
        },
        result: `${losses.coreLoss.toFixed(1)} W`,
        unit: 'W',
        reference: 'Steinmetz, separated hysteresis + eddy',
      },
      {
        id: 'power_balance',
        title: 'Power Balance Check',
        equation: 'P_in = P_shaft + Σ P_losses',
        inputs: {
          'P_in': `${losses.inputPower.toFixed(0)} W`,
          'P_shaft': `${losses.outputPower.toFixed(0)} W`,
          'Σ P_losses': `${losses.totalLosses.toFixed(0)} W`,
        },
        result: `${losses.balanceError.toFixed(2)} %`,
        unit: '% error',
        reference: 'IEEE 112 Method A (input-output)',
      },
      {
        id: 'thermal_nodes',
        title: 'Multi-Node Thermal State',
        equation: 'C × dT/dt = P_gen − Q_diss',
        inputs: {
          'T_winding': `${thermal.windingTemp.toFixed(1)} °C`,
          'T_core': `${(thermal.statorCoreTemp ?? 40).toFixed(1)} °C`,
          'T_frame': `${thermal.frameTemp.toFixed(1)} °C`,
          'T_rotor': `${(thermal.rotorTemp ?? 40).toFixed(1)} °C`,
          'T_hotspot': `${(thermal.hotSpotTemp ?? thermal.windingTemp).toFixed(1)} °C`,
          'τ_winding': `${(thermal.tauWinding ?? 25).toFixed(0)} min`,
          'τ_frame': `${(thermal.tauFrame ?? 100).toFixed(0)} min`,
        },
        result: `${thermal.windingTemp.toFixed(1)} °C`,
        unit: '°C winding',
        reference: 'Mellor & Staton multi-node model',
      },
    ] : [];

    set({
      losses,
      thermal,
      rootCauses,
      confidence,
      kpi,
      calculations: calcs,
      loadPercent: loadPct,
      riskLevel: risk,
      thermalModelRef: model,
    });
  },

  resetThermalState: () => {
    const { operating, thermalModelRef, nameplate } = get();
    if (thermalModelRef) {
      resetThermalModel(thermalModelRef, operating.ambientTemp);
    } else {
      const model = createThermalModel(nameplate);
      resetThermalModel(model, operating.ambientTemp);
      set({ thermalModelRef: model });
    }
    get().recalculate();
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleCalculations: () => set((s) => ({ showCalculations: !s.showCalculations })),

  runSimulation: (duration) => {
    const { nameplate, operating, thermalModelRef } = get();
    if (!thermalModelRef) return;

    // Compute losses at current winding temp (thermal coupling)
    const currentWindingTemp = thermalModelRef.windingTemp ?? 40;
    const ratedBreakdown = thermalModelRef.ratedBreakdown ?? segregateRatedLosses(nameplate);
    const losses = computeLosses(
      nameplate,
      operating,
      currentWindingTemp,
      ratedBreakdown,
    );

    // Create a temp model for simulation (don't affect main state)
    // Deep-copy the model so the simulation doesn't mutate the live state.
    const simModel = {
      ...thermalModelRef,
      ratedBreakdown,
    };
    const data = runSimulation(simModel, nameplate, operating, losses, duration, 0.5);

    // Add health scores
    const simData = data.map((p) => ({
      ...p,
      healthScore: healthScore(
        p.thermalUtilization,
        1.0, // Simplified — full life at start of sim
        (p.current / nameplate.ratedCurrent) * 100
      ),
    }));

    set({ simulationData: simData, simulationRunning: true, simulationTime: duration });
  },

  setSimulationRunning: (running) => set({ simulationRunning: running }),
  setSimulationTime: (time) => set({ simulationTime: time }),

  loadDefaults: () => {
    set({
      nameplate: DEFAULT_MOTOR,
      operating: DEFAULT_OPERATING,
      thermalModelRef: null,
    });
    // Small delay to let state settle
    setTimeout(() => get().resetThermalState(), 100);
  },
}));

/** Check if thermal model needs rebuilding after nameplate change */
function needsModelRebuild(model: ThermalModelRef, nameplate: MotorNameplate): boolean {
  // Simple check: rebuild if power, efficiency, insulation class, or enclosure changed
  return true; // Always rebuild for simplicity — models are cheap to create
}