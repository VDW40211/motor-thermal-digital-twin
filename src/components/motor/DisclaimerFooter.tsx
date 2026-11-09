'use client';

import { useMotorStore } from '@/store/motor-store';
import { Button } from '@/components/ui/button';
import { RotateCcw, Info } from 'lucide-react';
import { INSULATION_LIMITS } from '@/lib/motor/types';

export default function DisclaimerFooter() {
  return (
    <footer className="mt-auto border-t border-border/30 bg-background/80 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-start gap-2 max-w-2xl">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500/60" />
          <p>
            <strong className="text-foreground/70">Engineering Disclaimer:</strong> This is a sensor-free estimation tool using a lumped-parameter first-order thermal model.
            Not a replacement for physical temperature measurement. Real motors have distributed thermal networks.
            Results are indicative for monitoring trends, not absolute values.{' '}
            <span className="text-muted-foreground/60">
              References: IEEE 112, IEC 60034-1, IEC 60034-2, NEMA MG-1, Steinmetz equation, Montsinger&apos;s rule.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground/40">Motor Thermal Digital Twin v1.0</span>
        </div>
      </div>
    </footer>
  );
}