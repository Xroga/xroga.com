import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  associationSchema, canonicalFactSchema, crawlerPolicySchema, demandItemSchema, entitySchema,
  formatCoverageSchema, mentionSchema, promptObservationSchema,
  type Association, type CanonicalFact, type CrawlerPolicy, type DemandItem, type Entity,
  type FormatCoverage, type GscRow, type Mention, type PromptObservation, type VisibilityMetric,
} from './model.js';
import { parseGscCsv, parseMentions, parsePromptObservations, parseVisibilityMetrics } from './providers.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(MODULE_DIR, '../../..');
export const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'growth', 'source');
export const IMPORT_ROOT = path.join(REPOSITORY_ROOT, 'growth', 'imports');
export const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, 'artifacts', 'growth-intelligence');

async function json(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(SOURCE_ROOT, name), 'utf8'));
}

function list<T>(value: unknown, parser: { parse(input: unknown): T }): T[] {
  if (!Array.isArray(value)) throw new Error('Expected a JSON array.');
  return value.map((item) => parser.parse(item));
}

export type IntelligenceSource = {
  entities: Entity[];
  associations: Association[];
  facts: CanonicalFact[];
  demand: DemandItem[];
  promptObservations: PromptObservation[];
  mentions: Mention[];
  formatCoverage: FormatCoverage[];
  crawlerPolicies: CrawlerPolicy[];
  gscRows: GscRow[];
  visibilityMetrics: VisibilityMetric[];
};

async function optionalText(name: string): Promise<string | null> {
  try { return await readFile(path.join(IMPORT_ROOT, name), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function loadSource(): Promise<IntelligenceSource> {
  const [entities, associations, facts, demand, promptObservations, mentions, formatCoverage, crawlerPolicies] = await Promise.all([
    json('entities.json'), json('associations.json'), json('facts.json'), json('demand.json'),
    json('prompt-observations.json'), json('mentions.json'), json('format-coverage.json'), json('crawler-policies.json'),
  ]);
  const [gscImport, promptImport, mentionImport, visibilityImport] = await Promise.all([
    optionalText('gsc.csv'), optionalText('prompt-observations.json'), optionalText('mentions.json'), optionalText('visibility-metrics.json'),
  ]);
  return {
    entities: list(entities, entitySchema), associations: list(associations, associationSchema), facts: list(facts, canonicalFactSchema),
    demand: list(demand, demandItemSchema),
    promptObservations: [...list(promptObservations, promptObservationSchema), ...(promptImport ? parsePromptObservations(JSON.parse(promptImport)) : [])],
    mentions: [...list(mentions, mentionSchema), ...(mentionImport ? parseMentions(JSON.parse(mentionImport)) : [])],
    formatCoverage: list(formatCoverage, formatCoverageSchema),
    crawlerPolicies: list(crawlerPolicies, crawlerPolicySchema),
    gscRows: gscImport ? parseGscCsv(gscImport) : [],
    visibilityMetrics: visibilityImport ? parseVisibilityMetrics(JSON.parse(visibilityImport)) : [],
  };
}

export async function writeOutput(name: string, content: string, dryRun: boolean): Promise<string> {
  const target = path.join(OUTPUT_ROOT, name);
  if (!dryRun) { await mkdir(OUTPUT_ROOT, { recursive: true }); await writeFile(target, content, 'utf8'); }
  return target;
}

export async function validateCanonicalFactSources(facts: readonly CanonicalFact[]): Promise<Array<{ code: string; path: string; message: string }>> {
  const issues: Array<{ code: string; path: string; message: string }> = [];
  for (const fact of facts) {
    if (/^https?:\/\//i.test(fact.source)) continue;
    const relativePath = fact.source.split('#', 1)[0];
    const resolved = path.resolve(REPOSITORY_ROOT, relativePath);
    if (resolved !== REPOSITORY_ROOT && !resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
      issues.push({ code: 'UNSAFE_FACT_SOURCE', path: fact.factKey, message: fact.source });
      continue;
    }
    try { await access(resolved); }
    catch { issues.push({ code: 'MISSING_FACT_SOURCE', path: fact.factKey, message: fact.source }); }
  }
  return issues;
}
