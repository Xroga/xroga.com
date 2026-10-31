type MathAst = { type: string; value?: string; children?: MathAst[]; position?: { start: { offset?: number }; end: { offset?: number } }; data?: Record<string, unknown> };
/** Normalize explicit TeX delimiters only, leaving fenced and inline code intact.
 * Original message text remains in ResponseDocumentV2 and persistence. */
export function normalizeMathDelimitersV2(text: string): string {
  const protectedParts = text.split(/(`{3,}[^\n]*\n[\s\S]*?(?:\n`{3,}|$)|~{3,}[^\n]*\n[\s\S]*?(?:\n~{3,}|$)|`+[^`]*`+)/g);
  return protectedParts.map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, formula: string) => `\n\n$$\n${formula}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_, formula: string) => `$$${formula}$$`)).join('');
}
/** remark-math owns parsing. This adapter only gives validated math nodes a
 * lazy rendering target and retains the exact source for parse-error fallback. */
export function remarkMathPresentationV2() {
  return (tree: MathAst, file: { value: unknown }) => {
    const source = String(file.value);
    const walk = (node: MathAst) => {
      if ((node.type === 'math' || node.type === 'inlineMath') && node.value && node.value.length <= 10_000) {
        const raw = source.slice(node.position?.start.offset, node.position?.end.offset);
        node.data = { hName: 'span', hProperties: { 'data-math-v2': node.value, 'data-math-source': raw, 'data-display': node.type === 'math' ? 'true' : 'false' }, hChildren: [] };
      }
      node.children?.forEach(walk);
    }; walk(tree);
  };
}
