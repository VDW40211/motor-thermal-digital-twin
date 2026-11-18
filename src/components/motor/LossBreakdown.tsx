'use client';

import { useMotorStore } from '@/store/motor-store';

/**
 * Loss Breakdown — separated stator copper, rotor copper, core, mechanical, stray.
 *
 * Upgraded to show the IEEE 112 / IEC 60034-2-1 loss segregation with
 * stator and rotor copper losses displayed separately (the legacy view
 * lumped them together).
 */
export default function LossBreakdown() {
  const losses = useMotorStore((s) => s.losses);
  const nameplate = useMotorStore((s) => s.nameplate);

  if (!losses) return null;

  const rated = nameplate.ratedPower * (1 - nameplate.efficiency) / nameplate.efficiency * 1000;
  const pct = (val: number) => (losses.totalLosses > 0 ? (val / losses.totalLosses * 100) : 0);

  // Separated loss items — now shows stator AND rotor copper
  const items = [
    {
      label: 'Stator Copper (I²R)',
      value: losses.statorCopperLoss ?? losses.copperLoss * 0.6,
      color: '#f97316',
      desc: '3 × I² × R_s(T)',
    },
    {
      label: 'Rotor Copper (slip)',
      value: losses.rotorCopperLoss ?? losses.copperLoss * 0.4,
      color: '#fb923c',
      desc: 's × P_airgap',
    },
    {
      label: 'Core (Hysteresis + Eddy)',
      value: losses.coreLoss,
      color: '#06b6d4',
      desc: 'V²·f scaling',
    },
    {
      label: 'Mechanical (Friction + Windage)',
      value: losses.mechanicalLoss,
      color: '#10b981',
      desc: '∝ speed',
    },
    {
      label: 'Stray Load',
      value: losses.strayLoadLoss,
      color: '#8b5cf6',
      desc: '∝ I²',
    },
  ];

  // Add imbalance heating row only if nonzero
  if (losses.imbalanceHeating && losses.imbalanceHeating > 0.5) {
    items.push({
      label: 'Imbalance Heating',
      value: losses.imbalanceHeating,
      color: '#ef4444',
      desc: 'Neg-sequence I²',
    });
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Loss Breakdown</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground font-mono">
            P_in: {(losses.inputPower / 1000).toFixed(2)} kW
          </span>
          <span className="text-xs font-mono text-muted-foreground">
            Σ: {(losses.totalLosses / 1000).toFixed(2)} kW
          </span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden bg-muted/30">
        {items.map((item) => (
          <div
            key={item.label}
            className="transition-all duration-500"
            style={{
              width: `${pct(item.value)}%`,
              backgroundColor: item.color,
              minWidth: pct(item.value) > 2 ? undefined : '2px',
            }}
            title={`${item.label}: ${item.value.toFixed(0)}W (${pct(item.value).toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Individual items */}
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-foreground">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">{item.desc}</span>
                <span className="text-xs font-mono font-semibold text-foreground">
                  {item.value.toFixed(0)} W
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct(item.value)}%`,
                  backgroundColor: item.color,
                  boxShadow: `0 0 6px ${item.color}40`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Power balance + comparison with rated */}
      <div className="pt-2 border-t border-border/30 space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Rated losses: {rated.toFixed(0)} W</span>
          <span className={losses.totalLosses > rated ? 'text-red-400' : 'text-emerald-400'}>
            {losses.totalLosses > rated ? '+' : ''}{((losses.totalLosses - rated) / rated * 100).toFixed(1)}% vs rated
          </span>
        </div>
        {/* Power balance check */}
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>P_shaft: {(losses.outputPower / 1000).toFixed(2)} kW</span>
          <span className={losses.balanceError < 5 ? 'text-emerald-400' : 'text-amber-400'}>
            Balance error: {losses.balanceError.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Slip: {(losses.slip * 100).toFixed(2)}%</span>
          <span>η: {losses.outputPower > 0 && losses.inputPower > 0
            ? ((losses.outputPower / losses.inputPower) * 100).toFixed(1) + '%'
            : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
