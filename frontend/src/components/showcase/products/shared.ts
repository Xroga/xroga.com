/**
 * Small shared helpers for showcase products.
 *
 * Products keep their own design systems on purpose — these are behavioural
 * utilities only, so nothing here makes two products look alike.
 */

export function formatCurrency(value: number, currency = 'USD', maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits }).format(value);
}

/**
 * Reads and writes a product's own local state.
 *
 * Every product runs inside a framed preview, where storage can be unavailable or
 * throw outright. Callers get a value either way, so a blocked storage API can
 * never break a product's rendering.
 */
export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be unavailable in a sandboxed frame; state stays in memory. */
  }
}

/**
 * Neutralises the host app's global element styling inside a product.
 *
 * The Xroga app's `globals.css` sets `h1..h6 { color: var(--foreground);
 * font-family: var(--font-claude) }`. Those are element selectors, so they beat
 * inheritance from a product's own root and would repaint every heading in the
 * app's colour and typeface — which is how a dark product ended up with dark
 * headings on a dark background. A product is meant to be self-contained, and this
 * is also what makes the exported template look the same outside this app.
 *
 * Pass the product's root class, e.g. `productReset('.nw-root')`.
 */
export function productReset(rootSelector: string): string {
  return `
${rootSelector} h1, ${rootSelector} h2, ${rootSelector} h3,
${rootSelector} h4, ${rootSelector} h5, ${rootSelector} h6 {
  color: inherit;
  font-family: inherit;
  letter-spacing: inherit;
}
${rootSelector} button, ${rootSelector} input, ${rootSelector} select, ${rootSelector} textarea {
  font-family: inherit;
}
${rootSelector} p, ${rootSelector} li, ${rootSelector} dt, ${rootSelector} dd,
${rootSelector} th, ${rootSelector} td, ${rootSelector} blockquote, ${rootSelector} figcaption,
${rootSelector} label, ${rootSelector} legend, ${rootSelector} code, ${rootSelector} pre {
  color: inherit;
}
`;
}

/** Deterministic pseudo-random so sample content is stable between renders. */
export function seeded(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
