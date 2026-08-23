import {
  siC,
  siCplusplus,
  siDart,
  siElixir,
  siGo,
  siHaskell,
  siJavascript,
  siKotlin,
  siLua,
  siOpenjdk,
  siPerl,
  siPhp,
  siPython,
  siR,
  siRuby,
  siRust,
  siScala,
  siSolidity,
  siSwift,
  siTypescript,
} from 'simple-icons';

/**
 * Twenty widely used languages, each with its own official mark.
 *
 * The icons come from the `simple-icons` package rather than its CDN, which is the
 * pattern `TechnologyMarquee` uses. Two reasons: the marks are then part of the bundle
 * instead of a runtime dependency on a third-party host, and an unknown slug becomes a
 * TypeScript error at build time rather than a broken image in production — this
 * environment cannot reach that CDN, so a slug typed from memory could not have been
 * checked any other way.
 *
 * Two substitutions, both deliberate. Simple Icons carries no Java or C# icon — those
 * are Oracle and Microsoft trademarks and were removed on request. Rather than put
 * someone else's logo under the wrong name, the list uses **OpenJDK**, which is the
 * open Java implementation and has its own real mark, and **Elixir** in place of C#.
 * Every entry here is a real name shown with the mark that actually belongs to it.
 */

export interface CodingLanguage {
  /** The project's own name, as Simple Icons records it. */
  title: string;
  /** The official single-path logo. */
  path: string;
  /** The brand hex, lifted only where it would disappear on a dark panel. */
  color: string;
}

/** WCAG relative luminance for a six-digit hex. */
function luminance(hex: string): number {
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * The brand colour, lifted toward white only as far as it needs to be seen.
 *
 * Seven of these twenty are near-black by brand — OpenJDK, Rust and Solidity are
 * literally `#000000` — and would vanish against the panel. Mixing toward white keeps
 * the hue recognisable where there is one, rather than flattening every logo to a
 * single tint. Derived from the official hex, so it tracks the source rather than
 * being a table of hand-picked substitutes.
 */
function onDarkPanel(hex: string): string {
  const floor = 0.3;
  let mix = 0;
  let current = hex;
  while (luminance(current) < floor && mix < 1) {
    mix += 0.08;
    current = [0, 2, 4]
      .map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16);
        return Math.round(v + (255 - v) * mix).toString(16).padStart(2, '0');
      })
      .join('');
  }
  return `#${current}`;
}

const SOURCE = [
  siJavascript, siTypescript, siPython, siOpenjdk, siCplusplus,
  siC, siGo, siRust, siPhp, siRuby,
  siSwift, siKotlin, siDart, siR, siScala,
  siPerl, siLua, siHaskell, siSolidity, siElixir,
];

export const CODING_LANGUAGES: ReadonlyArray<CodingLanguage> = SOURCE.map((icon) => ({
  title: icon.title,
  path: icon.path,
  color: onDarkPanel(icon.hex),
}));
