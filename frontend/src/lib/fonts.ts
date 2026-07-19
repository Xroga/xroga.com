import {
  Cormorant,
  Fraunces,
  Inter,
  JetBrains_Mono,
  Newsreader,
  Outfit,
  Press_Start_2P,
  Source_Serif_4,
  Syne,
} from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

/** Azurio role — sharp editorial serif (Fraunces stand-in) */
export const azurio = Fraunces({
  subsets: ['latin'],
  variable: '--font-azurio',
  weight: ['600', '700', '800', '900'],
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
});

/** Emilio role — elegant thin italic serif accents */
export const emilio = Cormorant({
  subsets: ['latin'],
  variable: '--font-emilio',
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-xv-mono',
  weight: ['400', '500', '600'],
});

/** Pixel coding display — Press Start 2P */
export const pixelCoding = Press_Start_2P({
  subsets: ['latin'],
  variable: '--font-pixel',
  weight: ['400'],
});

export const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
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
