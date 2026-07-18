export type CoreThemeId = 'white' | 'black' | 'gray';

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

export const HEADER_LOGO_URL = '/brand/xroga-mark.png';
export const HOMEPAGE_LOGO_URL = '/brand/xroga-mark-192.png';
export const SIDEBAR_LOGO_URL = '/brand/xroga-mark.png';
export const AI_RESPONSE_LOGO_URL = '/brand/xroga-mark.png';

export type TerminalSkin = 'dark' | 'light' | 'light-grid' | 'gray' | 'amoled';

export const DEFAULT_TERMINAL_SKIN: Record<CoreThemeId, TerminalSkin> = {
  white: 'light',
  black: 'amoled',
  gray: 'gray',
};

export const TERMINAL_SKIN_CYCLE: TerminalSkin[] = ['light', 'amoled', 'gray', 'dark', 'light-grid'];

export const TERMINAL_SKIN_LABELS: Record<TerminalSkin, string> = {
  light: 'White',
  amoled: 'Black',
  gray: 'Gray',
  dark: 'Dark',
  'light-grid': 'Grid',
};

/** @deprecated use HEADER_LOGO_URL */
export const LOGO_URL = HEADER_LOGO_URL;

export const CUSTOM_DESKTOP_BG_KEY = 'xroga_custom_desktop_bg';
export const CUSTOM_MOBILE_BG_KEY = 'xroga_custom_mobile_bg';
export const SLIDESHOW_ENABLED_KEY = 'xroga_slideshow_enabled';
export const SLIDESHOW_FROZEN_INDEX_KEY = 'xroga_slideshow_frozen_index';

/** Only three themes — white is default */
export const THEME_OPTIONS: { id: CoreThemeId; label: string; description: string }[] = [
  { id: 'white', label: 'White', description: 'Bright · clean writing' },
  { id: 'gray', label: 'Gray', description: 'Soft focused mode' },
  { id: 'black', label: 'Black', description: 'High contrast' },
];

export const SHELL_THEME_OPTIONS = THEME_OPTIONS;

export const THEME_SURFACE: Record<CoreThemeId, string> = {
  white: '#ffffff',
  gray: '#1a1a1a',
  black: '#000000',
};

/** Map legacy `image` / deep-work → white */
export function normalizeTheme(theme: ThemeId | string | null | undefined): CoreThemeId {
  if (theme === 'black' || theme === 'gray' || theme === 'white') return theme;
  return 'white';
}

export function skinForTheme(theme: ThemeId | string | null | undefined): TerminalSkin {
  return DEFAULT_TERMINAL_SKIN[normalizeTheme(theme)];
}
