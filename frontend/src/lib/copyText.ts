/**
 * Serialize an assistant response for the clipboard as human-readable text.
 *
 * The conversation renderer may use Markdown internally, but the default Copy action
 * should copy what the reader understood rather than the renderer syntax. Code block
 * bodies remain exact. Raw-source export remains a separate concern.
 */
export function serializeAssistantCopy(content: string): string {
  if (!content) return '';

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let inFence = false;

  for (const rawLine of lines) {
    const fence = rawLine.match(/^\s*```/);
    if (fence) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      output.push(rawLine);
      continue;
    }

    let line = rawLine;

    // Internal Xroga tool links are interaction chrome, not answer content.
    if (/^\s*\[Open Xroga Connect\]\(\/xroga\/tool-ui\?payload=/i.test(line)) {
      continue;
    }

    // Markdown tables become readable tab-separated rows; separator rows disappear.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim());

      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      line = cells.join('\t');
    }

    line = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*_]{3,}\s*$/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
      .replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
      .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\s+$/g, '');

    output.push(line);
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
