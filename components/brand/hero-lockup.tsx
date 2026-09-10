'use client';

/**
 * Hero lockup — the home page's brand mark.
 *
 * Drawn in code rather than shipped as a bitmap so it stays crisp at any size
 * and recolors with the theme. Four layered pieces, back to front:
 *
 *   1. halo        — soft radial bloom behind the whole lockup
 *   2. orbits      — two elliptical rings with a light that travels each path
 *   3. badges      — floating tiles (graduation cap, robot) on the orbit line
 *   4. hex         — the extruded hexagonal shield with the flame glyph
 *
 * The extrusion is faked with a side face (dark ramp) sitting under a top face
 * (bright ramp) offset by a few units, which is enough to read as 3D at this
 * size without a real lighting model.
 */

import { cn } from '@/lib/utils';

interface HeroLockupProps {
  className?: string;
}

/** Shared gradient stops for the two orbit rings — cyan at the left pole,
 *  magenta at the right, matching the badges' rim colors. */
const ORBIT_STOPS = (
  <>
    <stop offset="0%" stopColor="#22d3ee" />
    <stop offset="45%" stopColor="#818cf8" />
    <stop offset="100%" stopColor="#e879f9" />
  </>
);

export function HeroLockup({ className }: HeroLockupProps) {
  return (
    <div className={cn('relative select-none', className)} aria-hidden="true">
      <svg
        viewBox="0 0 360 180"
        role="presentation"
        className="w-full h-auto overflow-visible"
        style={{ filter: 'drop-shadow(0 18px 40px rgba(99, 102, 241, 0.35))' }}
      >
        <defs>
          {/* ── Orbit ring stroke ── */}
          <linearGradient id="hl-orbit" x1="0" y1="0" x2="1" y2="0">
            {ORBIT_STOPS}
          </linearGradient>

          {/* ── Hexagon: top face + side face ── */}
          <linearGradient id="hl-hex-top" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="42%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="hl-hex-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4c1d95" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>

          {/* ── Flame glyph ── */}
          <linearGradient id="hl-flame" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>

          {/* ── Floating badges ── */}
          <linearGradient id="hl-badge-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="hl-badge-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4338ca" />
          </linearGradient>

          {/* ── Bloom behind the hexagon ── */}
          <radialGradient id="hl-halo" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>

          {/* Orbit paths, reused for the travelling lights. */}
          <path id="hl-path-upper" d="M 24 96 C 90 40, 270 40, 336 96" fill="none" />
          <path id="hl-path-lower" d="M 24 84 C 90 148, 270 148, 336 84" fill="none" />
        </defs>

        {/* 1 ── Halo */}
        <ellipse cx="180" cy="90" rx="150" ry="80" fill="url(#hl-halo)" />

        {/* 2 ── Orbits */}
        <g fill="none" strokeLinecap="round">
          <path
            d="M 24 96 C 90 40, 270 40, 336 96"
            stroke="url(#hl-orbit)"
            strokeWidth="2"
            opacity="0.85"
          />
          <path
            d="M 24 84 C 90 148, 270 148, 336 84"
            stroke="url(#hl-orbit)"
            strokeWidth="1.5"
            opacity="0.5"
          />
        </g>
        {/* Travelling lights — one per orbit, opposite directions. */}
        <g className="motion-safe:animate-none">
          <circle r="3.5" fill="#e0f2fe">
            <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
              <mpath href="#hl-path-upper" />
            </animateMotion>
          </circle>
          <circle r="2.5" fill="#f5d0fe">
            <animateMotion dur="9s" repeatCount="indefinite" rotate="auto" keyPoints="1;0" keyTimes="0;1" calcMode="linear">
              <mpath href="#hl-path-lower" />
            </animateMotion>
          </circle>
        </g>

        {/* 3 ── Floating badges, sitting on the orbit line */}
        <g className="motion-safe:animate-[hl-float_5s_ease-in-out_infinite]">
          {/* Graduation cap — left */}
          <g transform="translate(58 66) rotate(-14)">
            <rect width="44" height="44" rx="13" fill="url(#hl-badge-a)" />
            <rect
              width="44"
              height="44"
              rx="13"
              fill="none"
              stroke="#bae6fd"
              strokeOpacity="0.6"
              strokeWidth="1.5"
            />
            <path
              d="M12 19 L22 14 L32 19 L22 24 Z M16 21.5 V27 C16 27 18.5 30 22 30 C25.5 30 28 27 28 27 V21.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <g
          className="motion-safe:animate-[hl-float_6s_ease-in-out_infinite]"
          style={{ animationDelay: '-2.5s' }}
        >
          {/* Robot — right */}
          <g transform="translate(258 66) rotate(14)">
            <rect width="44" height="44" rx="13" fill="url(#hl-badge-b)" />
            <rect
              width="44"
              height="44"
              rx="13"
              fill="none"
              stroke="#c7d2fe"
              strokeOpacity="0.6"
              strokeWidth="1.5"
            />
            <path
              d="M16 17 H28 A4 4 0 0 1 32 21 V27 A4 4 0 0 1 28 31 H16 A4 4 0 0 1 12 27 V21 A4 4 0 0 1 16 17 Z"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <circle cx="18" cy="24" r="2.4" fill="#ffffff" />
            <circle cx="26" cy="24" r="2.4" fill="#ffffff" />
            <path d="M22 13 V17" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="22" cy="12" r="1.6" fill="#ffffff" />
          </g>
        </g>

        {/* 4 ── Hexagonal shield, extruded */}
        <g transform="translate(180 88)">
          {/* Side face: same hexagon pushed down, filling the gap the top face
              leaves behind so the pair reads as a solid extruded block. */}
          <path
            d="M0 -46 L40 -23 L40 28 L0 51 L-40 28 L-40 -23 Z"
            transform="translate(0 6)"
            fill="url(#hl-hex-side)"
          />
          {/* Top face */}
          <path
            d="M0 -46 L40 -23 L40 28 L0 51 L-40 28 L-40 -23 Z"
            fill="url(#hl-hex-top)"
            stroke="#c7d2fe"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
          {/* Inner bevel line, inset from the rim. */}
          <path
            d="M0 -34 L30 -17 L30 22 L0 39 L-30 22 L-30 -17 Z"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.28"
            strokeWidth="1.5"
          />
          {/* Flame glyph */}
          <path
            d="M0 -22 C 9 -10, 17 -3, 17 7 C 17 19, 9 27, 0 27 C -9 27, -17 19, -17 7 C -17 -3, -9 -10, 0 -22 Z"
            fill="url(#hl-flame)"
          />
          <path
            d="M0 -4 C 5 2, 8 6, 8 11 C 8 17, 4 21, 0 21 C -4 21, -8 17, -8 11 C -8 6, -5 2, 0 -4 Z"
            fill="#6366f1"
            fillOpacity="0.55"
          />
        </g>
      </svg>
    </div>
  );
}

export default HeroLockup;
