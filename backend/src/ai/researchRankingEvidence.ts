import { nativeMarkdownTables } from './nativeMarkdown.js';

const rankingHeading = /\b(?:rank(?:ing|ed)?|top\s+\d+|leaderboard)\b/iu;
const ordinalClaim = /\b(?:ranks?|positions?)\s+#?\d+\b|\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) place\b/iu;
const postMoney = /\bpost[\s\-‐‑–]money\b/iu;
const preMoney = /\bpre[\s\-‐‑–]money\b/iu;
const provisionalDeal = /\b(?:in talks|under negotiation|unclosed|(?:has )?not (?:yet )?(?:a )?(?:closed|completed))\b/iu;
const provisionalBasis = /\b(?:proposed|expected|indicative|projected|forecast|estimated|target)\b/iu;
const projectedValue = /\b(?:forecast(?:ed)?|projected|projection|estimate(?:d)?)\b/iu;
const actualMeasure = /\b(?:actual|realized|realised|audited)\b/iu;
const statusColumn = /\b(?:status|date|round|basis|method|qualification)\b/iu;
const note = 'The sources report figures on different bases or include provisional values. I couldn’t verify a comparable ranking, so the table shows the reported evidence without positions.';

function markdownRow(cells: string[]) {
  const escapePipe = (cell: string) => cell.replace(/(`[^`]*`)|\|/g, (_match, code) => code ?? '\\|');
  return '| ' + cells.map(escapePipe).join(' | ') + ' |';
}

/** A narrow negative check for contradictions stated in the answer itself.
 * These qualifiers never establish that an apparently comparable figure is true. */
export function withholdIncomparableResearchRanking(response: string): string | undefined {
  const rejected = nativeMarkdownTables(response).flatMap(table => {
    const headers = table.head.map(header => header.replace(/[*_]/gu, ''));
    const rank = headers.findIndex(header => /^(?:rank|position)$/iu.test(header)
      || (header === '#' && table.headings.some(heading => rankingHeading.test(heading))));
    if (rank < 0) return [];
    const qualifiers = headers.flatMap((header, index) => statusColumn.test(header) ? [index] : []);
    const measures = headers.flatMap((header, index) => {
      const conflictingValue = postMoney.test(header) ? preMoney : preMoney.test(header) ? postMoney
        : actualMeasure.test(header) ? projectedValue : undefined;
      if (!conflictingValue) return [];
      const financing = preMoney.test(header) || postMoney.test(header);
      const closedBasis = financing && !provisionalBasis.test(header);
      const incompatible = table.rows.some(row => {
        const marked = [row[index], ...qualifiers.map(column => row[column])].join(' ');
        return conflictingValue.test(marked) || (closedBasis && provisionalDeal.test(marked));
      });
      if (!incompatible) return [];
      const measure = header.replace(actualMeasure, '').trim().toLowerCase() || 'value';
      const label = financing ? 'Reported valuation' : 'Reported ' + measure;
      return [{ index, label }];
    });
    return measures.length ? [{ table, rank, measures }] : [];
  });
  if (!rejected.length) return;

  const replacements = new Map(rejected.map(result => [result.table.start, result]));
  const headings = new Set(rejected.flatMap(result => result.table.headings));
  const affectedRoots = new Set(rejected.map(result => result.table.headings.at(0)));
  const lines = response.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [note, ''];
  let fence: string | undefined;
  let rootHeading: string | undefined;
  let rootLevel = 5;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]?.trim()) fence = undefined;
      output.push(line);
      continue;
    }
    const ranking = replacements.get(index);
    if (ranking) {
      const { table, rank, measures } = ranking;
      const header = table.head.map((cell, column) => measures.find(item => item.index === column)?.label ?? cell);
      const omitRank = (row: string[]) => row.filter((_, column) => column !== rank);
      output.push(markdownRow(omitRank(header)), markdownRow(omitRank(header).map(() => '---')));
      output.push(...table.rows.map(row => markdownRow(omitRank(row))));
      index = table.end - 1;
      continue;
    }
    if (!fence && !/^(?: {4}|\t)/u.test(line)) {
      const heading = /^(#{1,4})[ \t]+(.+)$/.exec(line);
      if (heading && heading[1]!.length <= rootLevel) {
        rootLevel = heading[1]!.length;
        rootHeading = heading[2];
      }
      if (heading && headings.has(heading[2]!) && rankingHeading.test(heading[2]!)) {
        output.push(heading[1] + ' ' + (/^top\s+\d+\s+/iu.test(heading[2]!)
          ? heading[2]!.replace(/^top\s+\d+\s+/iu, '') : 'Reported figures'));
        continue;
      }
      if (affectedRoots.has(rootHeading) && !line.includes('|')) {
        // Keep evidence and caveats from this section while withholding claims about the rejected order.
        if (ordinalClaim.test(line)) continue;
        output.push(line.replace(/\bthis ranking uses\b/iu, 'the intended comparison used'));
        continue;
      }
    }
    output.push(line);
  }
  return output.join('\n');
}
