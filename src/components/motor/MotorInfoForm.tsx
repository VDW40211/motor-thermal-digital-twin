'use client';

import { useMotorStore } from '@/store/motor-store';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InsulationClass, EnclosureType } from '@/lib/motor/types';

export default function MotorInfoForm() {
  const nameplate = useMotorStore((s) => s.nameplate);
  const updateNameplate = useMotorStore((s) => s.updateNameplate);

  const field = (key: keyof typeof nameplate, label: string, unit: string, step = 1, min = 0) => (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          value={nameplate[key] as number}
          onChange={(e) => updateNameplate({ [key]: parseFloat(e.target.value) || 0 })}
          step={step}
          min={min}
          className="h-8 text-sm font-mono bg-muted/30 border-border/50 focus:border-primary/50 pr-10"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border/30">
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Motor Nameplate</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field('ratedPower', 'Rated Power', 'kW', 0.1)}
        {field('ratedVoltage', 'Rated Voltage', 'V', 1)}
        {field('ratedCurrent', 'Rated Current', 'A', 0.1)}
        {field('ratedSpeed', 'Rated Speed', 'RPM', 1)}
        {field('ratedFrequency', 'Frequency', 'Hz', 0.1)}
        {field('poles', 'Poles', '', 2, 2)}
        {field('efficiency', 'Efficiency', '%', 0.1, 0.5)}
        {field('powerFactor', 'Power Factor', '', 0.01, 0)}
        {field('serviceFactor', 'Service Factor', '', 0.05, 1.0)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Insulation Class</Label>
          <Select
            value={nameplate.insulationClass}
            onValueChange={(v) => updateNameplate({ insulationClass: v as InsulationClass })}
          >
            <SelectTrigger className="h-8 text-sm bg-muted/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Class A (105°C)</SelectItem>
              <SelectItem value="B">Class B (130°C)</SelectItem>
              <SelectItem value="F">Class F (155°C)</SelectItem>
              <SelectItem value="H">Class H (180°C)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Enclosure Type</Label>
          <Select
            value={nameplate.enclosureType}
            onValueChange={(v) => updateNameplate({ enclosureType: v as EnclosureType })}
          >
            <SelectTrigger className="h-8 text-sm bg-muted/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TEFC">TEFC (Totally Enclosed Fan Cooled)</SelectItem>
              <SelectItem value="ODP">ODP (Open Drip Proof)</SelectItem>
              <SelectItem value="WP-II">WP-II (Weather Protected)</SelectItem>
              <SelectItem value="TEAO">TEAO (Totally Enclosed Air Over)</SelectItem>
              <SelectItem value="TEBV">TEBV (Totally Enclosed Blower Ventilated)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}