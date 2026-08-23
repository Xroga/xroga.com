import '@/styles/theme-backdrop.css';

/**
 * The homepage's theme artwork, as one element a marketing page can render.
 *
 * The image is a fixed layer behind the whole document and swaps with the theme on
 * `<body>` — clouds for White and Black, monochrome code architecture for Gray, a Mars
 * and pyramids landscape for Beige. It is decorative, so it is `aria-hidden` and carries
 * no alt text; the page's meaning is entirely in its copy.
 *
 * It is deliberately not a `next/image`. The source changes with a CSS class that is
 * applied by a pre-hydration bootstrap script, so no component ever knows which of the
 * four is current — a React component choosing the `src` would flash the wrong artwork
 * on first paint, or need the theme in JS, which is the thing the bootstrap exists to
 * avoid. As a background image the browser picks the right one before first paint.
 */
export function ThemeBackdrop() {
  return <div className="xv-theme-backdrop" aria-hidden="true" />;
}
