import { gscRowSchema, mentionSchema, promptObservationSchema, type GscRow, type Mention, type PromptObservation } from './model.js';

export type ProviderStatus = 'AVAILABLE' | 'NO_DATA' | 'UNAVAILABLE' | 'PLAN_LIMITED';
export type ProviderResult<T> = { provider: string; status: ProviderStatus; records: T[]; reason?: string; observedAt: string };

export interface OrganicDataProvider<T> {
  readonly id: string;
  load(): Promise<ProviderResult<T>>;
}

export class AhrefsProvider implements OrganicDataProvider<Record<string, unknown>> {
  readonly id = 'ahrefs';
  constructor(private readonly token?: string, private readonly apiAvailable = false) {}
  async load(): Promise<ProviderResult<Record<string, unknown>>> {
    const observedAt = new Date().toISOString();
    if (!this.token) return { provider: this.id, status: 'UNAVAILABLE', records: [], reason: 'AHREFS_API_TOKEN is not configured.', observedAt };
    if (!this.apiAvailable) return { provider: this.id, status: 'PLAN_LIMITED', records: [], reason: 'Configured account has no verified API dataset access. Use a documented CSV/JSON import.', observedAt };
    return { provider: this.id, status: 'NO_DATA', records: [], reason: 'No Ahrefs query was requested for this refresh.', observedAt };
  }
}

function parseCsvLine(line: string): string[] {
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
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'));
  const required = ['query', 'page', 'date', 'clicks', 'impressions', 'ctr', 'position'];
  for (const key of required) if (!headers.includes(key)) throw new Error(`Malformed GSC import: missing ${key} column.`);
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) throw new Error(`Malformed GSC import: row ${index + 2} has ${cells.length} cells, expected ${headers.length}.`);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]));
    const ctrText = String(row.ctr).replace('%', '');
    const ctr = String(row.ctr).includes('%') ? Number(ctrText) / 100 : Number(ctrText);
    return gscRowSchema.parse({
      query: row.query, page: row.page, country: row.country || undefined, device: row.device || undefined,
      date: row.date, clicks: Number(row.clicks), impressions: Number(row.impressions), ctr, position: Number(row.position),
    });
  });
}

export function parsePromptObservations(value: unknown): PromptObservation[] {
  if (!Array.isArray(value)) throw new Error('Prompt observations import must be a JSON array.');
  return value.map((item, index) => {
    try { return promptObservationSchema.parse(item); }
    catch (error) { throw new Error(`Invalid prompt observation at index ${index}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  });
}

export function parseMentions(value: unknown): Mention[] {
  if (!Array.isArray(value)) throw new Error('Mention import must be a JSON array.');
  return value.map((item, index) => {
    try { return mentionSchema.parse(item); }
    catch (error) { throw new Error(`Invalid mention at index ${index}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  });
}

export function emptyProviderResult<T>(provider: string, reason: string): ProviderResult<T> {
  return { provider, status: 'NO_DATA', records: [], reason, observedAt: new Date().toISOString() };
}
