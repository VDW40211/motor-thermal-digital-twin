'use client';

import { useMemo, useState } from 'react';
import { tempToColor } from '@/lib/motor/physics';
import { useMotorStore } from '@/store/motor-store';
import { Layers, Eye, ScanLine } from 'lucide-react';

/**
 * Motor Thermal Visualization — longitudinal cross-section
 *
 * Three view modes:
 *  - "section": Standard cutaway view, all components visible
 *  - "xray":    Outer shell translucent, internals glow through
 *  - "exploded": Components separate along shaft axis with labels
 *
 * Drop-in replacement: same default export, same store selectors,
 * same thermal-coloring contract as the previous version.
 */

type ViewMode = 'section' | 'xray' | 'exploded';

interface HoverInfo {
  name: string;
  temp?: number;
  x: number;
  y: number;
}

// ── Layout constants (SVG coordinate system, viewBox 0 0 600 380) ──
const SHAFT_Y = 205;
const FRAME_X = 100;
const FRAME_W = 320;
const FRAME_TOP = 130;
const FRAME_BOTTOM = 280;
const FRAME_RIGHT = FRAME_X + FRAME_W; // 420

const STATOR_X = FRAME_X + 15;   // 115
const STATOR_W = FRAME_W - 30;   // 290
const STATOR_TOP_Y = FRAME_TOP + 5;  // 135
const STATOR_TOP_H = 35;             // → 135-170
const STATOR_BOT_Y = 240;
const STATOR_BOT_H = 35;             // → 240-275

const WINDING_TOP_Y = 158;  // near air-gap edge of top stator
const WINDING_BOT_Y = 240;  // near air-gap edge of bottom stator
const WINDING_H = 10;

const ROTOR_X = FRAME_X + 20;   // 120
const ROTOR_W = FRAME_W - 40;   // 280
const ROTOR_Y = SHAFT_Y - 18;   // 187
const ROTOR_H = 36;             // 187-223

const FAN_CX = 458;
const FAN_CY = SHAFT_Y;

const N_SLOTS = 12;
const N_LAMINATIONS = 4;

export default function MotorSVG() {
  // ── Store selectors (identical to previous version) ──
  const thermal = useMotorStore((s) => s.thermal);
  const nameplate = useMotorStore((s) => s.nameplate);
  const riskLevel = useMotorStore((s) => s.riskLevel);
  const speed = useMotorStore((s) => s.operating.speed);

  // ── Local UI state (view mode + hover) ──
  const [viewMode, setViewMode] = useState<ViewMode>('section');
  const [hovered, setHovered] = useState<HoverInfo | null>(null);

  // ── Derived values (identical contract) ──
  const windingTemp = thermal?.windingTemp ?? 40;
  const frameTemp = thermal?.frameTemp ?? 30;
  const isRotating = speed > 0;

  const isExploded = viewMode === 'exploded';
  const isXray = viewMode === 'xray';
  const ex = isExploded ? 1 : 0;

  const windingColor = useMemo(() => tempToColor(windingTemp, 25, 180), [windingTemp]);
  const frameColor = useMemo(() => tempToColor(frameTemp, 25, 150), [frameTemp]);

  const riskGlow = useMemo(() => {
    switch (riskLevel) {
      case 'healthy':  return 'rgba(16, 185, 129, 0.3)';
      case 'monitor':  return 'rgba(6, 182, 212, 0.3)';
      case 'warning':  return 'rgba(245, 158, 11, 0.4)';
      case 'critical': return 'rgba(239, 68, 68, 0.5)';
      case 'emergency':return 'rgba(220, 38, 38, 0.7)';
      default:         return 'rgba(100, 116, 139, 0.3)';
    }
  }, [riskLevel]);

  // ── View toggle config ──
  const viewButtons: { mode: ViewMode; label: string; icon: typeof Eye }[] = [
    { mode: 'section',  label: 'Section',  icon: ScanLine },
    { mode: 'xray',     label: 'X-Ray',    icon: Eye },
    { mode: 'exploded', label: 'Exploded', icon: Layers },
  ];

  // ── Hover helpers ──
  const onHover = (info: HoverInfo) => setHovered(info);
  const clearHover = () => setHovered(null);

  return (
    <div className="space-y-3">
      {/* ===== VIEW MODE TOGGLE ===== */}
      <div className="flex gap-1.5 justify-center no-print">
        {viewButtons.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
              viewMode === mode
                ? 'bg-cyan-600/25 text-cyan-400 border-cyan-500/40'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 border-transparent'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ===== MOTOR SVG ===== */}
      <div className="relative flex items-center justify-center">
        {/* Risk-level ambient glow */}
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-40 transition-all duration-1000 pointer-events-none"
          style={{ background: `radial-gradient(circle at center, ${riskGlow}, transparent 65%)` }}
        />

        <svg
          viewBox="0 0 600 380"
          className="w-full max-w-[580px] relative z-10"
          role="img"
          aria-label={`Motor cross-section, view: ${viewMode}, winding temperature ${windingTemp.toFixed(1)} degrees Celsius`}
        >
          <defs>
            {/* ── Metallic gradients ── */}
            <linearGradient id="mt-frame" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="20%" stopColor="#64748b" />
              <stop offset="45%" stopColor="#94a3b8" />
              <stop offset="55%" stopColor="#94a3b8" />
              <stop offset="80%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            <linearGradient id="mt-stator" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            <linearGradient id="mt-shaft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="35%" stopColor="#cbd5e1" />
              <stop offset="50%" stopColor="#e2e8f0" />
              <stop offset="65%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>

            <linearGradient id="mt-rotor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#374151" />
              <stop offset="50%" stopColor="#4b5563" />
              <stop offset="100%" stopColor="#374151" />
            </linearGradient>

            <radialGradient id="mt-bearing" cx="0.35" cy="0.35">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="40%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#1e293b" />
            </radialGradient>

            <linearGradient id="mt-blade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>

            <linearGradient id="mt-fin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* ── Filters ── */}
            <filter id="mt-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.35" />
            </filter>

            <filter id="mt-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="mt-blur">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>

            {/* X-ray scan line gradient */}
            <linearGradient id="mt-xray-scan" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(6,182,212,0)" />
              <stop offset="50%" stopColor="rgba(6,182,212,0.15)" />
              <stop offset="100%" stopColor="rgba(6,182,212,0)" />
            </linearGradient>
          </defs>

          {/* ════════════════════════════════════════════ */}
          {/* X-RAY TINT OVERLAY                          */}
          {/* ════════════════════════════════════════════ */}
          {isXray && (
            <rect x="0" y="0" width="600" height="380" fill="rgba(6, 182, 212, 0.04)" pointerEvents="none" />
          )}

          {/* ════════════════════════════════════════════ */}
          {/* MOUNTING FEET (always in place)             */}
          {/* ════════════════════════════════════════════ */}
          <g opacity={isXray ? 0.25 : 1} style={{ transition: 'opacity 0.4s ease' }}>
            <rect x="115" y={FRAME_BOTTOM} width="55" height="28" rx="3" fill="url(#mt-frame)" stroke="#1e293b" strokeWidth="1" />
            <rect x="350" y={FRAME_BOTTOM} width="55" height="28" rx="3" fill="url(#mt-frame)" stroke="#1e293b" strokeWidth="1" />
            <circle cx="142" cy={FRAME_BOTTOM + 14} r="4" fill="#0f172a" stroke="#475569" strokeWidth="0.5" />
            <circle cx="377" cy={FRAME_BOTTOM + 14} r="4" fill="#0f172a" stroke="#475569" strokeWidth="0.5" />
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* SHAFT (drawn early, covered by rotor/ends)   */}
          {/* ════════════════════════════════════════════ */}
          <g
            onMouseEnter={() => onHover({ name: 'Shaft', x: 300, y: SHAFT_Y })}
            onMouseLeave={clearHover}
          >
            <rect
              x="25" y={SHAFT_Y - 5} width="555" height="10" rx="5"
              fill="url(#mt-shaft)" stroke="#334155" strokeWidth="0.5"
              filter="url(#mt-shadow)"
            />
            {/* Keyway on drive end */}
            <rect x="30" y={SHAFT_Y - 5} width="28" height="3" rx="1" fill="#0f172a" opacity="0.5" />
            {/* Shaft highlight */}
            <line x1="30" y1={SHAFT_Y - 3} x2="575" y2={SHAFT_Y - 3} stroke="#e2e8f0" strokeWidth="0.5" opacity="0.4" />
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* FRAME + COOLING FINS                        */}
          {/* (translucent in X-ray, stays in exploded)   */}
          {/* ════════════════════════════════════════════ */}
          <g
            style={{ opacity: isXray ? 0.12 : 1, transition: 'opacity 0.4s ease', pointerEvents: isXray ? 'none' : 'auto' }}
            onMouseEnter={() => onHover({ name: 'Frame / Housing', temp: frameTemp, x: 260, y: 100 })}
            onMouseLeave={clearHover}
          >
            {/* Frame body */}
            <rect
              x={FRAME_X} y={FRAME_TOP} width={FRAME_W} height={FRAME_BOTTOM - FRAME_TOP} rx="10"
              fill={isXray ? 'rgba(6, 182, 212, 0.05)' : frameColor}
              stroke={isXray ? 'rgba(6, 182, 212, 0.5)' : '#334155'}
              strokeWidth="1.5"
              filter="url(#mt-shadow)"
              className="transition-all duration-1000"
            />

            {/* Cooling fins — top */}
            {Array.from({ length: 9 }).map((_, i) => (
              <rect key={`fin-t-${i}`} x={115 + i * 35} y={FRAME_TOP - 8} width="3" height="8" rx="1"
                fill="url(#mt-fin)" opacity={isXray ? 0.2 : 0.7} />
            ))}
            {/* Cooling fins — bottom */}
            {Array.from({ length: 9 }).map((_, i) => (
              <rect key={`fin-b-${i}`} x={115 + i * 35} y={FRAME_BOTTOM} width="3" height="8" rx="1"
                fill="url(#mt-fin)" opacity={isXray ? 0.2 : 0.7} />
            ))}

            {/* Nameplate */}
            <rect x="215" y="142" width="90" height="18" rx="2" fill="#0f172a" stroke="#475569" strokeWidth="0.5" opacity={isXray ? 0.3 : 0.7} />
            <text x="260" y="154" textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="monospace" opacity={isXray ? 0.3 : 0.7}>
              {nameplate.ratedPower}kW · {nameplate.ratedVoltage}V
            </text>
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* TERMINAL BOX                                */}
          {/* ════════════════════════════════════════════ */}
          <g
            style={{ opacity: isXray ? 0.15 : 1, transition: 'opacity 0.4s ease', pointerEvents: isXray ? 'none' : 'auto' }}
            onMouseEnter={() => onHover({ name: 'Terminal Box', x: 260, y: 85 })}
            onMouseLeave={clearHover}
          >
            <rect x="205" y="92" width="110" height="38" rx="4" fill="url(#mt-frame)" stroke="#334155" strokeWidth="1" filter="url(#mt-shadow)" />
            <text x="260" y="115" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace" letterSpacing="3">U V W</text>
            {/* Cable gland */}
            <rect x="312" y="105" width="18" height="12" rx="2" fill="#475569" stroke="#1e293b" strokeWidth="0.5" />
            {/* Bolts */}
            {[212, 308].map(x => [99, 123].map(y => (
              <circle key={`tb-${x}-${y}`} cx={x} cy={y} r="2" fill="#0f172a" stroke="#475569" strokeWidth="0.3" />
            )))}
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* LEFT END BELL + BEARING (NDE)                */}
          {/* moves left in exploded                      */}
          {/* ════════════════════════════════════════════ */}
          <g
            style={{ transform: `translateX(${-50 * ex}px)`, opacity: isXray ? 0.15 : 1, transition: 'transform 0.5s ease, opacity 0.4s ease' }}
            onMouseEnter={() => onHover({ name: 'End Bell (NDE)', x: 80, y: 200 })}
            onMouseLeave={clearHover}
          >
            {/* End bell curved profile */}
            <path
              d={`M ${FRAME_X} ${FRAME_TOP} Q ${FRAME_X - 22} ${SHAFT_Y} ${FRAME_X} ${FRAME_BOTTOM} L ${FRAME_X} ${FRAME_TOP} Z`}
              fill="url(#mt-frame)" stroke="#334155" strokeWidth="1.5" filter="url(#mt-shadow)"
            />
            {/* Bearing housing */}
            <circle cx={FRAME_X - 8} cy={SHAFT_Y} r="20" fill="url(#mt-bearing)" stroke="#1e293b" strokeWidth="1.5" />
            <circle cx={FRAME_X - 8} cy={SHAFT_Y} r="11" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
            {/* Bearing balls */}
            {[0, 60, 120, 180, 240, 300].map(a => {
              const r = (a * Math.PI) / 180;
              return <circle key={`lba-${a}`} cx={FRAME_X - 8 + 7 * Math.cos(r)} cy={SHAFT_Y + 7 * Math.sin(r)} r="2" fill="#475569" />;
            })}
            {/* Mounting bolts */}
            {[45, 135, 225, 315].map(a => {
              const r = (a * Math.PI) / 180;
              return <circle key={`lbb-${a}`} cx={FRAME_X - 8 + 15 * Math.cos(r)} cy={SHAFT_Y + 15 * Math.sin(r)} r="2" fill="#0f172a" stroke="#475569" strokeWidth="0.3" />;
            })}
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* STATOR CORE + WINDINGS                      */}
          {/* moves left slightly in exploded             */}
          {/* ════════════════════════════════════════════ */}
          <g
            style={{ transform: `translateX(${-25 * ex}px)`, opacity: isXray ? 0.3 : 1, transition: 'transform 0.5s ease, opacity 0.4s ease' }}
            onMouseEnter={() => onHover({ name: 'Stator Windings', temp: windingTemp, x: 260, y: 200 })}
            onMouseLeave={clearHover}
          >
            {/* Stator core — top half */}
            <rect x={STATOR_X} y={STATOR_TOP_Y} width={STATOR_W} height={STATOR_TOP_H} fill="url(#mt-stator)" stroke="#1e293b" strokeWidth="0.5" />
            {/* Stator core — bottom half */}
            <rect x={STATOR_X} y={STATOR_BOT_Y} width={STATOR_W} height={STATOR_BOT_H} fill="url(#mt-stator)" stroke="#1e293b" strokeWidth="0.5" />

            {/* Lamination lines (stacked steel) */}
            {Array.from({ length: N_LAMINATIONS }).map((_, i) => (
              <g key={`lam-${i}`}>
                <line x1={STATOR_X + 3} y1={STATOR_TOP_Y + 5 + i * 7} x2={STATOR_X + STATOR_W - 3} y2={STATOR_TOP_Y + 5 + i * 7} stroke="#0f172a" strokeWidth="0.4" opacity="0.4" />
                <line x1={STATOR_X + 3} y1={STATOR_BOT_Y + 5 + i * 7} x2={STATOR_X + STATOR_W - 3} y2={STATOR_BOT_Y + 5 + i * 7} stroke="#0f172a" strokeWidth="0.4" opacity="0.4" />
              </g>
            ))}

            {/* Winding slots — top row (thermally colored) */}
            {Array.from({ length: N_SLOTS }).map((_, i) => (
              <rect
                key={`ws-t-${i}`}
                x={STATOR_X + 7 + i * 23} y={WINDING_TOP_Y} width="15" height={WINDING_H} rx="2"
                fill={windingColor} stroke="#1e293b" strokeWidth="0.5"
                filter={isXray ? 'url(#mt-glow)' : undefined}
                className="transition-all duration-1000"
              >
                <animate attributeName="opacity" values="0.8;1;0.8" dur="2.5s" begin={`${i * 0.12}s`} repeatCount="indefinite" />
              </rect>
            ))}
            {/* Winding slots — bottom row */}
            {Array.from({ length: N_SLOTS }).map((_, i) => (
              <rect
                key={`ws-b-${i}`}
                x={STATOR_X + 7 + i * 23} y={WINDING_BOT_Y} width="15" height={WINDING_H} rx="2"
                fill={windingColor} stroke="#1e293b" strokeWidth="0.5"
                filter={isXray ? 'url(#mt-glow)' : undefined}
                className="transition-all duration-1000"
              >
                <animate attributeName="opacity" values="0.8;1;0.8" dur="2.5s" begin={`${i * 0.12 + 0.5}s`} repeatCount="indefinite" />
              </rect>
            ))}

            {/* Coil end turns — left side (outside stator core) */}
            {Array.from({ length: 5 }).map((_, i) => (
              <g key={`cl-${i}`}>
                <circle cx={STATOR_X - 3} cy={STATOR_TOP_Y + 15 + i * 18} r="5"
                  fill={windingColor} opacity="0.6" stroke="#334155" strokeWidth="0.5"
                  className="transition-all duration-1000" />
                <circle cx={STATOR_X - 10} cy={STATOR_TOP_Y + 18 + i * 16} r="3.5"
                  fill={windingColor} opacity="0.4"
                  className="transition-all duration-1000" />
              </g>
            ))}
            {/* Coil end turns — right side */}
            {Array.from({ length: 5 }).map((_, i) => (
              <g key={`cr-${i}`}>
                <circle cx={STATOR_X + STATOR_W + 3} cy={STATOR_TOP_Y + 15 + i * 18} r="5"
                  fill={windingColor} opacity="0.6" stroke="#334155" strokeWidth="0.5"
                  className="transition-all duration-1000" />
                <circle cx={STATOR_X + STATOR_W + 10} cy={STATOR_TOP_Y + 18 + i * 16} r="3.5"
                  fill={windingColor} opacity="0.4"
                  className="transition-all duration-1000" />
              </g>
            ))}
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* ROTOR + SHAFT INDICATOR (stays center)      */}
          {/* ════════════════════════════════════════════ */}
          <g
            onMouseEnter={() => onHover({ name: 'Rotor & Shaft', x: 260, y: 205 })}
            onMouseLeave={clearHover}
            style={{ opacity: isXray ? 0.85 : 1, transition: 'opacity 0.4s ease' }}
          >
            {/* Rotor core */}
            <rect x={ROTOR_X} y={ROTOR_Y} width={ROTOR_W} height={ROTOR_H} rx="3"
              fill="url(#mt-rotor)" stroke="#1e293b" strokeWidth="0.5" />
            {/* Rotor lamination hint */}
            <line x1={ROTOR_X + 2} y1={SHAFT_Y} x2={ROTOR_X + ROTOR_W - 2} y2={SHAFT_Y} stroke="#0f172a" strokeWidth="0.3" opacity="0.3" />

            {/* Rotor bars (squirrel cage) */}
            {Array.from({ length: N_SLOTS }).map((_, i) => (
              <circle key={`rb-${i}`} cx={ROTOR_X + 10 + i * 23} cy={SHAFT_Y} r="3"
                fill="#f59e0b" opacity="0.55"
                className="transition-all duration-1000" />
            ))}

            {/* Rotation indicator (spinning marker on shaft) */}
            {isRotating && (
              <g style={{ transformOrigin: `260px ${SHAFT_Y}px`, animation: 'spin 1.5s linear infinite' }}>
                <circle cx="260" cy={SHAFT_Y} r="5" fill="#e2e8f0" opacity="0.9" />
                <line x1="260" y1={SHAFT_Y - 5} x2="260" y2={SHAFT_Y} stroke="#e2e8f0" strokeWidth="1.5" />
              </g>
            )}
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* RIGHT END BELL + BEARING (DE)               */}
          {/* moves right in exploded                     */}
          {/* ════════════════════════════════════════════ */}
          <g
            style={{ transform: `translateX(${25 * ex}px)`, opacity: isXray ? 0.15 : 1, transition: 'transform 0.5s ease, opacity 0.4s ease' }}
            onMouseEnter={() => onHover({ name: 'End Bell (DE)', x: 440, y: 200 })}
            onMouseLeave={clearHover}
          >
            <path
              d={`M ${FRAME_RIGHT} ${FRAME_TOP} Q ${FRAME_RIGHT + 22} ${SHAFT_Y} ${FRAME_RIGHT} ${FRAME_BOTTOM} L ${FRAME_RIGHT} ${FRAME_TOP} Z`}
              fill="url(#mt-frame)" stroke="#334155" strokeWidth="1.5" filter="url(#mt-shadow)"
            />
            <circle cx={FRAME_RIGHT + 8} cy={SHAFT_Y} r="20" fill="url(#mt-bearing)" stroke="#1e293b" strokeWidth="1.5" />
            <circle cx={FRAME_RIGHT + 8} cy={SHAFT_Y} r="11" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
            {/* Bearing balls */}
            {[0, 60, 120, 180, 240, 300].map(a => {
              const r = (a * Math.PI) / 180;
              return <circle key={`rba-${a}`} cx={FRAME_RIGHT + 8 + 7 * Math.cos(r)} cy={SHAFT_Y + 7 * Math.sin(r)} r="2" fill="#475569" />;
            })}
            {/* Mounting bolts */}
            {[45, 135, 225, 315].map(a => {
              const r = (a * Math.PI) / 180;
              return <circle key={`rbb-${a}`} cx={FRAME_RIGHT + 8 + 15 * Math.cos(r)} cy={SHAFT_Y + 15 * Math.sin(r)} r="2" fill="#0f172a" stroke="#475569" strokeWidth="0.3" />;
            })}
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* FAN + SHROUD                                */}
          {/* moves right more in exploded               */}
          {/* ════════════════════════════════════════════ */}
          <g
            style={{ transform: `translateX(${50 * ex}px)`, transition: 'transform 0.5s ease' }}
            onMouseEnter={() => onHover({ name: 'Cooling Fan', x: 500, y: 200 })}
            onMouseLeave={clearHover}
          >
            {/* Fan shroud */}
            <path
              d={`M ${FAN_CX - 2} 158 L ${FAN_CX - 2} 252 Q ${FAN_CX + 8} 262 ${FAN_CX + 18} 257 L ${FAN_CX + 18} 153 Q ${FAN_CX + 8} 148 ${FAN_CX - 2} 158 Z`}
              fill="url(#mt-frame)" stroke="#334155" strokeWidth="1"
              opacity={isXray ? 0.15 : 0.85} filter="url(#mt-shadow)"
              className="transition-all duration-500"
            />
            {/* Shroud grille bars */}
            {Array.from({ length: 5 }).map((_, i) => (
              <line key={`grille-${i}`} x1={FAN_CX + 3} y1={168 + i * 18} x2={FAN_CX + 13} y2={168 + i * 18}
                stroke="#475569" strokeWidth="1.5" opacity={isXray ? 0.1 : 0.5} />
            ))}

            {/* Fan hub */}
            <circle cx={FAN_CX} cy={FAN_CY} r="13" fill="url(#mt-bearing)" stroke="#1e293b" strokeWidth="1" />

            {/* Fan blades (curved, spinning with motion blur) */}
            <g
              style={{
                transformOrigin: `${FAN_CX}px ${FAN_CY}px`,
                animation: isRotating ? 'spin 1.2s linear infinite' : 'none',
                filter: isRotating ? 'url(#mt-blur)' : 'none',
              }}
            >
              {[0, 60, 120, 180, 240, 300].map(angle => {
                const rad = (angle * Math.PI) / 180;
                const len = 36;
                const x2 = FAN_CX + len * Math.cos(rad);
                const y2 = FAN_CY + len * Math.sin(rad);
                const cp1x = FAN_CX + 12 * Math.cos(rad + 0.35);
                const cp1y = FAN_CY + 12 * Math.sin(rad + 0.35);
                const cp2x = FAN_CX + 25 * Math.cos(rad + 0.15);
                const cp2y = FAN_CY + 25 * Math.sin(rad + 0.15);
                const cp3x = FAN_CX + 15 * Math.cos(rad - 0.15);
                const cp3y = FAN_CY + 15 * Math.sin(rad - 0.15);
                return (
                  <path
                    key={`blade-${angle}`}
                    d={`M ${FAN_CX} ${FAN_CY} Q ${cp1x} ${cp1y} ${cp2x} ${cp2y} L ${x2} ${y2} Q ${cp3x} ${cp3y} ${FAN_CX} ${FAN_CY} Z`}
                    fill="url(#mt-blade)" stroke="#475569" strokeWidth="0.5" opacity="0.85"
                  />
                );
              })}
            </g>

            {/* Hub cap */}
            <circle cx={FAN_CX} cy={FAN_CY} r="5" fill="#0f172a" stroke="#475569" strokeWidth="0.5" />
            <circle cx={FAN_CX} cy={FAN_CY} r="2" fill="#475569" />
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* AIRFLOW PARTICLES (TEFC, rotating, not exploded) */}
          {/* ════════════════════════════════════════════ */}
          {isRotating && !isExploded && nameplate.enclosureType === 'TEFC' && (
            <g opacity="0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <circle
                  key={`air-${i}`}
                  cx={FAN_CX + 35}
                  cy={162 + i * 16}
                  r="1.5"
                  fill="#06b6d4"
                  style={{ animation: 'airflow 2s ease-out infinite', animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </g>
          )}

          {/* ════════════════════════════════════════════ */}
          {/* EXPLODED VIEW LABELS                         */}
          {/* ════════════════════════════════════════════ */}
          {isExploded && (
            <g className="animate-fade-in-up" opacity="0.6">
              {/* NDE Bell */}
              <line x1="55" y1="125" x2="55" y2="105" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
              <text x="55" y="100" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">NDE Bell</text>
              {/* Stator */}
              <line x1="235" y1="125" x2="235" y2="105" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
              <text x="235" y="100" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">Stator</text>
              {/* Rotor */}
              <line x1="260" y1="225" x2="260" y2="250" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
              <text x="260" y="265" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">Rotor & Shaft</text>
              {/* DE Bell */}
              <line x1="445" y1="125" x2="445" y2="105" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
              <text x="445" y="100" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">DE Bell</text>
              {/* Fan */}
              <line x1="510" y1="150" x2="510" y2="130" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
              <text x="510" y="125" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">Fan</text>
            </g>
          )}

          {/* ════════════════════════════════════════════ */}
          {/* TEMPERATURE READOUT (center, always visible) */}
          {/* ════════════════════════════════════════════ */}
          <g pointerEvents="none">
            <rect x="205" y="190" width="110" height="30" rx="6"
              fill="rgba(0,0,0,0.7)" stroke={windingColor} strokeWidth="0.5" opacity="0.9" />
            <text x="260" y="210" textAnchor="middle" fill={windingColor} fontSize="16" fontFamily="monospace" fontWeight="bold">
              {windingTemp.toFixed(1)}°C
            </text>
          </g>

          {/* ════════════════════════════════════════════ */}
          {/* HOVER TOOLTIP (dynamic)                     */}
          {/* ════════════════════════════════════════════ */}
          {hovered && (
            <g className="pointer-events-none">
              <rect
                x={hovered.x - 55} y={hovered.y - 45}
                width="110" height={hovered.temp !== undefined ? 34 : 20}
                rx="4"
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(6, 182, 212, 0.4)"
                strokeWidth="0.5"
              />
              <text x={hovered.x} y={hovered.y - 32} textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="monospace" fontWeight="bold">
                {hovered.name}
              </text>
              {hovered.temp !== undefined && (
                <text x={hovered.x} y={hovered.y - 18} textAnchor="middle" fill={tempToColor(hovered.temp)} fontSize="10" fontFamily="monospace" fontWeight="bold">
                  {hovered.temp.toFixed(1)}°C
                </text>
              )}
            </g>
          )}

          {/* ════════════════════════════════════════════ */}
          {/* MOTOR INFO (bottom label — same as before) */}
          {/* ════════════════════════════════════════════ */}
          <text x="300" y="355" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace" opacity="0.6">
            {nameplate.enclosureType} · Class {nameplate.insulationClass} · {nameplate.ratedPower} kW · {nameplate.poles}P
          </text>
        </svg>
      </div>
    </div>
  );
}
