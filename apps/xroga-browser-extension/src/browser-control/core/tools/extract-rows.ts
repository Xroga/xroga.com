// `extract_rows`: the tables, grids and repeated lists of the page (or of one named region) as rows, read by the page itself rather than cell by cell by the model
// (the structured extraction of Tencent/BrowserSkill and the schema extraction of browserbase/stagehand, MIT, written here for this layer). Column names, links,
// merged-cell and "more rows below" evidence come back with the rows; every frame of the tab is read. Read-only. The agent keeps the rows of the last extraction so
// that data_ops (remove duplicates, filter, sort, group) works on them without the model retyping a single cell.
import type { ExtractedTable } from '../../probe/source';
import type { ExtractRowsArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { withPageState } from './navigate';

export type RowObject = Record<string, string>;

/** A table as objects keyed by its column names (a repeated name gets a number), plus the link of each linked cell under "<column> (link)". */
export function tableToObjects(t: ExtractedTable): RowObject[] {
  const seen = new Map<string, number>();
  const keys = t.columns.map(c => {
    const n = (seen.get(c) ?? 0) + 1;
    seen.set(c, n);
    return n > 1 ? `${c} ${n}` : c;
  });
  const links = new Map<string, string>();
  for (const [r, c, href] of t.links ?? []) links.set(`${r}:${c}`, href);
  return t.rows.map((row, r) => {
    const o: RowObject = {};
    row.forEach((cell, c) => {
      const key = keys[c] ?? `col${c + 1}`;
      o[key] = cell;
      const href = links.get(`${r}:${c}`);
      if (href) o[`${key} (link)`] = href;
    });
    return o;
  });
}

const PRINT_ROWS = 200;

export function describeTable(t: ExtractedTable, n: number): string[] {
  const facts = [`${t.kind}`, `${t.columns.length} column${t.columns.length === 1 ? '' : 's'}`, `${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`];
  if (t.statedTotal) facts.push(`the page states ${t.statedTotal} in all`);
  if (t.merged) facts.push(`${t.merged} merged cell${t.merged === 1 ? '' : 's'} (their text is in the first cell)`);
  if (t.moreBelow) facts.push('MORE ROWS BELOW: scroll the table and extract again');
  const lines = [`${n}. ${t.name ? JSON.stringify(t.name) + ' ' : ''}(${facts.join(', ')})`, `   ${t.columns.join(' | ')}`];
  const shown = t.rows.slice(0, PRINT_ROWS);
  shown.forEach((r, i) => lines.push(`   ${i + 1}. ${r.join(' | ')}`));
  if (t.rows.length > shown.length) lines.push(`   ... ${t.rows.length - shown.length} more rows kept, not printed`);
  return lines;
}

export async function extractRows(ctx: ToolContext, args: ExtractRowsArgs): Promise<ToolOutcome> {
  const attachment = await ctx.attach();
  const tab = ctx.tab();
  const frames = await attachment.topology.frames();
  const tables: ExtractedTable[] = [];
  for (const frame of frames) {
    if (args.cards && args.fields) {
      const t = await tab.probe!.callGlobal<ExtractedTable>(frame, 'extractCards', args.cards, args.fields, args.maxRows).catch(() => undefined);
      if (t?.rows.length) tables.push(t);
      continue;
    }
    const part = await tab.probe!.callGlobal<ExtractedTable[]>(frame, 'extractRows', args.scope, args.maxRows).catch(() => [] as ExtractedTable[]);
    tables.push(...(part ?? []));
  }
  const picked = args.table ? tables.slice(args.table - 1, args.table) : tables;
  const lines = picked.length
    ? [
        `extract_rows · ${picked.length} table${picked.length === 1 ? '' : 's'}${args.scope ? ` in "${args.scope}"` : ''} (${picked.reduce((n, t) => n + t.rows.length, 0)} rows kept for data_ops)`,
        ...picked.flatMap((t, i) => describeTable(t, args.table ?? i + 1)),
      ]
    : [`extract_rows · no table, grid or list with rows${args.scope ? ` in a region named "${args.scope}"` : ''}${args.table ? ` at number ${args.table}` : ''}. Read the page instead.`];
  return withPageState(ctx, 'none', { data: { tables: picked }, lines });
}
