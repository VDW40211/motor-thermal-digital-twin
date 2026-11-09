'use client';

import { useMotorStore } from '@/store/motor-store';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

export default function OperatingForm() {
  const operating = useMotorStore((s) => s.operating);
  const nameplate = useMotorStore((s) => s.nameplate);
  const updateOperating = useMotorStore((s) => s.updateOperating);

  const field = (key: keyof typeof operating, label: string, unit: string, step = 1, min = 0) => (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          value={operating[key] as number}
          onChange={(e) => updateOperating({ [key]: parseFloat(e.target.value) || 0 })}
          step={step}
          min={min}
          className="h-8 text-sm font-mono bg-muted/30 border-border/50 focus:border-primary/50 pr-10"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );

  const sliderField = (key: keyof typeof operating, label: string, unit: string, min: number, max: number, step = 0.1) => {
    const val = operating[key] as number;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</Label>
          <span className="text-xs font-mono text-foreground">{val.toFixed(step < 1 ? 1 : 0)} {unit}</span>
        </div>
        <Slider
          value={[val]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => updateOperating({ [key]: v })}
          className="py-1"
        />
      </div>
    );
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border/30">
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Operating Conditions</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field('voltage', 'Supply Voltage', 'V', 1)}
        {field('current', 'Load Current', 'A', 0.1)}
        {field('frequency', 'Frequency', 'Hz', 0.1)}
        {field('speed', 'Speed', 'RPM', 1)}
        {field('ambientTemp', 'Ambient Temp', '°C', 0.5)}
      </div>

      {/* Current slider for quick simulation */}
      <div className="pt-2 border-t border-border/30 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Quick Adjust</p>
        {sliderField('current', 'Load Current', 'A', 0, nameplate.ratedCurrent > 0 ? nameplate.ratedCurrent * 1.5 : 200, 0.5)}
        {sliderField('frequency', 'Frequency', 'Hz', 10, 80, 0.1)}
      </div>

      {/* Optional advanced fields */}
      <div className="pt-2 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-3">Advanced Parameters</p>
        <div className="grid grid-cols-2 gap-3">
          {field('voltageImbalance', 'V Imbalance', '%', 0.1)}
          {field('currentImbalance', 'I Imbalance', '%', 0.1)}
          {field('startsPerHour', 'Starts/Hr', '', 1)}
          {field('loadTorquePercent', 'Torque %', '%', 1)}
        </div>
      </div>
    </div>
  );
}