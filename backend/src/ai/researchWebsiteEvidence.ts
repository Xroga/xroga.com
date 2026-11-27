import { publicHttpsUrl } from '../security/egress/urlPolicy.js';
import { nativeMarkdownTableRow, nativeMarkdownTables } from './nativeMarkdown.js';

const entityLabel = /^(?:company|organization|organisation|entity|provider|vendor|project|product|name)$/i;
const websiteLabel = /^(?:official\s+)?(?:site|website|link|url)(?:\s+url)?$/i;
const linkOnlySummary = /^ {0,3}(#{1,6})[ \t]+(?:what (?:the )?(?:official )?(?:links|sites|websites) verify|(?:official )?(?:link|site|website) (?:verification|coverage))[ \t]*$/i;
const linkCoverageRecap = /^ {0,3}(?:[-*+]\s+)?(?:\*\*|__)?(?:official )?(?:link|site|website) (?:verification|coverage)(?:\*\*|__)?[.:](?:\*\*|__)?\s+.+\b(?:verified|established|recorded|found)\b/iu;
const nextHeading = /^ {0,3}(#{1,6})[ \t]/;
const siteLink = /^\[[^\]\r\n]+\]\(<?([^<>\s)]+)>?\)$/;
const siteValue = /^(?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>]*)?$/iu;

type ResearchPage = { url: string; snippet?: string };
type Website = { url: string; sourceNumber: number };

function websiteColumns(cells: readonly string[]) {
  return { entity: cells.findIndex(cell => entityLabel.test(cell)), site: cells.findIndex(cell => websiteLabel.test(cell)) };
}

function entityKey(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)\r\n]+\)/g, '$1').replace(/\[\d{1,3}\]/g, '')
    .normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function siteCell(value: string) {
  return value.replace(/(?:\s*\[\d+\])+$/u, '').trim();
}

function websiteDestination(text: string, allowQuery = false): URL | undefined {
  const cell = siteCell(text);
  const value = siteLink.exec(cell)?.[1] ?? cell;
  if (!siteValue.test(value) || /^http:\/\//iu.test(value)) return;
  try {
    const url = publicHttpsUrl(/^https:\/\//i.test(value) ? value : 'https://' + value);
    if (allowQuery || !url.search) return url;
  } catch {
    // A publisher's label does not make a private or malformed URL safe.
  }
}

/** A site's mention in article prose is not enough. Require an entity and
 * website on the same complete publisher row and carry its citation forward. */
function listedWebsites(sources: readonly ResearchPage[]) {
  const candidates = new Map<string, Map<string, Website>>();
  sources.forEach((source, index) => {
    let columns: ReturnType<typeof websiteColumns> | undefined;
    let width = 0;
    for (const raw of (source.snippet ?? '').split(/\r?\n/)) {
      const line = raw.trim();
      if (/^(?:\u0060{3,}|~{3,})/.test(line)) {
        // Do not reinterpret an example or a formatted snippet as site evidence.
        break;
      }
      if (!line.includes('|')) {
        if (line && line !== '...') columns = undefined;
        continue;
      }
      const row = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      const header = websiteColumns(row);
      if (header.entity >= 0 && header.site >= 0) {
        columns = header;
        width = row.length;
        continue;
      }
      if (!columns || row.length !== width) continue;
      const entity = entityKey(row[columns.entity]!);
      const url = websiteDestination(row[columns.site]!);
      if (!entity || !url) continue;
      const equivalent = url.href.replace(/^https:\/\/www\./u, 'https://');
      const options = candidates.get(entity) ?? new Map<string, Website>();
      if (!options.has(equivalent)) options.set(equivalent, { url: url.href, sourceNumber: index + 1 });
      candidates.set(entity, options);
    }
  });
  return candidates;
}

export function bindListedWebsiteRows(response: string, sources: readonly ResearchPage[]) {
  const tables = nativeMarkdownTables(response).filter(({ head }) => {
    const { entity, site } = websiteColumns(head);
    return entity >= 0 && site >= 0;
  });
  if (!tables.length) return { response, destinations: new Set<string>(), rows: undefined };

  const candidates = listedWebsites(sources);
  const retrieved = new Map(sources.map((source, index) => [source.url, index + 1]));
  const lines = response.replace(/\r\n?/g, '\n').split('\n');
  const destinations = new Set<string>();
  const linkedEntities = new Set<string>();
  let missingRows = 0;
  for (const table of tables) {
    const { entity, site } = websiteColumns(table.head);
    table.rows.forEach((row, index) => {
      const key = entityKey(row[entity]!);
      const options = candidates.get(key);
      const verified = options?.size === 1 ? options.values().next().value : undefined;
      const current = websiteDestination(row[site]!, true);
      const sourceNumber = current && retrieved.get(current.href);
      const website = current && sourceNumber ? { url: current.href, sourceNumber } : verified;
      const cell = siteCell(row[site]!);
      let bound = row[site]!;
      if (key && website) {
        destinations.add(website.url);
        if (!sourceNumber || !siteLink.test(cell)) {
          const host = new URL(website.url).hostname.replace(/^www\./iu, '');
          bound = '[' + host + '](<' + website.url + '>) [' + website.sourceNumber + ']';
        }
        linkedEntities.add(key);
      } else {
        missingRows++;
        // A bare domain from a fragment can look like a verified result even
        // when the publisher's excerpt never identified its owner.
        if (siteValue.test(cell)) bound = 'Official link not verified';
      }
      if (row[site] !== bound) {
        const updated = [...row];
        updated[site] = bound;
        lines[table.start + 2 + index] = nativeMarkdownTableRow(updated);
      }
    });
  }
  // The row values are authoritative. Discard a separate site-coverage recap
  // which can otherwise retain an obsolete verification count or entity list.
  const coverageSections: Array<{ start: number; end: number }> = [];
  let fence: string | undefined;
  for (let index = 0; index < lines.length; index++) {
    const marker = /^ {0,3}(\u0060{3,}|~{3,})(.*)$/.exec(lines[index]!);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]?.trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    if (linkCoverageRecap.test(lines[index]!) && tables.some(table => table.end <= index)) {
      coverageSections.push({ start: index, end: index + 1 });
      continue;
    }
    const heading = linkOnlySummary.exec(lines[index]!);
    if (!heading || !tables.some(table => table.start < index)) continue;
    let end = index + 1;
    while (end < lines.length && (nextHeading.exec(lines[end]!)?.[1].length ?? 7) > heading[1]!.length) end++;
    // Retain any code or additional structured content even if it is placed
    // under an otherwise redundant model-written section heading.
    if (!lines.slice(index + 1, end).some(line => line.includes('|') || /^ {0,3}(?:\u0060{3,}|~{3,})/.test(line))) {
      coverageSections.push({ start: index, end });
      index = end - 1;
    }
  }
  for (const section of coverageSections.reverse()) lines.splice(section.start, section.end - section.start);
  return { response: lines.join('\n'), destinations, rows: { linked: linkedEntities.size, missing: missingRows } };
}
