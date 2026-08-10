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
import localFont from 'next/font/local';

// Every product font is bundled with the application. `next/font/google`
// downloads font binaries while building; a transient fonts.gstatic.com outage
// therefore made valid commits fail randomly on Vercel and GitHub Actions.
export const inter = localFont({
  src: '../app/fonts/InterVariable.ttf',
  variable: '--font-inter',
  weight: '100 900',
});

/** Azurio role — sharp editorial serif (Fraunces stand-in) */
export const azurio = localFont({
  src: '../app/fonts/FrauncesVariable.ttf',
  variable: '--font-azurio',
  weight: '100 900',
  preload: false,
});

/** Goga role — friendly geometric sans body */
export const goga = localFont({
  src: '../app/fonts/OutfitVariable.ttf',
  variable: '--font-goga',
  weight: '100 900',
});

/** Remixa role — contrasting modern sans for UI/labels */
export const remixa = localFont({
  src: '../app/fonts/SyneVariable.ttf',
  variable: '--font-remixa',
  weight: '400 800',
  preload: false,
});

/** Emilio role — elegant thin italic serif accents */
export const emilio = localFont({
  src: [
    { path: '../app/fonts/CormorantVariable.ttf', style: 'normal', weight: '300 700' },
    { path: '../app/fonts/CormorantVariable-Italic.ttf', style: 'italic', weight: '300 700' },
  ],
  variable: '--font-emilio',
  preload: false,
});

// Keep the terminal face inside the repository. A remote JetBrains Mono fetch
// made otherwise valid Vercel builds depend on fonts.gstatic.com availability.
export const jetbrainsMono = localFont({
  src: '../app/fonts/JetBrainsMonoLatin.woff2',
  variable: '--font-xv-mono',
  weight: '400 800',
  preload: false,
});

/** Pixel coding display — Press Start 2P */
export const pixelCoding = localFont({
  src: '../app/fonts/PressStart2P-Regular.ttf',
  variable: '--font-pixel',
  weight: '400',
  preload: false,
});

// Source Serif is self-hosted for the same reason as the terminal face. A
// homepage-only font must not turn an otherwise valid deployment red when
// fonts.gstatic.com is temporarily unavailable during the Vercel build.
export const sourceSerif = localFont({
  src: [
    {
      path: '../app/fonts/SourceSerif4Variable.ttf',
      style: 'normal',
      weight: '200 900',
    },
    {
      path: '../app/fonts/SourceSerif4Variable-Italic.ttf',
      style: 'italic',
      weight: '200 900',
    },
  ],
  variable: '--font-source-serif',
  preload: false,
});

/**
 * Claude / Anthropic Serif stand-in.
 * Anthropic Serif is proprietary — Newsreader is the closest open high-contrast literary serif.
 * Apply via `.className` (not only CSS vars) so body sans cannot override it.
 */
export const claudeSerif = localFont({
  src: [
    { path: '../app/fonts/NewsreaderVariable.ttf', style: 'normal', weight: '200 800' },
    { path: '../app/fonts/NewsreaderVariable-Italic.ttf', style: 'italic', weight: '200 800' },
  ],
  variable: '--font-claude-serif',
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
