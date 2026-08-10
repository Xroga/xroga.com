/**
 * Fonts.
 *
 * next/font preloads every family by default. With nine families that emitted twelve
 * render-blocking font preloads competing with the CSS and the app bundle on first
 * paint, for faces most pages never draw — the pixel display face appears on a
 * greeting and a few labels, the serif accents on marketing surfaces only.
 *
 * Only the body faces preload now: measured 12 font preloads before, 2 after. The
 * rest still load, and still load automatically wherever they are used; they simply
 * no longer block the first paint to do it. This changes delivery, not typography —
 * no family is dropped and no weight is removed.
 */
import {
  Cormorant,
  Fraunces,
  Inter,
  Newsreader,
  Outfit,
  Press_Start_2P,
  Source_Serif_4,
  Syne,
} from 'next/font/google';
import localFont from 'next/font/local';

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

/** Azurio role — sharp editorial serif (Fraunces stand-in) */
export const azurio = Fraunces({
  subsets: ['latin'],
  variable: '--font-azurio',
  weight: ['600', '700', '800', '900'],
  preload: false,
});

/** Goga role — friendly geometric sans body */
export const goga = Outfit({
  subsets: ['latin'],
  variable: '--font-goga',
  weight: ['400', '500', '600', '700'],
});

/** Remixa role — contrasting modern sans for UI/labels */
export const remixa = Syne({
  subsets: ['latin'],
  variable: '--font-remixa',
  weight: ['500', '600', '700', '800'],
  preload: false,
});

/** Emilio role — elegant thin italic serif accents */
export const emilio = Cormorant({
  subsets: ['latin'],
  variable: '--font-emilio',
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  preload: false,
});

// Keep the terminal face inside the repository. A remote JetBrains Mono fetch
// made otherwise valid Vercel builds depend on fonts.gstatic.com availability.
export const jetbrainsMono = localFont({
  src: '../app/fonts/GeistMonoVF.woff',
  variable: '--font-xv-mono',
  weight: '100 900',
  preload: false,
});

/** Pixel coding display — Press Start 2P */
export const pixelCoding = Press_Start_2P({
  subsets: ['latin'],
  variable: '--font-pixel',
  weight: ['400'],
  preload: false,
});

export const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  preload: false,
});

/**
 * Claude / Anthropic Serif stand-in.
 * Anthropic Serif is proprietary — Newsreader is the closest open high-contrast literary serif.
 * Apply via `.className` (not only CSS vars) so body sans cannot override it.
 */
export const claudeSerif = Newsreader({
  subsets: ['latin'],
  variable: '--font-claude-serif',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  preload: false,
});

export const rootFontVariables = [
  inter.variable,
  azurio.variable,
  goga.variable,
  remixa.variable,
  emilio.variable,
  jetbrainsMono.variable,
  pixelCoding.variable,
  sourceSerif.variable,
  claudeSerif.variable,
].join(' ');
