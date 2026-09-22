import { parseCsvLine } from '../providers.js';
import {
  keywordMetricSchema, serpObservationSchema,
  type KeywordMetric, type SerpObservation,
} from './model.js';

function rows(input: string, label: string): Array<Record<string, string>> {
  const normalized = input.replace(/^\uFEFF/, '');
  if (!normalized.trim()) return [];
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error(`Malformed ${label} import: expected a header and at least one row.`);
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  if (new Set(headers).size !== headers.length) throw new Error(`Malformed ${label} import: duplicate column name.`);
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) throw new Error(`Malformed ${label} import: row ${index + 2} has ${cells.length} cells, expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]));
  });
}

function optionalNumber(value: string | undefined, field: string, row: number): number | null {
  if (value == null || value.trim() === '' || value.trim().toLowerCase() === 'unknown') return null;
  const normalized = value.replace(/[$,%]/g, '').replace(/,/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Malformed import: row ${row} has an invalid ${field}.`);
  return parsed;
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(/[;|]/).map((item) => item.trim()).filter(Boolean);
}

function urlList(value: string | undefined, row: number): string[] {
  return list(value).map((url) => {
    try { return new URL(url).toString(); }
    catch { throw new Error(`Malformed Ahrefs import: row ${row} contains an invalid ranking URL.`); }
  });
}

const intentAliases: Record<string, KeywordMetric['serpIntent']> = {
  product: 'PRODUCT', category: 'CATEGORY', guide: 'GUIDE', informational: 'GUIDE',
  comparison: 'COMPARISON', alternative: 'ALTERNATIVE', migration: 'MIGRATION',
  tool: 'TOOL', video: 'VIDEO', template: 'TEMPLATE', documentation: 'DOCUMENTATION',
  research: 'RESEARCH', community: 'COMMUNITY', other: 'OTHER',
};

function intent(value: string | undefined): KeywordMetric['serpIntent'] {
  if (!value?.trim()) return null;
  const parsed = intentAliases[value.toLowerCase().trim().replace(/[^a-z]+/g, '_')];
  if (!parsed) throw new Error(`Unsupported search intent value: ${value}.`);
  return parsed;
}

export function parseAhrefsCsv(input: string, source = 'growth/imports/ahrefs-keywords.csv', observedAt = new Date().toISOString()): KeywordMetric[] {
  const records = rows(input, 'Ahrefs');
  if (!records.length) return [];
  if (!('keyword' in records[0])) throw new Error('Malformed Ahrefs import: missing keyword column.');
  const seen = new Set<string>();
  return records.map((row, index) => {
    const rowNumber = index + 2;
    const keyword = row.keyword?.trim();
    if (!keyword) throw new Error(`Malformed Ahrefs import: row ${rowNumber} has an empty keyword.`);
    const country = (row.country || row.location || 'GLOBAL').trim().toUpperCase();
    const id = `ahrefs:${country.toLowerCase()}:${keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (seen.has(id)) throw new Error(`Duplicate Ahrefs keyword row: ${keyword} (${country}).`);
    seen.add(id);
    return keywordMetricSchema.parse({
      id, keyword, country, provider: 'AHREFS', status: 'AVAILABLE', source, observedAt,
      volume: optionalNumber(row.volume || row.search_volume, 'volume', rowNumber),
      globalVolume: optionalNumber(row.global_volume || row.global_search_volume, 'global volume', rowNumber),
      keywordDifficulty: optionalNumber(row.keyword_difficulty || row.kd, 'keyword difficulty', rowNumber),
      trafficPotential: optionalNumber(row.traffic_potential || row.tp, 'traffic potential', rowNumber),
      cpc: optionalNumber(row.cpc, 'CPC', rowNumber), parentTopic: row.parent_topic?.trim() || null,
      serpIntent: intent(row.serp_intent || row.intent), serpFeatures: list(row.serp_features),
      topRankingPages: urlList(row.top_ranking_pages || row.ranking_urls, rowNumber),
    });
  });
}

function bool(value: string | undefined, name: string, row: number): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0', ''].includes(normalized)) return false;
  throw new Error(`Malformed SERP import: row ${row} has an invalid ${name}.`);
}

export function parseSerpCsv(input: string, source = 'growth/imports/serp-observations.csv'): SerpObservation[] {
  const records = rows(input, 'SERP');
  if (!records.length) return [];
  const required = ['query', 'country', 'device', 'date', 'position', 'url', 'domain', 'title', 'content_type', 'observed_intent'];
  for (const key of required) if (!(key in records[0])) throw new Error(`Malformed SERP import: missing ${key} column.`);
  const seen = new Set<string>();
  return records.map((row, index) => {
    const rowNumber = index + 2;
    const id = `serp:${row.date}:${row.country}:${row.device}:${row.query}:${row.position}`.toLowerCase();
    if (seen.has(id)) throw new Error(`Duplicate SERP observation at row ${rowNumber}.`);
    seen.add(id);
    const contentType = intent(row.content_type);
    const observedIntent = intent(row.observed_intent);
    if (!contentType || !observedIntent) throw new Error(`Malformed SERP import: row ${rowNumber} requires content_type and observed_intent.`);
    return serpObservationSchema.parse({
      id, query: row.query, country: row.country, device: row.device, date: row.date,
      position: optionalNumber(row.position, 'position', rowNumber), url: row.url, domain: row.domain,
      title: row.title, resultType: row.result_type || 'organic', contentType,
      videoPresent: bool(row.video_present, 'video_present', rowNumber),
      forumPresent: bool(row.forum_present, 'forum_present', rowNumber),
      toolPresent: bool(row.tool_present, 'tool_present', rowNumber),
      comparisonPresent: bool(row.comparison_present, 'comparison_present', rowNumber),
      commercialPagesPresent: bool(row.commercial_pages_present, 'commercial_pages_present', rowNumber),
      informationalPagesPresent: bool(row.informational_pages_present, 'informational_pages_present', rowNumber),
      weakDomainPresent: bool(row.weak_domain_present, 'weak_domain_present', rowNumber),
      serpFeatures: list(row.serp_features), observedIntent, notes: row.notes || null, source,
    });
  });
}

export function parseAhrefsJson(value: unknown, source = 'growth/imports/ahrefs-keywords.json'): KeywordMetric[] {
  if (!Array.isArray(value)) throw new Error('Ahrefs JSON import must be an array.');
  const records = value.map((record, index) => {
    try { return keywordMetricSchema.parse({ ...(record as object), source }); }
    catch (error) { throw new Error(`Invalid Ahrefs record at index ${index}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error('Ahrefs JSON import contains duplicate ids.');
  return records;
}

export function parseSerpJson(value: unknown, source = 'growth/imports/serp-observations.json'): SerpObservation[] {
  if (!Array.isArray(value)) throw new Error('SERP JSON import must be an array.');
  const records = value.map((record, index) => {
    try { return serpObservationSchema.parse({ ...(record as object), source: (record as { source?: string }).source ?? source }); }
    catch (error) { throw new Error(`Invalid SERP record at index ${index}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error('SERP JSON import contains duplicate ids.');
  return records;
}
