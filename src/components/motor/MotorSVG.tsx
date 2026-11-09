'use client';

import { useMemo } from 'react';
import { tempToColor } from '@/lib/motor/physics';
import { useMotorStore } from '@/store/motor-store';

export default function MotorSVG() {
  const thermal = useMotorStore((s) => s.thermal);
  const nameplate = useMotorStore((s) => s.nameplate);
  const riskLevel = useMotorStore((s) => s.riskLevel);

  const windingTemp = thermal?.windingTemp ?? 40;
  const frameTemp = thermal?.frameTemp ?? 30;
  const isRotating = useMotorStore((s) => s.operating.speed) > 0;

  const windingColor = useMemo(() => tempToColor(windingTemp, 25, 180), [windingTemp]);
  const frameColor = useMemo(() => tempToColor(frameTemp, 25, 150), [frameTemp]);

  const riskGlow = useMemo(() => {
    switch (riskLevel) {
      case 'healthy': return 'rgba(16, 185, 129, 0.3)';
      case 'monitor': return 'rgba(6, 182, 212, 0.3)';
      case 'warning': return 'rgba(245, 158, 11, 0.4)';
      case 'critical': return 'rgba(239, 68, 68, 0.5)';
      case 'emergency': return 'rgba(220, 38, 38, 0.7)';
      default: return 'rgba(100, 116, 139, 0.3)';
    }
  }, [riskLevel]);

  return (
    <div className="relative flex items-center justify-center">
      {/* Glow effect behind motor */}
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-50 transition-all duration-1000"
        style={{ background: `radial-gradient(circle, ${riskGlow}, transparent 70%)` }}
      />

      <svg viewBox="0 0 300 280" className="w-full max-w-[320px] drop-shadow-2xl" aria-label="Motor cross-section thermal map">
        {/* Definitions */}
        <defs>
          <linearGradient id="statorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="frameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={frameColor} />
            <stop offset="100%" stopColor={frameColor} stopOpacity="0.8" />
          </linearGradient>
          <filter id="motorShadow">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Frame / Housing */}
        <rect x="30" y="20" width="240" height="220" rx="20" ry="20"
          fill={frameColor} stroke="#334155" strokeWidth="2" filter="url(#motorShadow)"
          className="transition-all duration-1000" />

        {/* Frame ribs */}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={y} x1="30" y1={y} x2="45" y2={y} stroke="#1e293b" strokeWidth="1.5" opacity="0.3" />
        ))}
        {[50, 90, 130, 170, 210].map((y) => (
          <line key={`r-${y}`} x1="255" y1={y} x2="270" y2={y} stroke="#1e293b" strokeWidth="1.5" opacity="0.3" />
        ))}

        {/* Stator core (outer ring) */}
        <circle cx="150" cy="130" r="90" fill="url(#statorGrad)" stroke="#475569" strokeWidth="1.5" />

        {/* Stator windings — colored by temperature */}
        {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x = 150 + 72 * Math.cos(rad);
          const y = 130 + 72 * Math.sin(rad);
          return (
            <circle
              key={`winding-${angle}`}
              cx={x} cy={y} r="7"
              fill={windingColor}
              stroke="#334155" strokeWidth="1"
              className="transition-all duration-1000"
            >
              <animate
                attributeName="opacity"
                values="0.8;1;0.8"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          );
        })}

        {/* Air gap */}
        <circle cx="150" cy="130" r="55" fill="none" stroke="#0f172a" strokeWidth="3" opacity="0.4" />

        {/* Rotor core */}
        <circle cx="150" cy="130" r="50" fill="#374151" stroke="#4b5563" strokeWidth="1" />

        {/* Rotor bars */}
        {[15, 55, 95, 135, 175, 215, 255, 295, 335].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x = 150 + 38 * Math.cos(rad);
          const y = 130 + 38 * Math.sin(rad);
          return (
            <circle
              key={`rotor-${angle}`}
              cx={x} cy={y} r="4"
              fill="#f59e0b"
              opacity="0.7"
              className="transition-all duration-1000"
            />
          );
        })}

        {/* Shaft */}
        <circle cx="150" cy="130" r="12" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />

        {/* Shaft keyway */}
        <rect x="145" y="118" width="10" height="8" rx="1" fill="#64748b" />

        {/* Shaft rotation indicator */}
        {isRotating && (
          <line
            x1="150" y1="118" x2="150" y2="130"
            stroke="#e2e8f0" strokeWidth="2"
            className="origin-[150px_130px]"
            style={{ animation: 'spin 2s linear infinite' }}
          />
        )}

        {/* Bearings */}
        <ellipse cx="150" cy="18" rx="18" ry="8" fill="#475569" stroke="#64748b" strokeWidth="1.5" />
        <ellipse cx="150" cy="242" rx="18" ry="8" fill="#475569" stroke="#64748b" strokeWidth="1.5" />

        {/* Fan (right side) */}
        <g className="origin-[270px_130px]" style={{ animation: isRotating ? 'spin 1.5s linear infinite' : 'none' }}>
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <line
                key={`fan-${angle}`}
                x1="270" y1="130"
                x2={270 + 20 * Math.cos(rad)}
                y2={130 + 20 * Math.sin(rad)}
                stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"
              />
            );
          })}
          <circle cx="270" cy="130" r="6" fill="#64748b" />
        </g>

        {/* Terminal box */}
        <rect x="65" y="240" width="50" height="25" rx="4" fill="#475569" stroke="#64748b" strokeWidth="1.5" />
        <text x="90" y="257" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">T1 T2 T3</text>

        {/* Temperature label */}
        <g>
          <rect x="95" y="160" width="110" height="28" rx="6" fill="rgba(0,0,0,0.5)" />
          <text x="150" y="178" textAnchor="middle" fill={windingColor} fontSize="13" fontFamily="monospace" fontWeight="bold">
            {windingTemp.toFixed(1)}°C
          </text>
        </g>

        {/* Enclosure type label */}
        <text x="150" y="272" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace" opacity="0.6">
          {nameplate.enclosureType} • {nameplate.insulationClass} Class • {nameplate.ratedPower} kW
        </text>
      </svg>

      {/* Airflow particles for TEFC */}
      {nameplate.enclosureType === 'TEFC' && isRotating && (
        <div className="absolute right-[-10px] top-0 bottom-0 w-8 overflow-hidden opacity-40">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-cyan-400"
              style={{
                left: `${10 + (i % 2) * 10}px`,
                top: `${20 + i * 22}%`,
                animation: `airflow 2s ease-out infinite`,
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}