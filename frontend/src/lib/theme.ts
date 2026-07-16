export type ThemeId = 'image' | 'white' | 'black' | 'gray';

/** Compressed WebP slideshow — never mount multi‑MB PNGs */
export const DESKTOP_BG_SLIDESHOW = [
  '/backgrounds/bg-desktop-1-infinity.webp',
  '/backgrounds/bg-desktop-2-earth.webp',
  '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
] as const;

export const SLIDESHOW_INTERVAL_MS = 8000;

export const DESKTOP_BG = DESKTOP_BG_SLIDESHOW[0];
export const MOBILE_BG = '/backgrounds/bg-desktop-1-infinity.webp';

/**
 * Local brand marks (tiny PNGs). Remote Postimg megabyte logos were blanking
 * AI response avatars until a 1MB download finished.
 */
export const HEADER_LOGO_URL = '/brand/xroga-mark.png';
export const HOMEPAGE_LOGO_URL = '/brand/xroga-mark-192.png';
export const SIDEBAR_LOGO_URL = '/brand/xroga-mark.png';
export const AI_RESPONSE_LOGO_URL = '/brand/xroga-mark.png';

export type TerminalSkin = 'dark' | 'light' | 'light-grid' | 'gray' | 'amoled';

export const DEFAULT_TERMINAL_SKIN: Record<ThemeId, TerminalSkin> = {
  white: 'light',
  black: 'amoled',
  gray: 'gray',
  image: 'light',
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

export const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: 'image', label: 'Image', description: 'Fun & creative work' },
  { id: 'white', label: 'White', description: 'Pure deep work' },
  { id: 'black', label: 'Black', description: 'Aesthetic attitude' },
  { id: 'gray', label: 'Gray', description: 'Focused mode' },
];
