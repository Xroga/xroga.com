import { access, mkdir, readFile, realpath, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assetInventorySchema, claimRecordSchema, contentManifestSchema, sourceRecordSchema,
  type AssetInventory, type ClaimRecord, type ContentManifest, type KeywordMetric,
  type SerpObservation, type SourceRecord,
} from './model.js';
import { parseAhrefsCsv, parseAhrefsJson, parseSerpCsv, parseSerpJson } from './providers.js';
import { IMPORT_ROOT, REPOSITORY_ROOT } from '../repository.js';

export const CONTENT_SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'growth', 'content');
export const CONTENT_MANIFEST_ROOT = path.join(REPOSITORY_ROOT, 'content', 'manifests');
export const CONTENT_OUTPUT_ROOT = path.join(REPOSITORY_ROOT, 'artifacts', 'growth-content');

async function optionalText(file: string): Promise<string | null> {
  try { return await readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function requiredJson<T>(file: string, parser: { parse(input: unknown): T }): Promise<T[]> {
  const value = JSON.parse(await readFile(file, 'utf8')) as unknown;
  if (!Array.isArray(value)) throw new Error(`${path.relative(REPOSITORY_ROOT, file)} must contain a JSON array.`);
  return value.map((record, index) => {
    try { return parser.parse(record); }
    catch (error) { throw new Error(`${path.relative(REPOSITORY_ROOT, file)} record ${index} is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  });
}

export type GrowthContentSource = {
  keywordMetrics: KeywordMetric[];
  serpObservations: SerpObservation[];
  inventory: AssetInventory[];
  sources: SourceRecord[];
  claims: ClaimRecord[];
  manifests: ContentManifest[];
  providerStates: Array<{ provider: string; status: 'AVAILABLE' | 'NO_DATA'; reason?: string }>;
};

async function loadKeywordMetrics(): Promise<{ records: KeywordMetric[]; source: string | null }> {
  const csv = await optionalText(path.join(IMPORT_ROOT, 'ahrefs-keywords.csv'));
  const json = await optionalText(path.join(IMPORT_ROOT, 'ahrefs-keywords.json'));
  if (csv && json) throw new Error('Supply one Ahrefs import format per run, not both CSV and JSON.');
  if (csv) return { records: parseAhrefsCsv(csv), source: 'growth/imports/ahrefs-keywords.csv' };
  if (json) return { records: parseAhrefsJson(JSON.parse(json)), source: 'growth/imports/ahrefs-keywords.json' };
  return { records: [], source: null };
}

async function loadSerpObservations(): Promise<{ records: SerpObservation[]; source: string | null }> {
  const csv = await optionalText(path.join(IMPORT_ROOT, 'serp-observations.csv'));
  const json = await optionalText(path.join(IMPORT_ROOT, 'serp-observations.json'));
  if (csv && json) throw new Error('Supply one SERP import format per run, not both CSV and JSON.');
  if (csv) return { records: parseSerpCsv(csv), source: 'growth/imports/serp-observations.csv' };
  if (json) return { records: parseSerpJson(JSON.parse(json)), source: 'growth/imports/serp-observations.json' };
  return { records: [], source: null };
}

async function loadManifests(): Promise<ContentManifest[]> {
  try {
    const files = (await readdir(CONTENT_MANIFEST_ROOT)).filter((file) => file.endsWith('.json')).sort();
    const manifests = await Promise.all(files.map(async (file) => contentManifestSchema.parse(JSON.parse(await readFile(path.join(CONTENT_MANIFEST_ROOT, file), 'utf8')))));
    const canonicals = new Set<string>();
    for (const manifest of manifests) {
      if (canonicals.has(manifest.canonical)) throw new Error(`Duplicate content canonical: ${manifest.canonical}.`);
      canonicals.add(manifest.canonical);
    }
    return manifests;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadGrowthContentSource(): Promise<GrowthContentSource> {
  const [keywords, serp, inventory, sources, claims, manifests] = await Promise.all([
    loadKeywordMetrics(), loadSerpObservations(),
    requiredJson(path.join(CONTENT_SOURCE_ROOT, 'asset-inventory.json'), assetInventorySchema),
    requiredJson(path.join(CONTENT_SOURCE_ROOT, 'sources.json'), sourceRecordSchema),
    requiredJson(path.join(CONTENT_SOURCE_ROOT, 'claims.json'), claimRecordSchema),
    loadManifests(),
  ]);
  return {
    keywordMetrics: keywords.records, serpObservations: serp.records, inventory, sources, claims, manifests,
    providerStates: [
      { provider: 'ahrefs-manual-import', status: keywords.records.length ? 'AVAILABLE' : 'NO_DATA', ...(keywords.source ? {} : { reason: 'No Ahrefs CSV/JSON export supplied.' }) },
      { provider: 'serp-observation-import', status: serp.records.length ? 'AVAILABLE' : 'NO_DATA', ...(serp.source ? {} : { reason: 'No structured SERP observation supplied.' }) },
    ],
  };
}

export async function writeContentOutput(name: string, content: string, dryRun: boolean): Promise<string> {
  const target = path.join(CONTENT_OUTPUT_ROOT, name);
  if (!dryRun) { await mkdir(CONTENT_OUTPUT_ROOT, { recursive: true }); await writeFile(target, content, 'utf8'); }
  return target;
}

export async function resolveSafeContentPath(requested: string, repositoryRoot = REPOSITORY_ROOT): Promise<string> {
  const resolved = path.resolve(repositoryRoot, requested);
  if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('Content path must stay inside the repository.');
  await access(resolved);
  const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(repositoryRoot), realpath(resolved)]);
  if (canonicalTarget !== canonicalRoot && !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error('Content path must not escape the repository through a symbolic link.');
  return canonicalTarget;
}
