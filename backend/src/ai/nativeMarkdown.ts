type NativeMarkdownTable = { head: string[]; rows: string[][] };

const delimiter = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const fenceMarker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/;
const startsNewBlock = /^(?:#{1,4}\s|\s*>)/;
const indentedCode = /^(?: {4}|\t)/;

function cells(line: string): string[] {
  const source = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  // Keep pipes inside code spans and escaped pipes within their cells.
  return source.split(/(`[^`\n]+`|\\\||\|)/u).reduce<string[]>((row, part) => {
    if (part === '|') row.push('');
    else row[row.length - 1] += part === '\\|' ? '|' : part;
    return row;
  }, ['']).map(cell => cell.trim());
}

/** Renderable table syntax shared with the native Markdown renderer. */
export function readNativeMarkdownTable(lines: readonly string[], index: number): (NativeMarkdownTable & { end: number }) | undefined {
  if (!lines[index]?.includes('|') || !delimiter.test(lines[index + 1] ?? '')) return;
  const head = cells(lines[index]);
  const rows: string[][] = [];
  let end = index + 2;
  while (lines[end]?.includes('|')) rows.push(cells(lines[end++]));
  return { head, rows, end };
}

/** Count complete, visible tables. A fenced example or empty grid delivers no rows. */
export function nativeMarkdownTables(text: string): NativeMarkdownTable[] {
  if (!text.includes('|')) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const tables: NativeMarkdownTable[] = [];
  let fence: string | undefined;
  let math: string | undefined;
  let blockStart = true;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = fenceMarker.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
        blockStart = true;
      }
      continue;
    }
    if (math) {
      if (line.trimEnd().endsWith(math)) {
        math = undefined;
        blockStart = true;
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    if (blockStart) {
      const opening = /^ {0,3}(\$\$|\\\[)(.*)$/.exec(line);
      if (opening) {
        const closing = opening[1] === '$$' ? '$$' : '\\]';
        if (!opening[2].trimEnd().endsWith(closing)) math = closing;
        continue;
      }
      if (!startsNewBlock.test(line) && !indentedCode.test(line) && !/^ {0,3}(?:[-*+]|\d+[.)])\s+/.test(line)) {
        const table = readNativeMarkdownTable(lines, index);
        if (table) {
          const { head, rows, end } = table;
          if (head.some(Boolean) && !indentedCode.test(lines[index + 1]) && cells(lines[index + 1]).length === head.length
            && rows.some(row => row.some(Boolean)) && rows.every(row => row.length === head.length)) {
            tables.push({ head, rows });
          }
          index = end - 1;
          continue;
        }
      }
    }
    blockStart = !line.trim() || startsNewBlock.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
  }
  return tables;
}
