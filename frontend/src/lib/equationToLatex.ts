/**
 * Plain equation text to LaTeX.
 *
 * Deliberately in a module of its own, with no import of KaTeX. It used to sit beside
 * the renderer, so anything that wanted this small pure function pulled the whole
 * typesetter in behind it.
 */
export function equationToLatex(text: string): string {
  let out = text.trim();
  out = out.replace(/\*/g, ' \\cdot ');
  out = out.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
  out = out.replace(/(\d)([a-z])/gi, '$1$2');
  return out;
}
