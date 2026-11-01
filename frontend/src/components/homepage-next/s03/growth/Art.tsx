/**
 * Ember Roasters artwork, drawn in code: a coffee pouch with its label, in three tones that follow the audience. Used
 * as the product in the launch scene and as the image inside every campaign format, so the brand carries across them.
 */
import { useId } from 'react';

export type Tone = 'ember' | 'cream' | 'slate';
const TONES: Record<Tone, { bag: string; bag2: string; label: string; ink: string; mark: string }> = {
  ember: { bag: '#8a3a22', bag2: '#5e2414', label: '#f3e6d2', ink: '#2a1610', mark: '#e9773f' },
  cream: { bag: '#efe3cf', bag2: '#cdbb9f', label: '#2a1d16', ink: '#f3e6d2', mark: '#e9773f' },
  slate: { bag: '#2c3038', bag2: '#17191e', label: '#d79a6b', ink: '#1b1410', mark: '#fff2e2' },
};

export function EmberMark({ size = 16, color = '#e9773f' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9Z" fill={color} />
    </svg>
  );
}

export function Bag({ tone = 'ember', className }: { tone?: Tone; className?: string }) {
  const t = TONES[tone];
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 220" className={className} data-tone={tone} aria-hidden="true">
      <defs>
        <linearGradient id={`b-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={t.bag2} />
          <stop offset="0.35" stopColor={t.bag} />
          <stop offset="0.8" stopColor={t.bag} />
          <stop offset="1" stopColor={t.bag2} />
        </linearGradient>
      </defs>
      <path d="M22 26 L138 26 L146 206 Q146 214 138 214 L22 214 Q14 214 14 206 Z" fill={`url(#b-${id})`} />
      <path d="M22 26 L138 26 L136 40 L24 40 Z" fill={t.bag2} opacity="0.7" />
      <path d="M30 14 h100 v12 h-100z" fill={t.bag2} />
      <rect x="36" y="78" width="88" height="96" rx="6" fill={t.label} />
      <g transform="translate(68 88)">
        <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9Z" fill={t.mark} />
      </g>
      <text x="80" y="134" textAnchor="middle" fontSize="15" fontWeight="800" letterSpacing="3" fill={t.ink} fontFamily="system-ui, sans-serif">
        EMBER
      </text>
      <text x="80" y="150" textAnchor="middle" fontSize="7.5" letterSpacing="0.6" fill={t.ink} opacity="0.75" fontFamily="system-ui, sans-serif">
        MONTHLY · MEDIUM
      </text>
      <path d="M48 162 h64" stroke={t.ink} strokeOpacity="0.3" />
      <path d="M30 40 Q34 120 28 206" stroke="#fff" strokeOpacity="0.12" strokeWidth="6" fill="none" />
    </svg>
  );
}

/** a scatter of beans, for creative backgrounds */
export function Beans({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden="true">
      {[
        [14, 18, 20],
        [40, 52, -30],
        [70, 22, 50],
        [96, 58, -10],
        [24, 62, 70],
        [104, 14, 30],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <ellipse rx="7" ry="10" fill="#4a2617" />
          <path d="M0 -8 Q-3 0 0 8" stroke="#2a130b" strokeWidth="1.6" fill="none" />
        </g>
      ))}
    </svg>
  );
}
