'use client';

import React from 'react';
import { useMotorStore } from '@/store/motor-store';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function CalculationPanel() {
  const calculations = useMotorStore((s) => s.calculations);
  const losses = useMotorStore((s) => s.losses);
  const thermal = useMotorStore((s) => s.thermal);
  const confidence = useMotorStore((s) => s.confidence);

  if (!calculations.length || !losses || !thermal) return null;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border/30">
        <div className="w-2 h-2 rounded-full bg-violet-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Engineering Calculations</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Full transparency</span>
      </div>

      <Accordion type="multiple" className="w-full">
        {/* Loss Breakdown */}
        <AccordionItem value="losses" className="border-border/30">
          <AccordionTrigger className="text-xs font-semibold hover:no-underline py-2">
            Loss Segregation (IEEE 112)
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-muted-foreground">Copper Loss (I²R)</span>
                <span className="font-mono text-right">{losses.copperLoss.toFixed(1)} W</span>
                <span className="text-muted-foreground">Core Loss (Steinmetz)</span>
                <span className="font-mono text-right">{losses.coreLoss.toFixed(1)} W</span>
                <span className="text-muted-foreground">Mechanical Loss</span>
                <span className="font-mono text-right">{losses.mechanicalLoss.toFixed(1)} W</span>
                <span className="text-muted-foreground">Stray Load Loss</span>
                <span className="font-mono text-right">{losses.strayLoadLoss.toFixed(1)} W</span>
                <div className="border-t border-border/30 pt-1 col-span-2 grid grid-cols-2">
                  <span className="font-semibold">Total Losses</span>
                  <span className="font-mono font-bold text-right">{losses.totalLosses.toFixed(1)} W</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Loss split ratios: Cu 60%, Core 20%, Mech 10%, Stray 10% (industry approximation for general-purpose motors)
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Thermal Model */}
        <AccordionItem value="thermal" className="border-border/30">
          <AccordionTrigger className="text-xs font-semibold hover:no-underline py-2">
            Thermal Model (First-Order ODE)
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-1 text-xs">
              <div className="grid grid-cols-2 gap-1">
                <span className="text-muted-foreground">Steady-State Rise</span>
                <span className="font-mono text-right">{thermal.steadyStateRise.toFixed(1)} °C</span>
                <span className="text-muted-foreground">Current Winding Temp</span>
                <span className="font-mono text-right">{thermal.windingTemp.toFixed(1)} °C</span>
                <span className="text-muted-foreground">Frame Temp (est.)</span>
                <span className="font-mono text-right">{thermal.frameTemp.toFixed(1)} °C</span>
                <span className="text-muted-foreground">Time Constant (τ)</span>
                <span className="font-mono text-right">{thermal.timeConstant.toFixed(1)} min</span>
                <span className="text-muted-foreground">Cooling Effectiveness</span>
                <span className="font-mono text-right">{(thermal.coolingEffectiveness * 100).toFixed(0)}%</span>
                <span className="text-muted-foreground">Hot Resistance</span>
                <span className="font-mono text-right">{thermal.hotResistance.toFixed(4)} Ω</span>
              </div>
              <div className="bg-muted/20 rounded p-2 mt-2 font-mono text-[10px] text-muted-foreground leading-relaxed">
                θ(t) = θ_ss - (θ_ss - θ₀) × e^(-t/τ)<br />
                ΔT_ss = P_total / G_thermal × (1 / cooling_eff)<br />
                R_hot = R_cold × (235 + T_hot) / (235 + T_cold)
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Confidence Details */}
        {confidence && (
          <AccordionItem value="confidence" className="border-border/30">
            <AccordionTrigger className="text-xs font-semibold hover:no-underline py-2">
              Confidence Score ({confidence.score}%)
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 pt-1 text-xs">
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <span className="text-muted-foreground font-semibold">Data Point</span>
                  <span className="text-muted-foreground font-semibold text-center">Available</span>
                  <span className="text-muted-foreground font-semibold text-right">Points</span>
                  {confidence.factors.map((f, i) => (
                    <React.Fragment key={i}>
                      <span className="text-muted-foreground">{f.name}</span>
                      <span className="text-center">{f.contributed ? '✓' : '—'}</span>
                      <span className="font-mono text-right">{f.points > 0 ? `+${f.points}` : '—'}</span>
                    </React.Fragment>
                  ))}
                </div>
                {confidence.missing.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-semibold text-amber-400">Assumptions Made:</p>
                    {confidence.missing.map((m, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground">• {m}</p>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  {confidence.explanation}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Step-by-step calculations */}
        {calculations.map((calc) => (
          <AccordionItem key={calc.id} value={`calc-${calc.id}`} className="border-border/30">
            <AccordionTrigger className="text-xs font-semibold hover:no-underline py-2">
              {calc.title}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 pt-1 text-xs">
                <div className="bg-muted/20 rounded p-2 font-mono text-[11px] text-cyan-400">
                  {calc.equation}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(calc.inputs).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-mono text-right">{v}</span>
                    </React.Fragment>
                  ))}
                  <div className="border-t border-border/30 pt-1 col-span-2 grid grid-cols-2">
                    <span className="font-semibold">Result</span>
                    <span className="font-mono font-bold text-right">{calc.result} {calc.unit ?? ''}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 italic">Reference: {calc.reference}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}