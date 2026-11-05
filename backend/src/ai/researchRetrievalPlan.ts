import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {acceptedSearchResultCount} from './researchSearchProvider.js';

export type RetrievalKind = 'normal' | 'automatic' | 'deep';
export type RetrievalOperation = 'search' | 'extract';
export interface RetrievalPage {url: string; title?: string; publish_date?: string | null; excerpts?: string[]}
export interface RetrievalReceipt {search_id: string; provider: 'deepseek'; results: RetrievalPage[]}
export const retrievalOperationLimit = (kind: RetrievalKind) => kind === 'deep' ? 5 : kind === 'automatic' ? 2 : 1;
export function retrievalMaximum(operation: RetrievalOperation, body: Record<string, unknown>): number {
  if (operation === 'extract') {
    if (!Array.isArray(body.urls) || !body.urls.length || body.urls.length > 10) throw new Error('Invalid retrieval URLs');
    return body.urls.length * 750;
  }
  const kind = body.research_kind;
  if (kind !== 'normal' && kind !== 'automatic' && kind !== 'deep') throw new Error('Invalid retrieval mode');
  const count = acceptedSearchResultCount(body.result_count);
  if (count !== (kind === 'deep' ? 50 : kind === 'automatic' ? 30 : 15)) throw new Error('Invalid retrieval depth');
  return retrievalOperationLimit(kind) * 750;
}

const query = (base: string, suffix: string) => [...base.trim()].slice(0, 86).join('') + ' ' + [...suffix].slice(0, 40).join('');
const key = (url: string) => publicHttpsUrl(url).href;

/** A bounded continuation INSIDE the existing approved research action. It
 * owns no identity, credentials, permission, network transport or money ledger.
 * The caller revalidates the exact action and reserves/settles every dispatch.
 * Provider content is data only. No generated text can increase this plan.
 */
export async function runApprovedRetrievalPlan(input: {
  operation: RetrievalOperation;
  body: Record<string, unknown>;
  execute: (operation: RetrievalOperation, body: Record<string, unknown>) => Promise<RetrievalReceipt>;
  progress: (result: RetrievalReceipt & {steps: Array<{operation: RetrievalOperation; requestId: string}>}) => Promise<void>;
}) {
  const maximum = retrievalMaximum(input.operation, input.body);
  const rows = new Map<string, RetrievalPage>();
  const batches: string[][] = [], inspectedPages = new Set<string>();
  const steps: Array<{operation: RetrievalOperation; requestId: string}> = [];
  let lastRequestId = '';
  const snapshot = () => {
    const ordered=new Set(inspectedPages);
    // Preserve inspected pages and a fair share from every search round.
    // Otherwise the first 50 results would hide all later verification work.
    for(let i=0;i<50;i++)for(const batch of [...batches].reverse())if(batch[i])ordered.add(batch[i]);
    return {search_id:lastRequestId,provider:'deepseek' as const,
      results:[...ordered].slice(0,50).map(url=>rows.get(url)!),steps:steps.map(s=>({...s}))};
  };
  const call = async (operation: RetrievalOperation, body: Record<string, unknown>) => {
    if ((steps.length + 1) * 750 > maximum) throw new Error('Approved retrieval operation ceiling exceeded');
    const receipt = await input.execute(operation, structuredClone(body));
    lastRequestId = receipt.search_id;
    steps.push({operation, requestId: lastRequestId});
    const batch:string[]=[];
    for (const page of receipt.results) {
      try {
        const url = key(page.url);
        const previous = rows.get(url);
        batch.push(url);if(operation==='extract')inspectedPages.add(url);
        // A fetched page replaces its search summary; unrelated pages survive.
        rows.set(url, {...previous, ...page, url,
          ...(operation === 'search' && previous ? {excerpts: previous.excerpts} : {})});
      } catch { /* A search result cannot authorize a private or malformed URL. */ }
    }
    if(operation==='search')batches.push(batch);
    await input.progress(snapshot()); // Save completed evidence before another paid effect.
    return receipt;
  };
  if (input.operation === 'extract') {
    for (const value of input.body.urls as string[]) {
      await call('extract', {...input.body, urls: [key(value)]});
    }
    return snapshot();
  }
  const kind = input.body.research_kind as RetrievalKind;
  const base = String((input.body.search_queries as string[])[0]);
  const search = (q: string) => call('search', {...input.body, search_queries: [q]});
  const first = await search(base);
  if (kind === 'normal') return snapshot();
  if (kind === 'automatic') {
    await search(query(base, 'primary source independent evidence'));
    return snapshot();
  }
  const fetched = new Set<string>();
  const fetchNext = async () => {
    for (const page of rows.values()) {
      const host = new URL(page.url).hostname;
      if (fetched.has(host)) continue;
      fetched.add(host);
      return call('extract', {urls: [page.url], objective: input.body.objective,
        research_kind: kind, research_run_id: input.body.research_run_id});
    }
    return undefined;
  };
  const inspected = await fetchNext();
  const focus = inspected?.results[0]?.title || first.results[0]?.title || 'primary evidence';
  await search(query(base, `${focus} limitations`));
  await fetchNext();
  await search(query(base, 'independent verification conflicting evidence'));
  return snapshot();
}
