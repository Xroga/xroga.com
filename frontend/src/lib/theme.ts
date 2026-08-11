export type CoreThemeId = 'white' | 'beige' | 'black' | 'gray';
export type AccentId = 'blue' | 'violet' | 'emerald' | 'coral';
export type FontPreference = 'modern' | 'classic' | 'mono';
export type DensityPreference = 'comfortable' | 'compact';

/** Includes legacy `image` for persisted storage migration */
export type ThemeId = CoreThemeId | 'image';

/** Compressed WebP slideshow — auth/marketing only (not app shell themes) */
export const DESKTOP_BG_SLIDESHOW = [
  '/backgrounds/bg-desktop-1-infinity.webp',
  '/backgrounds/bg-desktop-2-earth.webp',
  '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
] as const;

export const SLIDESHOW_INTERVAL_MS = 8000;

export const DESKTOP_BG = DESKTOP_BG_SLIDESHOW[0];
export const MOBILE_BG = '/backgrounds/bg-desktop-1-infinity.webp';

/** Homepage + workspace header only (not sidebar). */
export const HEADER_LOGO_URL = '/brand/xroga-home-workspace.png';
export const HOMEPAGE_LOGO_URL = '/brand/xroga-home-workspace.png';
/** User-supplied sidebar brand assets: wordmark when open, compact mark when folded. */
export const SIDEBAR_FULL_LOGO_URL =
  'https://i.postimg.cc/pLxrn9yP/Green-Minimalist-Summer-Big-Sale-Medium-Banner-10-removebg-preview-(1).png';
export const SIDEBAR_LOGO_URL = 'https://i.postimg.cc/9Mfm1jdK/xrogaai.png';
export const AI_RESPONSE_LOGO_URL = '/brand/xroga-mark.png';

export type TerminalSkin =
  | 'dark'
  | 'light'
  | 'light-grid'
  | 'gray'
  | 'amoled'
  | 'midnight'
  | 'matrix'
  | 'amber'
  | 'forest'
  | 'solar';

/**
 * Terminal skins are the user's choice, not the page theme's.
 *
 * The skin was previously pinned to one dark surface because *following the page
 * theme* made the code surface change under people who never asked for it — a White
 * page silently produced a light terminal, and ANSI output then differed between
 * users. That reasoning was about the automatic coupling, not about choice itself,
 * so the pin is lifted here rather than reverted blindly: the terminal still defaults
 * to dark on every theme, and it only ever changes when the user picks a skin.
 *
 * `terminalSkinAuto` in the theme store records which mode is in effect. While it is
 * true the skin tracks `DEFAULT_TERMINAL_SKIN`; picking a skin sets it false and
 * nothing overrides the choice again.
 */
export type TerminalSkinSpec = {
  readonly id: TerminalSkin;
  readonly label: string;
  /** Grouping for the picker, and what decides whether scanlines suit the surface. */
  readonly tone: 'dark' | 'light';
  /** Swatch colours for the picker chip: [surface, ink, accent]. */
  readonly swatch: readonly [string, string, string];
};

/**
 * The catalogue. Ordered dark-first because the default and the overwhelming
 * majority of code surfaces are dark; the light options come last rather than being
 * hidden, since a few people genuinely prefer them.
 */
export const TERMINAL_SKINS: readonly TerminalSkinSpec[] = [
  { id: 'dark', label: 'Xroga Dark', tone: 'dark', swatch: ['#0b0d12', '#e6edf3', '#4a7aff'] },
  { id: 'amoled', label: 'True Black', tone: 'dark', swatch: ['#000000', '#f5f5f5', '#4a7aff'] },
  { id: 'midnight', label: 'Midnight', tone: 'dark', swatch: ['#10131f', '#c8d3f5', '#82aaff'] },
  { id: 'gray', label: 'Graphite', tone: 'dark', swatch: ['#1c1e22', '#f2f4f7', '#7aa2ff'] },
  { id: 'forest', label: 'Evergreen', tone: 'dark', swatch: ['#0d1a14', '#d6e8dd', '#4ade80'] },
  { id: 'matrix', label: 'Phosphor', tone: 'dark', swatch: ['#000f04', '#37ff8b', '#6bffb0'] },
  { id: 'amber', label: 'Amber CRT', tone: 'dark', swatch: ['#17110a', '#ffb861', '#ffd08a'] },
  { id: 'light', label: 'Daylight', tone: 'light', swatch: ['#ffffff', '#14171f', '#0b63f6'] },
  { id: 'light-grid', label: 'Grid Paper', tone: 'light', swatch: ['#fbfbfd', '#14171f', '#0b63f6'] },
  { id: 'solar', label: 'Parchment', tone: 'light', swatch: ['#fdf6e3', '#3b4650', '#b5890a'] },
];

export const TERMINAL_SKIN_CYCLE: TerminalSkin[] = TERMINAL_SKINS.map((skin) => skin.id);

/** What `auto` resolves to. Dark on every theme — see the note above. */
export const DEFAULT_TERMINAL_SKIN: Record<CoreThemeId, TerminalSkin> = {
  white: 'dark',
  beige: 'dark',
  black: 'dark',
  gray: 'dark',
};

export const TERMINAL_SKIN_LABELS: Record<TerminalSkin, string> = TERMINAL_SKINS.reduce(
  (labels, skin) => ({ ...labels, [skin.id]: skin.label }),
  {} as Record<TerminalSkin, string>,
);

/** Scanlines read as CRT grain on a dark surface and as dirt on a light one. */
export function skinTone(skin: TerminalSkin): 'dark' | 'light' {
  return TERMINAL_SKINS.find((s) => s.id === skin)?.tone ?? 'dark';
}

export function isTerminalSkin(value: unknown): value is TerminalSkin {
  return typeof value === 'string' && TERMINAL_SKINS.some((skin) => skin.id === value);
}

/** @deprecated use HEADER_LOGO_URL */
export const LOGO_URL = HEADER_LOGO_URL;

export const CUSTOM_DESKTOP_BG_KEY = 'xroga_custom_desktop_bg';
export const CUSTOM_MOBILE_BG_KEY = 'xroga_custom_mobile_bg';
export const SLIDESHOW_ENABLED_KEY = 'xroga_slideshow_enabled';
export const SLIDESHOW_FROZEN_INDEX_KEY = 'xroga_slideshow_frozen_index';

/** Solid product surfaces; white remains the default. */
export const THEME_OPTIONS: { id: CoreThemeId; label: string; description: string }[] = [
  { id: 'beige', label: 'Beige', description: 'Warm and calm' },
  { id: 'white', label: 'White', description: 'Bright · clean writing' },
  { id: 'gray', label: 'Gray', description: 'Soft focused mode' },
  { id: 'black', label: 'Black', description: 'High contrast' },
];

export const SHELL_THEME_OPTIONS = THEME_OPTIONS;

export const THEME_SURFACE: Record<CoreThemeId, string> = {
  white: '#ffffff',
  beige: '#f5efe3',
  gray: '#1a1a1a',
  black: '#000000',
};

/** Swatch hex per accent — mirrors the html[data-accent] rules in globals.css. */
export const ACCENT_OPTIONS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: '#006aff' },
  { id: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { id: 'emerald', label: 'Emerald', swatch: '#059669' },
  { id: 'coral', label: 'Coral', swatch: '#e05252' },
];

/** Map legacy `image` / deep-work → white */
export function normalizeTheme(theme: ThemeId | string | null | undefined): CoreThemeId {
  if (theme === 'black' || theme === 'gray' || theme === 'beige' || theme === 'white') return theme;
  return 'white';
}

export function skinForTheme(theme: ThemeId | string | null | undefined): TerminalSkin {
  return DEFAULT_TERMINAL_SKIN[normalizeTheme(theme)];
}
