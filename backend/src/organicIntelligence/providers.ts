import {
  gscRowSchema, mentionSchema, promptObservationSchema, visibilityMetricSchema,
  type GscRow, type Mention, type PromptObservation, type VisibilityMetric,
} from './model.js';

export type ProviderStatus = 'AVAILABLE' | 'NO_DATA' | 'UNKNOWN' | 'UNAVAILABLE' | 'PLAN_LIMITED' | 'STALE';
export type ProviderResult<T> = { provider: string; status: ProviderStatus; records: T[]; reason?: string; observedAt: string };

export interface OrganicDataProvider<T> {
  readonly id: string;
  load(): Promise<ProviderResult<T>>;
}

export type AhrefsDatasetLoader = (token: string) => Promise<Record<string, unknown>[]>;

export class AhrefsProvider implements OrganicDataProvider<Record<string, unknown>> {
  readonly id = 'ahrefs';
  constructor(private readonly token?: string, private readonly datasetLoader?: AhrefsDatasetLoader) {}
  async load(): Promise<ProviderResult<Record<string, unknown>>> {
    const observedAt = new Date().toISOString();
    if (!this.token) return { provider: this.id, status: 'UNAVAILABLE', records: [], reason: 'AHREFS_API_TOKEN is not configured.', observedAt };
    if (!this.datasetLoader) return { provider: this.id, status: 'PLAN_LIMITED', records: [], reason: 'No verified Ahrefs dataset loader is configured. Use the documented CSV/JSON import path.', observedAt };
    try {
      const records = await this.datasetLoader(this.token);
      return records.length
        ? { provider: this.id, status: 'AVAILABLE', records, observedAt }
        : { provider: this.id, status: 'NO_DATA', records: [], reason: 'The configured Ahrefs dataset returned no records.', observedAt };
    } catch {
      return { provider: this.id, status: 'UNAVAILABLE', records: [], reason: 'The configured Ahrefs dataset could not be loaded.', observedAt };
    }
  }
}

function assertUniqueIds<T>(records: readonly T[], label: string, idFor: (record: T) => string): void {
  const seen = new Set<string>();
  for (const record of records) {
    const id = idFor(record);
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}.`);
    seen.add(id);
  }
}

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { cells.push(value); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted field.');
  cells.push(value);
  return cells.map((cell) => cell.trim());
}

export function parseGscCsv(input: string): GscRow[] {
  const normalized = input.replace(/^\uFEFF/, '');
  if (!normalized.trim()) return [];
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Malformed GSC import: expected a header and at least one data row.');
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'));
  if (new Set(headers).size !== headers.length) throw new Error('Malformed GSC import: duplicate column name.');
  const required = ['query', 'page', 'date', 'clicks', 'impressions', 'ctr', 'position'];
  for (const key of required) if (!headers.includes(key)) throw new Error(`Malformed GSC import: missing ${key} column.`);
  const number = (value: unknown, name: string, row: number): number => {
    if (String(value ?? '').trim() === '') throw new Error(`Malformed GSC import: row ${row} has an empty ${name}.`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Malformed GSC import: row ${row} has an invalid ${name}.`);
    return parsed;
  };
  const records = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) throw new Error(`Malformed GSC import: row ${index + 2} has ${cells.length} cells, expected ${headers.length}.`);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]));
    const ctrText = String(row.ctr).replace('%', '');
    const ctrValue = number(ctrText, 'ctr', index + 2);
    const ctr = String(row.ctr).includes('%') ? ctrValue / 100 : ctrValue;
    return gscRowSchema.parse({
      query: row.query, page: row.page, country: row.country || undefined, device: row.device || undefined,
      date: row.date, clicks: number(row.clicks, 'clicks', index + 2),
      impressions: number(row.impressions, 'impressions', index + 2), ctr,
      position: number(row.position, 'position', index + 2),
    });
  });
  assertUniqueIds(records, 'GSC row', (row) => [row.query, row.page, row.country ?? '', row.device ?? '', row.date].join('|').toLowerCase());
  return records;
}

export function parsePromptObservations(value: unknown): PromptObservation[] {
  if (!Array.isArray(value)) throw new Error('Prompt observations import must be a JSON array.');
  const records = value.map((item, index) => {
    try { return promptObservationSchema.parse(item); }
    catch (error) { throw new Error(`Invalid prompt observation at index ${index}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  });
  assertUniqueIds(records, 'prompt observation', (item) => item.promptId);
  return records;
}

export function parseMentions(value: unknown): Mention[] {
  if (!Array.isArray(value)) throw new Error('Mention import must be a JSON array.');
  const records = value.map((item, index) => {
    try { return mentionSchema.parse(item); }
    catch (error) { throw new Error(`Invalid mention at index ${index}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  });
  assertUniqueIds(records, 'mention', (item) => item.id);
  return records;
}

export function parseVisibilityMetrics(value: unknown): VisibilityMetric[] {
  if (!Array.isArray(value)) throw new Error('Visibility metrics import must be a JSON array.');
  const records = value.map((item, index) => {
    try { return visibilityMetricSchema.parse(item); }
    catch (error) { throw new Error(`Invalid visibility metric at index ${index}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  });
  assertUniqueIds(records, 'visibility metric', (item) => item.id);
  return records;
}

export function emptyProviderResult<T>(provider: string, reason: string): ProviderResult<T> {
  return { provider, status: 'NO_DATA', records: [], reason, observedAt: new Date().toISOString() };
}
