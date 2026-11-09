'use client';

import { useMemo } from 'react';
import { useMotorStore } from '@/store/motor-store';
import GaugeWidget from './GaugeWidget';
import { Thermometer, Gauge, Zap, Activity, Shield, Clock, Heart, AlertTriangle } from 'lucide-react';
import { getRiskColor } from '@/lib/motor/physics';
import type { RiskLevel } from '@/lib/motor/types';

function RiskBadge({ level }: { level: RiskLevel }) {
  const colors: Record<RiskLevel, string> = {
    healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    monitor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    emergency: 'bg-red-600/20 text-red-500 border-red-600/30',
  };
  const labels: Record<RiskLevel, string> = {
    healthy: 'Healthy',
    monitor: 'Monitor',
    warning: 'Warning',
    critical: 'Critical',
    emergency: 'Emergency',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${colors[level]}`}>
      <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
      {labels[level]}
    </span>
  );
}

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'stable';
  trendColor?: string;
}

function KPICard({ icon, label, value, subValue, trend, trendColor }: KPICardProps) {
  return (
    <div className="glass-card p-3 flex flex-col gap-1.5 min-w-[140px]">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold font-mono text-foreground">{value}</span>
        {subValue && <span className="text-xs text-muted-foreground">{subValue}</span>}
      </div>
      {trend && (
        <div className="text-[10px] font-medium" style={{ color: trendColor }}>
          {trend === 'up' ? '▲ Rising' : trend === 'down' ? '▼ Falling' : '● Stable'}
        </div>
      )}
    </div>
  );
}

const INSULATION_LIMITS: Record<string, number> = { A: 105, B: 130, F: 155, H: 180 };

export default function KPICards() {
  const kpi = useMotorStore((s) => s.kpi);
  const thermal = useMotorStore((s) => s.thermal);
  const confidence = useMotorStore((s) => s.confidence);
  const riskLevel = useMotorStore((s) => s.riskLevel);
  const nameplate = useMotorStore((s) => s.nameplate);

  if (!kpi || !thermal) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card p-3 h-24 animate-pulse bg-muted/20" />
        ))}
      </div>
    );
  }

  const timeToTripDisplay = kpi.timeToTrip === Infinity ? '∞' : `${kpi.timeToTrip.toFixed(0)} min`;
  const lifeDisplay = kpi.insulationLifeFactor >= 1 ? '100%' : `${(kpi.insulationLifeFactor * 100).toFixed(1)}%`;
  const insLimit = INSULATION_LIMITS[nameplate.insulationClass] ?? 155;
  const ratedLosses = nameplate.ratedPower * (1 - nameplate.efficiency) / nameplate.efficiency;

  return (
    <div className="space-y-4">
      {/* Risk level header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Motor Health Dashboard</h2>
        <RiskBadge level={riskLevel} />
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KPICard
          icon={<Thermometer className="w-3.5 h-3.5" />}
          label="Winding Temp"
          value={`${kpi.windingTemp.toFixed(1)}°C`}
          subValue={`/ ${nameplate.insulationClass} (${insLimit}°C max)`}
          trendColor={getRiskColor(riskLevel)}
          trend={kpi.windingTemp > 100 ? 'up' : 'stable'}
        />

        <KPICard
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="Thermal Util."
          value={`${kpi.thermalUtilization.toFixed(1)}%`}
          subValue={`of rated capacity`}
          trendColor={kpi.thermalUtilization > 75 ? '#ef4444' : '#10b981'}
          trend={kpi.thermalUtilization > 75 ? 'up' : 'stable'}
        />

        <KPICard
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Total Losses"
          value={`${(kpi.totalLosses / 1000).toFixed(2)} kW`}
          subValue={`of ${ratedLosses.toFixed(1)} kW rated`}
        />

        <KPICard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Load"
          value={`${kpi.loadPercent.toFixed(1)}%`}
          subValue={`of ${(nameplate.serviceFactor * 100).toFixed(0)}% (${nameplate.serviceFactor > 1 ? 'SF' : 'rated'})`}
          trendColor={kpi.loadPercent > 100 ? '#ef4444' : kpi.loadPercent > 85 ? '#f59e0b' : '#10b981'}
          trend={kpi.loadPercent > 100 ? 'up' : 'stable'}
        />

        <KPICard
          icon={<Heart className="w-3.5 h-3.5" />}
          label="Health Score"
          value={`${kpi.healthScore}`}
          subValue={`/ 100`}
          trendColor={kpi.healthScore > 70 ? '#10b981' : kpi.healthScore > 40 ? '#f59e0b' : '#ef4444'}
        />

        <KPICard
          icon={<Shield className="w-3.5 h-3.5" />}
          label="Confidence"
          value={`${confidence?.score ?? 0}%`}
          subValue={confidence?.missing && confidence.missing.length > 0 ? `${confidence.missing.length} assumptions` : 'All data available'}
        />

        <KPICard
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Time to Trip"
          value={timeToTripDisplay}
          subValue={kpi.timeToTrip < 30 ? '⚠ Low margin' : kpi.timeToTrip === Infinity ? 'Not approaching' : 'at current rate'}
          trendColor={kpi.timeToTrip < 30 ? '#ef4444' : '#10b981'}
        />

        <KPICard
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          label="Insulation Life"
          value={lifeDisplay}
          subValue={kpi.insulationLifeFactor < 0.5 ? '⚠ Significantly reduced' : 'Normal'}
          trendColor={kpi.insulationLifeFactor < 0.5 ? '#ef4444' : kpi.insulationLifeFactor < 1 ? '#f59e0b' : '#10b981'}
        />
      </div>

      {/* Gauge row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 justify-items-center">
        <GaugeWidget
          value={kpi.windingTemp}
          min={0}
          max={180}
          label="Winding Temperature"
          unit="°C"
          size={140}
        />
        <GaugeWidget
          value={kpi.thermalUtilization}
          min={0}
          max={120}
          label="Thermal Utilization"
          unit="%"
          size={140}
        />
        <GaugeWidget
          value={kpi.loadPercent}
          min={0}
          max={150}
          label="Motor Load"
          unit="%"
          size={140}
          colorStops={[
            { at: 0, color: '#06b6d4' },
            { at: 0.7, color: '#10b981' },
            { at: 0.9, color: '#f59e0b' },
            { at: 1.0, color: '#ef4444' },
            { at: 1.2, color: '#dc2626' },
          ]}
        />
        <GaugeWidget
          value={kpi.healthScore}
          min={0}
          max={100}
          label="Health Score"
          unit=""
          size={140}
          colorStops={[
            { at: 0, color: '#dc2626' },
            { at: 0.4, color: '#ef4444' },
            { at: 0.7, color: '#f59e0b' },
            { at: 0.85, color: '#10b981' },
            { at: 1.0, color: '#06b6d4' },
          ]}
        />
      </div>
    </div>
  );
}