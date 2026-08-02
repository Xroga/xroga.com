/**
 * HUD icon primitives.
 *
 * Original line glyphs on a 24×24 grid, drawn in `currentColor` so every theme
 * token drives them. They exist rather than pulling more of `lucide-react` because
 * these read as game-system markers (a shield, a controller, a waveform) at 18–22px
 * where a generic UI icon set reads as a settings menu.
 *
 * Server-safe: no state, no effects, no client boundary.
 */

export type HudIconName =
  | 'world'
  | 'player'
  | 'enemies'
  | 'combat'
  | 'progression'
  | 'ui'
  | 'audio'
  | 'code'
  | 'play'
  | 'pause'
  | 'close'
  | 'expand'
  | 'chevron'
  | 'arrow'
  | 'check'
  | 'spark'
  | 'folder'
  | 'file'
  | 'cube';

const PATHS: Record<HudIconName, React.ReactNode> = {
  world: (
    <>
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  player: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
    </>
  ),
  enemies: (
    <>
      <path d="M4 9a8 8 0 0 1 16 0v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9Z" />
      <path d="M9 11h.01M15 11h.01M9.5 15h5" />
    </>
  ),
  combat: (
    <>
      <path d="m4 4 8 8M4 4v4M4 4h4" />
      <path d="m20 4-8 8M20 4v4M20 4h-4" />
      <path d="M12 12 8 20h8l-4-8Z" />
    </>
  ),
  progression: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
    </>
  ),
  ui: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11" />
    </>
  ),
  audio: (
    <>
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    </>
  ),
  code: (
    <>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />
    </>
  ),
  play: <path d="M8 5.5 19 12 8 18.5v-13Z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  expand: <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  spark: (
    <>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="m6.5 6.5 3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h3.6l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  file: (
    <>
      <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13 3v5h5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7L12 2.5Z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" />
    </>
  ),
};

export function HudIcon({
  name,
  size = 20,
  className,
  strokeWidth = 1.6,
}: {
  name: HudIconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const solid = name === 'play';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
