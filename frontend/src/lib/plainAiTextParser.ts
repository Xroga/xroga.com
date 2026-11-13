export type XrogaBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'math-equation'; text: string }
  | { type: 'code'; language?: string; body: string };

/** Kept for compatibility. Rendering is delegated to the safe CommonMark renderer. */
export function sanitizePlainAiText(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

function explicitEquation(line: string): boolean {
  const value = line.trim();
  return /^\$\$[\s\S]+\$\$$/.test(value) || /^\\\([\s\S]+\\\)$/.test(value) ||
    (/^[a-z0-9()[\].+\-*/^\s]+=[a-z0-9()[\].+\-*/^\s]+$/i.test(value) && /\d|[a-z]/i.test(value));
}

/**
 * Conservative compatibility parser used only by focused tests and explicit math mode.
 * Ordinary prose is a paragraph; the first line is never promoted to a heading.
 */
export function parseXrogaBlocks(content: string): XrogaBlock[] {
  const blocks: XrogaBlock[] = [];
  const normalized = sanitizePlainAiText(content);
  const fences = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const addText = (value: string) => {
    for (const paragraph of value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
      if (explicitEquation(paragraph)) {
        blocks.push({ type: 'math-equation', text: paragraph.replace(/^\$\$|\$\$$/g, '').replace(/^\\\(|\\\)$/g, '') });
      } else {
        blocks.push({ type: 'paragraph', text: paragraph });
      }
    }
  };

  while ((match = fences.exec(normalized)) !== null) {
    addText(normalized.slice(cursor, match.index));
    blocks.push({ type: 'code', language: match[1]?.trim() || undefined, body: match[2] ?? '' });
    cursor = match.index + match[0].length;
  }
  addText(normalized.slice(cursor));
  return blocks;
}
