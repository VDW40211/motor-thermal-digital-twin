'use client';

import { useMotorStore } from '@/store/motor-store';
import { Progress } from '@/components/ui/progress';
import {
  Zap, Fan, Plug, Minimize2, Maximize2, Thermometer, AlertTriangle, Activity, RotateCw,
} from 'lucide-react';
import type { RootCause } from '@/lib/motor/types';
import { getRiskColor } from '@/lib/motor/physics';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Zap, Fan, Plug, Minimize2, Maximize2, Thermometer, AlertTriangle, Activity, RotateCw,
};

function RootCauseItem({ cause }: { cause: RootCause }) {
  const IconComponent = ICON_MAP[cause.icon] ?? AlertTriangle;
  const barColor = getRiskColor(cause.severity);

  return (
    <div className="glass-card p-3 space-y-2 group hover:border-border/60 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconComponent className="w-4 h-4" style={{ color: barColor }} />
          <span className="text-sm font-semibold text-foreground">{cause.name}</span>
        </div>
        <span className="text-sm font-mono font-bold" style={{ color: barColor }}>
          {cause.probability}%
        </span>
      </div>

      <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(100, cause.probability)}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 8px ${barColor}40`,
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{cause.description}</p>

      <div className="flex items-start gap-2 px-2 py-1.5 rounded bg-muted/20">
        <span className="text-[10px] font-bold uppercase tracking-wider shrink-0 mt-0.5" style={{ color: barColor }}>
          Action
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">{cause.recommendation}</p>
      </div>
    </div>
  );
}

export default function RootCausePanel() {
  const rootCauses = useMotorStore((s) => s.rootCauses);

  if (rootCauses.length === 0) {
    return (
      <div className="glass-card p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Enter motor parameters and operating conditions to see root cause analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Root Cause Analysis</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Rule-based, no ML</span>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
        {rootCauses.filter(c => c.probability > 5).map((cause) => (
          <RootCauseItem key={cause.name} cause={cause} />
        ))}
      </div>
    </div>
  );
}