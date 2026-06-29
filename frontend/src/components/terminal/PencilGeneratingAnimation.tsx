'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Pencil drawing animation — Uiverse gustavofusco, branded Xroga AI */
export function PencilGeneratingAnimation({
  className,
  label = 'Generating your image',
  sublabel = 'Xroga AI · Agnes Image Studio',
}: {
  className?: string;
  label?: string;
  sublabel?: string;
}) {
  const clipId = useId().replace(/:/g, '');

  return (
    <div
      className={cn(
        'xv-image-gen-card xv-pencil-loader relative overflow-hidden rounded-2xl border border-[#006aff]/25 bg-gradient-to-br from-[#006aff]/8 via-[#0a0a12] to-purple-950/20 p-6',
        className
      )}
    >
      <div className="relative flex flex-col items-center justify-center gap-5 min-h-[240px]">
        <div className="xv-pencil-wrap text-[#006aff]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 200"
            className="pencil"
            aria-hidden
          >
            <defs>
              <clipPath id={`pencil-eraser-${clipId}`}>
                <rect height="30" width="30" ry="5" rx="5" />
              </clipPath>
            </defs>
            <circle
              transform="rotate(-113,100,100)"
              strokeLinecap="round"
              strokeDashoffset="439.82"
              strokeDasharray="439.82 439.82"
              strokeWidth="2"
              stroke="currentColor"
              fill="none"
              r="70"
              className="pencil__stroke"
            />
            <g transform="translate(100,100)" className="pencil__rotate">
              <g fill="none">
                <circle
                  transform="rotate(-90)"
                  strokeDashoffset="402"
                  strokeDasharray="402.12 402.12"
                  strokeWidth="30"
                  stroke="hsl(220,90%,50%)"
                  r="64"
                  className="pencil__body1"
                />
                <circle
                  transform="rotate(-90)"
                  strokeDashoffset="465"
                  strokeDasharray="464.96 464.96"
                  strokeWidth="10"
                  stroke="hsl(220,90%,60%)"
                  r="74"
                  className="pencil__body2"
                />
                <circle
                  transform="rotate(-90)"
                  strokeDashoffset="339"
                  strokeDasharray="339.29 339.29"
                  strokeWidth="10"
                  stroke="hsl(220,90%,40%)"
                  r="54"
                  className="pencil__body3"
                />
              </g>
              {/* Xroga AI brand on pencil barrel */}
              <g className="pencil__brand" transform="rotate(90)">
                <rect x="-38" y="-8" width="76" height="16" rx="3" fill="hsl(220,90%,45%)" opacity="0.95" />
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="white"
                  fontFamily="system-ui, sans-serif"
                  letterSpacing="0.08em"
                >
                  XROGA AI
                </text>
              </g>
              <g transform="rotate(-90) translate(49,0)" className="pencil__eraser">
                <g className="pencil__eraser-skew">
                  <rect height="30" width="30" ry="5" rx="5" fill="hsl(220,90%,70%)" />
                  <rect
                    clipPath={`url(#pencil-eraser-${clipId})`}
                    height="30"
                    width="5"
                    fill="hsl(220,90%,60%)"
                  />
                  <rect height="20" width="30" fill="hsl(220,10%,92%)" />
                  <rect height="20" width="15" fill="hsl(220,10%,75%)" />
                  <rect height="20" width="5" fill="hsl(220,10%,85%)" />
                  <rect height="2" width="30" y="6" fill="hsla(220,10%,10%,0.2)" />
                  <rect height="2" width="30" y="13" fill="hsla(220,10%,10%,0.2)" />
                </g>
              </g>
              <g transform="rotate(-90) translate(49,-30)" className="pencil__point">
                <polygon points="15 0,30 30,0 30" fill="hsl(33,90%,70%)" />
                <polygon points="15 0,6 30,0 30" fill="hsl(33,90%,50%)" />
                <polygon points="15 0,20 10,10 10" fill="hsl(220,10%,10%)" />
              </g>
            </g>
          </svg>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
          <p className="text-[11px] text-[var(--muted)]">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}
