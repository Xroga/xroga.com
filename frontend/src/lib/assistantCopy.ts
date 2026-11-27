import { publicAnswerExportText } from './publicAnswerText';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Nodes } from 'mdast';
import { readNativeMarkdownTable } from '../../../backend/src/ai/nativeMarkdown';

const inlineMarkdown = unified().use(remarkParse);

function removeEmphasis(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])/gu, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_])/gu, '$1')
    .replace(/~~([^~]+)~~/g, '$1');
}

function inlineLabel(node: Nodes): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (node.type === 'image') return node.alt ?? '';
  return 'children' in node ? node.children.map(inlineLabel).join('') : '';
}

function visitInlineMarkdown(value: string, visit: (node: Nodes) => boolean) {
  function walk(node: Nodes) {
    if (!visit(node) && 'children' in node) node.children.forEach(walk);
  }
  walk(inlineMarkdown.parse(value));
}

function cleanInline(value: string): string {
  if (!value.includes('`') && !value.includes('](')) return removeEmphasis(value);
  const output: string[] = [];
  const prose = value.trimStart();
  const indent = value.length - prose.length;
  let cursor = 0;
  visitInlineMarkdown(prose, node => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined && ['inlineCode', 'image', 'link'].includes(node.type)) {
      output.push(removeEmphasis(value.slice(cursor, indent + start)));
      const label = inlineLabel(node);
      output.push(node.type === 'link' && /^https?:\/\//i.test(node.url) && node.url !== label
        ? label + ' (' + node.url + ')' : label);
      cursor = indent + end;
      return true;
    }
    return false;
  });
  return output.join('') + removeEmphasis(value.slice(cursor));
}

function tableCells(line: string): string[] {
  const row = line.trim().replace(/^\|/, '');
  const codeSpans = new Map<number, number>();
  if (row.includes('`')) {
    visitInlineMarkdown(row, node => {
      if (node.type !== 'inlineCode' || !node.position) return false;
      const { start, end } = node.position;
      if (start.offset !== undefined && end.offset !== undefined) codeSpans.set(start.offset, end.offset);
      return true;
    });
  }
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < row.length; index += 1) {
    const codeEnd = codeSpans.get(index);
    if (codeEnd !== undefined) {
      cell += row.slice(index, codeEnd);
      index = codeEnd - 1;
      continue;
    }
    const character = row[index];
    if (character === '\\' && (row[index + 1] === '|' || row[index + 1] === '\\')) cell += row[++index];
    else if (character === '|') {
      cells.push(cell);
      cell = '';
    } else cell += character;
  }
  if (cell || !row.endsWith('|')) cells.push(cell);
  return cells.map(value => cleanInline(value.trim()));
}

/** Export answer structure while preserving literal fenced content. */
export function serializeAssistantCopy(markdown: string, { collapseDuplicateTables = false } = {}): string {
  const normalized = publicAnswerExportText(markdown).replace(/\r\n/g, '\n');
  const output: string[] = [];
  const lines = normalized.split('\n');
  let fence: string | undefined;
  let lastLiteralLine = 0;
  const seenTables = collapseDuplicateTables ? new Set<string>() : undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (match && match[1].startsWith(fence) && !match[2].trim()) fence = undefined;
      else {
        output.push(line);
        lastLiteralLine = output.length;
      }
      continue;
    }
    if (match) {
      fence = match[1];
      continue;
    }

    const table = readNativeMarkdownTable(lines, index);
    if (table?.rows.length) {
      const rows = [tableCells(line), ...lines.slice(index + 2, table.end).map(tableCells)];
      index = table.end - 1;
      if (seenTables) {
        const key = JSON.stringify(rows);
        if (seenTables.has(key)) continue;
        seenTables.add(key);
      }
      for (const row of rows) output.push(row.join('\t'));
      continue;
    }

    const text = cleanInline(line)
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^([ \t]*)[-*+]\s+/, '$1- ');
    if (text.trim() || (output.length && output.at(-1)?.trim())) output.push(text);
  }

  // Skip trailing paragraph separators without trimming meaningful code indentation.
  while (output.length > lastLiteralLine && !output.at(-1)?.trim()) output.pop();
  return output.join('\n');
}
