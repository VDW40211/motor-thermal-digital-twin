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
import { computeLosses, segregateLosses, estimateResistance, calculateRatedTempRise } from '@/lib/motor/motor-model';
import { createThermalModel, stepThermalModel, resetThermalModel, runSimulation } from '@/lib/motor/thermal-model';
import { calculateConfidence } from '@/lib/motor/confidence';
import { analyzeRootCauses } from '@/lib/motor/root-cause';
import { loadPercentFromCurrent, healthScore, getRiskLevel } from '@/lib/motor/physics';

interface ThermalModelRef {
  currentWindingTemp: number;
  ratedLosses: { copper: number; core: number; mechanical: number; stray: number; total: number };
  ratedResistance: number;
  thermalTimeConstant: number;
  thermalConductance: number;
  ratedTempRise: number;
  tripTemp: number;
  ratedRiseTemp: number;
}

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

    // 1. Compute losses
    const losses = computeLosses(
      nameplate.ratedPower,
      nameplate.ratedVoltage,
      nameplate.ratedCurrent,
      nameplate.ratedFrequency,
      nameplate.ratedSpeed,
      nameplate.efficiency,
      operating.voltage,
      operating.frequency,
      operating.speed,
      operating.current,
      operating.voltageImbalance ?? 0
    );

    // 2. Get or create thermal model
    let model = thermalModelRef;
    if (!model || needsModelRebuild(model, nameplate)) {
      const newModel = createThermalModel(nameplate);
      model = newModel;
      set({ thermalModelRef: newModel });
    }

    // 3. Step thermal model
    const thermal = stepThermalModel(
      model,
      nameplate,
      operating,
      losses,
      0.5 // 30-second step
    );

    // 4. Calculate load percent
    const loadPct = loadPercentFromCurrent(operating.current, nameplate.ratedCurrent);

    // 5. Confidence
    const confidence = calculateConfidence(nameplate, operating);

    // 6. Root causes
    if (thermal) {
      const rootCauses = analyzeRootCauses({
        nameplate,
        conditions: operating,
        thermal,
        loadPercent: loadPct,
      });

      // 7. Health score
      const hs = healthScore(
        thermal.thermalUtilization,
        thermal.insulationLifeFactor,
        loadPct
      );

      // 8. Risk level
      const risk = getRiskLevel(thermal.thermalUtilization);

      // 9. KPI
      const kpi: KPIData = {
        windingTemp: thermal.windingTemp,
        frameTemp: thermal.frameTemp,
        thermalUtilization: thermal.thermalUtilization * 100,
        totalLosses: losses.totalLosses,
        efficiency: nameplate.ratedPower > 0 && losses.totalLosses > 0
          ? (nameplate.ratedPower * 1000) / (nameplate.ratedPower * 1000 + losses.totalLosses)
          : 0,
        powerFactor: nameplate.powerFactor,
        riskLevel: risk,
        healthScore: hs,
        confidenceScore: confidence.score,
        timeToTrip: thermal.timeToTrip,
        insulationLifeFactor: thermal.insulationLifeFactor,
        loadPercent: loadPct,
      };

      // 10. Build calculation details for transparency
      const rated = segregateLosses(nameplate.ratedPower, nameplate.efficiency);
      const R = estimateResistance(rated.copper, nameplate.ratedCurrent);
      const ratedRise = calculateRatedTempRise(nameplate.insulationClass);
      const calcs: CalculationDetail[] = [
        {
          id: 'losses',
          title: 'Loss Calculation',
          equation: 'P_total = P_cu + P_core + P_mech + P_stray',
          inputs: {
            'P_copper': `${losses.copperLoss.toFixed(1)} W`,
            'P_core': `${losses.coreLoss.toFixed(1)} W`,
            'P_mech': `${losses.mechanicalLoss.toFixed(1)} W`,
            'P_stray': `${losses.strayLoadLoss.toFixed(1)} W`,
          },
          result: `${losses.totalLosses.toFixed(1)} W`,
          unit: 'W',
          reference: 'IEEE 112 / IEC 60034-2',
        },
        {
          id: 'thermal',
          title: 'Thermal Model',
          equation: 'ΔT_ss = P_total / G_thermal',
          inputs: {
            'P_total': `${losses.totalLosses.toFixed(1)} W`,
            'G_thermal': `${(thermal.thermalUtilization > 0 ? losses.totalLosses / (thermal.steadyStateRise || 1) : 0).toFixed(2)} W/°C`,
            'τ (time constant)': `${thermal.timeConstant.toFixed(1)} min`,
            'Cooling effectiveness': `${(thermal.coolingEffectiveness * 100).toFixed(0)}%`,
          },
          result: `${thermal.steadyStateRise.toFixed(1)} °C rise`,
          unit: '°C',
          reference: 'Newton\'s law of cooling / Lumped-parameter model',
        },
        {
          id: 'resistance',
          title: 'Hot Resistance',
          equation: 'R_hot = R_cold × (235 + T_hot) / (235 + T_cold)',
          inputs: {
            'R_cold (25°C)': `${R.toFixed(4)} Ω`,
            'T_hot': `${thermal.windingTemp.toFixed(1)} °C`,
          },
          result: `${thermal.hotResistance.toFixed(4)} Ω`,
          unit: 'Ω',
          reference: 'Copper resistance-temperature coefficient',
        },
      ];

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
    }
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

    const losses = computeLosses(
      nameplate.ratedPower,
      nameplate.ratedVoltage,
      nameplate.ratedCurrent,
      nameplate.ratedFrequency,
      nameplate.ratedSpeed,
      nameplate.efficiency,
      operating.voltage,
      operating.frequency,
      operating.speed,
      operating.current,
      operating.voltageImbalance ?? 0
    );

    // Create a temp model for simulation (don't affect main state)
    const simModel = { ...thermalModelRef };
    const data = runSimulation(simModel, nameplate, operating, losses, duration, 0.5);

    // Add health scores
    const simData = data.map((p) => ({
      ...p,
      healthScore: healthScore(
        p.thermalUtilization,
        1.0, // Simplified
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