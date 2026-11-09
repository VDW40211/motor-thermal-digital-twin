'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotorStore } from '@/store/motor-store';
import KPICards from '@/components/motor/KPICards';
import MotorSVG from '@/components/motor/MotorSVG';
import MotorInfoForm from '@/components/motor/MotorInfoForm';
import OperatingForm from '@/components/motor/OperatingForm';
import RootCausePanel from '@/components/motor/RootCausePanel';
import TrendChart from '@/components/motor/TrendChart';
import CalculationPanel from '@/components/motor/CalculationPanel';
import LossBreakdown from '@/components/motor/LossBreakdown';
import ExportMenu from '@/components/motor/ExportMenu';
import DisclaimerFooter from '@/components/motor/DisclaimerFooter';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RotateCcw, Cpu, BarChart3, Settings, Wrench } from 'lucide-react';

export default function Home() {
  const recalculate = useMotorStore((s) => s.recalculate);
  const resetThermalState = useMotorStore((s) => s.resetThermalState);
  const loadDefaults = useMotorStore((s) => s.loadDefaults);
  const thermal = useMotorStore((s) => s.thermal);
  const [mounted, setMounted] = useState(false);

  // Initialize on mount — reset thermal state and run first calculation
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    resetThermalState();
    // Use microtask to avoid synchronous setState in effect
    queueMicrotask(() => setMounted(true));
  }, [resetThermalState]);

  // Re-run calculation when thermal model is ready
  useEffect(() => {
    if (mounted) {
      recalculate();
    }
  }, [mounted, recalculate]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-grid">
        <div className="text-center space-y-3">
          <Cpu className="w-10 h-10 mx-auto text-cyan-400 animate-pulse" />
          <p className="text-muted-foreground text-sm">Initializing thermal model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-grid">
      {/* ===== HEADER / NAVBAR ===== */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl no-print">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Cpu className="w-6 h-6 text-cyan-400" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
                Motor Thermal Digital Twin
              </h1>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                Sensor-Free Thermal Estimation • IEEE / IEC / NEMA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetThermalState}
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Cold Start
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDefaults}
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-3.5 h-3.5" />
              Defaults
            </Button>
            <ExportMenu />
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-4 space-y-4">

        {/* KPI Dashboard */}
        <section className="animate-fade-in-up">
          <KPICards />
        </section>

        {/* 3-Column Layout: Motor Info | Motor SVG | Operating Conditions */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-fade-in-up animate-delay-100">
          {/* Left Panel — Motor Nameplate */}
          <div className="lg:col-span-3 space-y-4 order-2 lg:order-1">
            <MotorInfoForm />
          </div>

          {/* Center — Motor SVG + Loss Breakdown */}
          <div className="lg:col-span-5 space-y-4 order-1 lg:order-2">
            <div className="glass-card glass-card-glow p-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/30 mb-3">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Motor Thermal Map
                </h3>
                {thermal && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {thermal.windingTemp.toFixed(1)}°C winding
                  </span>
                )}
              </div>
              <MotorSVG />
            </div>
            <LossBreakdown />
          </div>

          {/* Right Panel — Operating Conditions */}
          <div className="lg:col-span-4 space-y-4 order-3">
            <OperatingForm />
          </div>
        </section>

        {/* Lower Section — Tabs: Analysis, Simulation, Engineering */}
        <section className="animate-fade-in-up animate-delay-200">
          <Tabs defaultValue="analysis" className="w-full">
            <TabsList className="bg-muted/20 border border-border/30 h-9">
              <TabsTrigger value="analysis" className="text-xs gap-1.5 h-7 data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400">
                <BarChart3 className="w-3.5 h-3.5" />
                Analysis
              </TabsTrigger>
              <TabsTrigger value="simulation" className="text-xs gap-1.5 h-7 data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400">
                <Cpu className="w-3.5 h-3.5" />
                Simulation
              </TabsTrigger>
              <TabsTrigger value="engineering" className="text-xs gap-1.5 h-7 data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400">
                <Wrench className="w-3.5 h-3.5" />
                Engineering
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analysis" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RootCausePanel />
                <TrendChart />
              </div>
            </TabsContent>

            <TabsContent value="simulation" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TrendChart />
                <CalculationPanel />
              </div>
            </TabsContent>

            <TabsContent value="engineering" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CalculationPanel />
                <LossBreakdown />
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <DisclaimerFooter />
    </div>
  );
}