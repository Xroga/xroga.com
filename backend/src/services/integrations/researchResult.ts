import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { preparedActionDigest } from '../../security/authority/digest.js';
import { publicHttpsUrl } from '../../security/egress/urlPolicy.js';
import { redactSecrets } from '../../lib/truthfulExecution.js';
import { actorFromTenantContext, getStorageService } from '../../storage/runtime.js';
import type { SafeBusinessActionConfirmation } from './businessActionConfirmations.js';
import {z} from 'zod';

const MAX_BYTES = 262_144;
const filename = (id: string) => {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid research confirmation');
  return `research-${id}.json`;
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === 'string' ? redactSecrets(v) : '';
const answerSchema=z.object({response:z.string().min(1).max(160_000),completion:z.object({status:z.enum(['complete','partial']),reason:z.string().max(200).optional()}).strict(),
 responseSource:z.object({format:z.literal('xroga-response-json-v1'),text:z.string().max(200_000),contract:z.unknown().optional()}).strict().optional(),
 webSources:z.array(z.object({title:z.string().max(4000),url:z.string().max(8000),snippet:z.string().max(12_000),source:z.string().max(100)}).strict()).max(12),
}).strict();

/** Readiness is checked before dispatch. Reading a receipt never invokes a provider. */
export function requireResearchResultStorage() {
  const storage = getStorageService();
  if (!storage) throw new Error('Private research result storage is unavailable');
  return storage;
}

export async function saveResearchResult(context: TenantContext, id: string, resultText: string, digest: string, projectId?: string | null) {
  requireTenantContext(context);
  if (Buffer.byteLength(resultText) > MAX_BYTES) throw new Error('Research result exceeds storage bound');
  const result: unknown = JSON.parse(resultText);
  if (preparedActionDigest(result) !== digest) throw new Error('Research result integrity mismatch');
  await requireResearchResultStorage().putServerObject(actorFromTenantContext(context), {
    projectId, objectClass: 'artifact', filename: filename(id), contentType: 'application/json', body: Buffer.from(resultText),
  });
}

export interface ResearchResult {
  confirmationId: string;
  receiptId: string;
  text: string;
  sources: Array<{ title: string; url: string; snippet: string; source: string }>;
  omittedSourceCount: number;
  answer?:z.infer<typeof answerSchema>;
  answerFailure?:string;
}

/** Provider evidence is untrusted content, never an instruction or a new authority. */
export function presentResearchResult(raw: unknown): Omit<ResearchResult, 'confirmationId' | 'receiptId'> {
  const envelope = record(raw);
  if (envelope.ok !== true || !['search', 'extract', 'responses'].includes(String(envelope.operation))) throw new Error('Invalid research result');
  const data = record(envelope.result);
  const items = Array.isArray(data.output) ? data.output.flatMap(v => Array.isArray(record(v).content) ? record(v).content as unknown[] : []) : [];
  const answer = text(data.output_text) || items.filter(v => record(v).type === 'output_text').map(v => text(record(v).text)).join('\n');
  const candidates = Array.isArray(data.results) ? data.results : items.flatMap(v => Array.isArray(record(v).annotations) ? record(v).annotations as unknown[] : []).filter(v => record(v).type === 'url_citation');
  const sources: ResearchResult['sources'] = [];
  const seen = new Map<string, number>();
  let omittedSourceCount = 0;
  for (const candidate of candidates) {
    const item = record(candidate);
    try {
      if (typeof item.url !== 'string') throw new Error('Missing source URL');
      publicHttpsUrl(item.url);
      const url = new URL(item.url);
      url.hash = '';
      // Keep distinct paths and query parameters. A hostname is not a page ID.
      const canonical = url.href;
      const snippet = Array.isArray(item.excerpts) ? item.excerpts.map(text).join('\n') : '';
      const previous = seen.get(canonical);
      if (previous !== undefined) {
        if (snippet && !sources[previous]!.snippet.split('\n').includes(snippet)) {
          sources[previous]!.snippet = [sources[previous]!.snippet, snippet].filter(Boolean).join('\n');
        }
        continue;
      }
      seen.set(canonical, sources.length);
      sources.push({ title: text(item.title) || url.hostname, url: canonical,
        snippet, source: 'parallel' });
    } catch { omittedSourceCount++; }
  }
  const synthesis=envelope.answer===undefined?undefined:answerSchema.safeParse(envelope.answer);
  // Citation metadata can only refer to pages actually returned by retrieval.
  const sourced=synthesis?.success&&synthesis.data.webSources.every(s=>{
    try{publicHttpsUrl(s.url);const url=new URL(s.url);url.hash='';return sources.some(source=>source.url===url.href);}catch{return false;}
  });
  return { text: answer, sources, omittedSourceCount,
    ...(synthesis?.success&&sourced?{answer:synthesis.data}:{}),
    ...(envelope.answer!==undefined&&!sourced?{answerFailure:'INVALID_SAVED_ANSWER'}
      :['NO_QUALIFYING_SOURCES','SYNTHESIS_UNAVAILABLE'].includes(String(envelope.answerFailure))?{answerFailure:String(envelope.answerFailure)}:{}),
  };
}

/** Caller must obtain the confirmation through the owner-scoped confirmation lookup. */
export async function readResearchResult(context: TenantContext, confirmation: SafeBusinessActionConfirmation): Promise<ResearchResult | null> {
  requireTenantContext(context);
  const receipt = confirmation.receipt;
  if (confirmation.toolkit !== 'xroga-native-research' || confirmation.status !== 'consumed'
    || receipt?.outcome !== 'provider_reported_success' || !receipt.resultDigest) return null;
  const storage = requireResearchResultStorage();
  const actor = actorFromTenantContext(context);
  const objects = await storage.listObjects(actor, { safeFilename: filename(confirmation.id), limit: 100 });
  for (const object of objects) {
    const { bytes } = await storage.readObjectBytes(actor, object.id, MAX_BYTES);
    let raw: unknown;
    try { raw = JSON.parse(bytes.toString('utf8')); if (preparedActionDigest(raw) !== receipt.resultDigest) continue; }
    catch { continue; }
    return { ...presentResearchResult(raw), confirmationId: confirmation.id, receiptId: receipt.id };
  }
  // Historical confirmations may predate durable result storage. Never repeat them.
  return null;
}
