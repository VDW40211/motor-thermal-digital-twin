'use client';

import { useMotorStore } from '@/store/motor-store';
import { Progress } from '@/components/ui/progress';

export default function LossBreakdown() {
  const losses = useMotorStore((s) => s.losses);
  const nameplate = useMotorStore((s) => s.nameplate);

  if (!losses) return null;

  const rated = nameplate.ratedPower * (1 - nameplate.efficiency) / nameplate.efficiency * 1000;
  const pct = (val: number) => (val / losses.totalLosses * 100);

  const items = [
    { label: 'Copper Loss (I²R)', value: losses.copperLoss, color: '#f97316', desc: 'Scales with I²' },
    { label: 'Core Loss (Steinmetz)', value: losses.coreLoss, color: '#06b6d4', desc: 'Scales with V²·f^1.6' },
    { label: 'Mechanical Loss', value: losses.mechanicalLoss, color: '#10b981', desc: 'Scales with speed' },
    { label: 'Stray Load Loss', value: losses.strayLoadLoss, color: '#8b5cf6', desc: 'Scales with I²' },
  ];

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Loss Breakdown</h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {(losses.totalLosses / 1000).toFixed(2)} kW total
        </span>
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
                <span className="text-[10px] text-muted-foreground">{item.desc}</span>
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

      {/* Comparison with rated */}
      <div className="pt-2 border-t border-border/30 flex justify-between text-[10px] text-muted-foreground">
        <span>Rated losses: {rated.toFixed(0)} W</span>
        <span className={losses.totalLosses > rated ? 'text-red-400' : 'text-emerald-400'}>
          {losses.totalLosses > rated ? '+' : ''}{((losses.totalLosses - rated) / rated * 100).toFixed(1)}% vs rated
        </span>
      </div>
    </div>
  );
}