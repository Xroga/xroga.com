'use client';

export function XrogaChipLoader({ className }: { className?: string }) {
  return (
    <div className={`xv-chip-loader ${className ?? ''}`}>
      <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-md">
        <defs>
          <linearGradient id="chipGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d2d2d" />
            <stop offset="100%" stopColor="#0f0f0f" />
          </linearGradient>
          <linearGradient id="textGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eeeeee" />
            <stop offset="100%" stopColor="#888888" />
          </linearGradient>
        </defs>
        <g>
          <path d="M100 100 H200 V210 H326" className="xv-trace-bg" />
          <path d="M100 100 H200 V210 H326" className="xv-trace-flow xv-blue2" />
          <path d="M80 180 H180 V230 H326" className="xv-trace-bg" />
          <path d="M80 180 H180 V230 H326" className="xv-trace-flow xv-blue" />
          <path d="M60 260 H150 V250 H326" className="xv-trace-bg" />
          <path d="M60 260 H150 V250 H326" className="xv-trace-flow xv-blue2" />
          <path d="M100 350 H200 V270 H326" className="xv-trace-bg" />
          <path d="M100 350 H200 V270 H326" className="xv-trace-flow xv-blue" />
          <path d="M700 90 H560 V210 H474" className="xv-trace-bg" />
          <path d="M700 90 H560 V210 H474" className="xv-trace-flow xv-blue" />
          <path d="M740 160 H580 V230 H474" className="xv-trace-bg" />
          <path d="M740 160 H580 V230 H474" className="xv-trace-flow xv-blue2" />
          <path d="M720 250 H590 V250 H474" className="xv-trace-bg" />
          <path d="M720 250 H590 V250 H474" className="xv-trace-flow xv-blue" />
          <path d="M680 340 H570 V270 H474" className="xv-trace-bg" />
          <path d="M680 340 H570 V270 H474" className="xv-trace-flow xv-blue2" />
        </g>
        <rect x="330" y="190" width="140" height="100" rx="20" fill="url(#chipGradient)" stroke="#222" strokeWidth="3" />
        <text x="400" y="245" fontFamily="Arial,sans-serif" fontSize="22" fill="url(#textGradient)" textAnchor="middle">
          Xroga AI
        </text>
      </svg>
    </div>
  );
}
