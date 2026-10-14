/**
 * Original product artwork for the sample campaign creatives (pure SVG, no external assets): Morrow Supply's
 * weekend backpack against a city sunrise, the under-seat bag framed by an aircraft window, and a gift set of
 * packing cubes. Decorative; the creative's text carries the meaning.
 */
import type { Audience } from './data';

export function Art({ kind, className }: { kind: Audience['art']; className?: string }) {
  const id = `s03-art-${kind}`;
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          {kind === 'city' && (
            <>
              <stop offset="0" stopColor="#f2b48a" />
              <stop offset="0.6" stopColor="#e39270" />
              <stop offset="1" stopColor="#b7614f" />
            </>
          )}
          {kind === 'flight' && (
            <>
              <stop offset="0" stopColor="#9cc3e6" />
              <stop offset="0.7" stopColor="#d9e6ee" />
              <stop offset="1" stopColor="#f4e2cf" />
            </>
          )}
          {kind === 'gift' && (
            <>
              <stop offset="0" stopColor="#e7a77b" />
              <stop offset="1" stopColor="#c9785e" />
            </>
          )}
        </linearGradient>
        <linearGradient id={`${id}-bag`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={kind === 'flight' ? '#3b4650' : '#22384a'} />
          <stop offset="1" stopColor={kind === 'flight' ? '#1b2228' : '#101c27'} />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3e0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff3e0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="240" fill={`url(#${id}-sky)`} />

      {kind === 'city' && (
        <>
          <circle cx="232" cy="96" r="70" fill={`url(#${id}-sun)`} />
          <circle cx="232" cy="96" r="24" fill="#fff1dc" opacity="0.9" />
          <path
            d="M0 186h22v-38h16v24h14v-52h20v40h12v-26h18v52h16v-70h22v58h14v-34h18v46h20v-60h18v44h16v-28h22v40h16v-22h20v58H0z"
            fill="#8c4a43"
            opacity="0.55"
          />
          <rect y="200" width="320" height="40" fill="#6f3a37" opacity="0.6" />
        </>
      )}
      {kind === 'flight' && (
        <>
          <rect x="18" y="14" width="284" height="212" rx="96" fill="none" stroke="#e9eef2" strokeWidth="22" />
          <rect x="18" y="14" width="284" height="212" rx="96" fill="none" stroke="#c6d0d7" strokeWidth="2" />
          <ellipse cx="96" cy="70" rx="44" ry="12" fill="#fff" opacity="0.8" />
          <ellipse cx="226" cy="58" rx="34" ry="9" fill="#fff" opacity="0.7" />
          <path d="M40 120c40-10 70 6 120 0s90-8 130 4v100H40z" fill="#f7efe4" opacity="0.7" />
        </>
      )}
      {kind === 'gift' && (
        <>
          <g opacity="0.2" fill="#fff">
            <circle cx="40" cy="40" r="3" />
            <circle cx="280" cy="30" r="2" />
            <circle cx="300" cy="120" r="3" />
            <circle cx="24" cy="150" r="2" />
          </g>
          <rect y="196" width="320" height="44" fill="#7d4535" opacity="0.35" />
        </>
      )}

      {kind !== 'gift' ? (
        // the backpack: body, lid, front pocket, zips and a top handle
        <g transform={kind === 'flight' ? 'translate(108 52) scale(0.9)' : 'translate(98 46)'}>
          <ellipse cx="62" cy="176" rx="70" ry="10" fill="#000" opacity="0.22" />
          <path d="M44 14c0-10 36-10 36 0v10H70v-6c0-4-16-4-16 0v6H44z" fill="#0d151c" />
          <rect x="4" y="22" width="116" height="152" rx="28" fill={`url(#${id}-bag)`} />
          <path d="M16 40c14-10 78-10 92 0" fill="none" stroke="#e7a77b" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="22" y="92" width="80" height="62" rx="16" fill="#0f1a23" stroke="#2c4252" strokeWidth="2" />
          <path d="M30 100h64" stroke="#e7a77b" strokeWidth="2" strokeLinecap="round" />
          <rect x="56" y="96" width="12" height="8" rx="2" fill="#e7a77b" />
          <path d="M10 60v80M114 60v80" stroke="#2c4252" strokeWidth="3" strokeLinecap="round" />
          <text
            x="62"
            y="134"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="15"
            fontWeight="700"
            fill="#f4f1e8"
            letterSpacing="1"
          >
            {kind === 'flight' ? '40L' : '28L'}
          </text>
        </g>
      ) : (
        // a gift set of three packing cubes with a ribbon
        <g transform="translate(70 52)">
          <ellipse cx="90" cy="160" rx="96" ry="10" fill="#000" opacity="0.2" />
          <rect x="0" y="96" width="180" height="60" rx="14" fill="#22384a" />
          <rect x="18" y="46" width="144" height="54" rx="14" fill="#2f5b62" />
          <rect x="38" y="4" width="104" height="46" rx="12" fill="#68d9b9" />
          <path d="M90 4v152" stroke="#f4f1e8" strokeWidth="7" />
          <path d="M90 4c-22-22-46-4-24 6M90 4c22-22 46-4 24 6" fill="none" stroke="#f4f1e8" strokeWidth="5" strokeLinecap="round" />
          <path d="M12 112h156M30 62h120M50 18h80" stroke="#f4f1e8" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="3 5" />
        </g>
      )}
    </svg>
  );
}
