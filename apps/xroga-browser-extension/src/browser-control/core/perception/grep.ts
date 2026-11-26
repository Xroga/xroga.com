// Search inside a page's text without reading all of it: the lines that match a word or a pattern, with a few lines around each, numbered. A long page is searched in one call instead of read in many.
// The idea is Playwright MCP's browser_find (Apache-2.0); written here.
export function grepContent(content: string, pattern: string, context = 2, maxMatches = 40): { text: string; matches: number; lines: number } {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const lines = content.split(/\r?\n/);
  const hits: number[] = [];
  lines.forEach((l, i) => {
    if (re.test(l)) hits.push(i);
  });
  if (!hits.length) return { text: `no line of the page contains "${pattern}" (${lines.length} lines searched)`, matches: 0, lines: lines.length };
  const keep = new Set<number>();
  for (const h of hits.slice(0, Math.max(1, maxMatches))) for (let i = Math.max(0, h - context); i <= Math.min(lines.length - 1, h + context); i++) keep.add(i);
  const out: string[] = [];
  let last = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i > last + 1) out.push('---');
    out.push(`${i + 1}${hits.includes(i) ? ':' : '-'} ${lines[i]!.slice(0, 400)}`);
    last = i;
  }
  const more = hits.length > maxMatches ? `\n… ${hits.length - maxMatches} more matching lines not shown` : '';
  return { text: `${hits.length} matching line${hits.length === 1 ? '' : 's'} of ${lines.length}:\n${out.join('\n')}${more}`, matches: hits.length, lines: lines.length };
}
