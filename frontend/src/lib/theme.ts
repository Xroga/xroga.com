export type ThemeId = 'image' | 'white' | 'black' | 'gray';

export const DESKTOP_BG =
  'https://i.postimg.cc/nz3pSJb9/465a6a92f304015dfc23b37d2d4ff078-(1)-(1)-(1).jpg';
export const MOBILE_BG =
  'https://i.pinimg.com/736x/49/17/78/491778bbd33b7d4b832c8f06415d4e33.jpg';

/** Dashboard header logo (outside sidebar) */
export const HEADER_LOGO_URL =
  'https://i.postimg.cc/pLxrn9yP/Green-Minimalist-Summer-Big-Sale-Medium-Banner-10-removebg-preview-(1).png';

/** Homepage hero logo */
export const HOMEPAGE_LOGO_URL =
  'https://i.postimg.cc/pLxrn9yP/Green-Minimalist-Summer-Big-Sale-Medium-Banner-10-removebg-preview-(1).png';

/** Sidebar + AI response avatar logo */
export const SIDEBAR_LOGO_URL =
  'https://i.postimg.cc/bJnL5jV7/Red-and-Blue-Modern-X-letter-Digital-Marketing-Logo-1-removebg-preview-1.png';

export const AI_RESPONSE_LOGO_URL = SIDEBAR_LOGO_URL;

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

export const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: 'image', label: 'Image', description: 'Fun & creative work' },
  { id: 'white', label: 'White', description: 'Pure deep work' },
  { id: 'black', label: 'Black', description: 'Aesthetic attitude' },
  { id: 'gray', label: 'Gray', description: 'Focused mode' },
];
