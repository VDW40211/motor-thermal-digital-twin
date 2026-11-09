'use client';

import { useMemo, useEffect, useRef, useState } from 'react';

interface GaugeProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  size?: number;
  colorStops?: { at: number; color: string }[];
  showValue?: boolean;
}

export default function GaugeWidget({
  value,
  min,
  max,
  label,
  unit,
  size = 120,
  colorStops,
  showValue = true,
}: GaugeProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  const defaultColorStops = [
    { at: 0, color: '#10b981' },
    { at: 0.6, color: '#06b6d4' },
    { at: 0.75, color: '#f59e0b' },
    { at: 0.9, color: '#ef4444' },
    { at: 1.0, color: '#dc2626' },
  ];

  const stops = colorStops ?? defaultColorStops;

  // Animate value changes
  useEffect(() => {
    const diff = value - prevValue.current;
    if (Math.abs(diff) < 0.1) {
      setDisplayValue(value);
      prevValue.current = value;
      return;
    }
    const duration = 600;
    const steps = 30;
    const stepTime = duration / steps;
    const stepValue = diff / steps;
    let current = prevValue.current;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current += stepValue;
      setDisplayValue(current);
      if (step >= steps) {
        setDisplayValue(value);
        prevValue.current = value;
        clearInterval(interval);
      }
    }, stepTime);

    return () => clearInterval(interval);
  }, [value]);

  const fraction = useMemo(() => {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }, [value, min, max]);

  const gaugeColor = useMemo(() => {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (fraction >= stops[i].at) return stops[i].color;
    }
    return stops[0].color;
  }, [fraction, stops]);

  // SVG arc parameters
  const radius = (size - 16) / 2;
  const cx = size / 2;
  const cy = size / 2 + 5;
  const startAngle = -225;
  const endAngle = 45;
  const totalAngle = endAngle - startAngle; // 270 degrees
  const valueAngle = startAngle + totalAngle * fraction;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const arcPath = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.8}`}>
        {/* Background arc */}
        <path
          d={arcPath(startAngle, endAngle)}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={arcPath(startAngle, valueAngle)}
          fill="none"
          stroke={gaugeColor}
          strokeWidth="10"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${gaugeColor}40)` }}
          className="transition-all duration-700 ease-out"
        />
        {/* Value text */}
        {showValue && (
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={gaugeColor}
            fontSize={size * 0.18}
            fontFamily="monospace"
            fontWeight="bold"
          >
            {displayValue.toFixed(fraction > 10 ? 0 : 1)}
          </text>
        )}
        {showValue && (
          <text
            x={cx}
            y={cy + size * 0.12}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize={size * 0.09}
            fontFamily="sans-serif"
          >
            {unit}
          </text>
        )}
        {/* Min/Max labels */}
        <text x={polarToCartesian(startAngle).x} y={polarToCartesian(startAngle).y + 14} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
          {min}
        </text>
        <text x={polarToCartesian(endAngle).x} y={polarToCartesian(endAngle).y + 14} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
          {max}
        </text>
      </svg>
      <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}