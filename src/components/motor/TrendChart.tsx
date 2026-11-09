'use client';

import { useMotorStore } from '@/store/motor-store';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw } from 'lucide-react';

type ChartMetric = 'windingTemp' | 'thermalUtilization' | 'losses' | 'healthScore' | 'current' | 'frameTemp';

const METRICS: { key: ChartMetric; label: string; unit: string; color: string; yDomain?: [number, number] }[] = [
  { key: 'windingTemp', label: 'Winding Temperature', unit: '°C', color: '#f97316', yDomain: [0, 200] },
  { key: 'frameTemp', label: 'Frame Temperature', unit: '°C', color: '#06b6d4', yDomain: [0, 120] },
  { key: 'thermalUtilization', label: 'Thermal Utilization', unit: '%', color: '#f59e0b', yDomain: [0, 120] },
  { key: 'losses', label: 'Total Losses', unit: 'W', color: '#ef4444' },
  { key: 'healthScore', label: 'Health Score', unit: '', color: '#10b981', yDomain: [0, 100] },
  { key: 'current', label: 'Load Current', unit: 'A', color: '#8b5cf6' },
];

export default function TrendChart() {
  const simulationData = useMotorStore((s) => s.simulationData);
  const nameplate = useMotorStore((s) => s.nameplate);
  const runSim = useMotorStore((s) => s.runSimulation);
  const resetThermal = useMotorStore((s) => s.resetThermalState);
  const [activeMetric, setActiveMetric] = useState<ChartMetric>('windingTemp');

  const metric = METRICS.find(m => m.key === activeMetric)!;

  const handleRunSimulation = () => {
    resetThermal();
    // Small delay to let reset propagate
    setTimeout(() => {
      runSim(120); // 120-minute simulation
    }, 150);
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Thermal Trend</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={resetThermal} className="h-7 text-xs gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
          <Button size="sm" onClick={handleRunSimulation} className="h-7 text-xs gap-1 bg-cyan-600 hover:bg-cyan-700 text-white">
            <Play className="w-3 h-3" /> Simulate 120min
          </Button>
        </div>
      </div>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setActiveMetric(m.key)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${
              activeMetric === m.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[260px] w-full">
        {simulationData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={simulationData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id={`grad-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metric.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={metric.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                label={{ value: 'Time (min)', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                domain={metric.yDomain ?? ['auto', 'auto']}
                label={{ value: metric.unit, position: 'insideTopLeft', offset: -5, fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value: number) => [`${value.toFixed(1)} ${metric.unit}`, metric.label]}
              />
              {/* Insulation limit reference line for temperature */}
              {metric.key === 'windingTemp' && (
                <ReferenceLine
                  y={nameplate.insulationClass === 'F' ? 155 : nameplate.insulationClass === 'H' ? 180 : nameplate.insulationClass === 'B' ? 130 : 105}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: 'Trip', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }}
                />
              )}
              <Area
                type="monotone"
                dataKey={metric.key}
                stroke={metric.color}
                strokeWidth={2}
                fill={`url(#grad-${metric.key})`}
                dot={false}
                activeDot={{ r: 4, fill: metric.color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="text-center">
              <LineChart className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Click &quot;Simulate 120min&quot; to generate a thermal trend prediction.</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Shows temperature response from cold start to thermal equilibrium.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}