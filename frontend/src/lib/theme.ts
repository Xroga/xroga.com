export type ThemeId = 'image' | 'white' | 'black' | 'gray' | 'blue-gradient';

export const DESKTOP_BG =
  'https://i.postimg.cc/nz3pSJb9/465a6a92f304015dfc23b37d2d4ff078-(1)-(1)-(1).jpg';
export const MOBILE_BG =
  'https://i.pinimg.com/736x/49/17/78/491778bbd33b7d4b832c8f06415d4e33.jpg';
export const LOGO_URL =
  'https://i.postimg.cc/pLxrn9yP/Green-Minimalist-Summer-Big-Sale-Medium-Banner-10-removebg-preview-(1).png';
export const SIDEBAR_COLLAPSED_LOGO_URL =
  'https://i.postimg.cc/bJnL5jV7/Red-and-Blue-Modern-X-letter-Digital-Marketing-Logo-1-removebg-preview-1.png';

export const THEME_OPTIONS: { id: ThemeId; label: string; description: string }[] = [
  { id: 'image', label: 'Image Background', description: 'Galactic desktop/mobile wallpapers' },
  { id: 'white', label: 'White', description: 'Clean minimal light mode' },
  { id: 'black', label: 'Black', description: 'Pure dark terminal' },
  { id: 'gray', label: 'Gray', description: 'Focused neutral workspace' },
  { id: 'blue-gradient', label: 'Blue Gradient', description: 'Dynamic frozen blue gradient' },
];
