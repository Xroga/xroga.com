function cleanInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cleanInline(cell.trim()));
}

/** Convert a rendered assistant answer into useful clipboard text without UI chrome. */
export function serializeAssistantCopy(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const output: string[] = [];
  const lines = normalized.split('\n');
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }

    const next = lines[index + 1] ?? '';
    if (/^\s*\|?.+\|.+\|?\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(next)) {
      output.push(tableCells(line).join('\t'));
      index += 1;
      while (index + 1 < lines.length && /\|/.test(lines[index + 1] ?? '')) {
        output.push(tableCells(lines[index + 1] ?? '').join('\t'));
        index += 1;
      }
      continue;
    }

    output.push(cleanInline(line)
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '- '));
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
