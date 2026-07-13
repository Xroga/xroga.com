/**
 * Grok Agent Tools — web_search + x_search via xAI Responses API.
 * Used for live X.com trends, hackathon chatter, and UI research.
 */

import { getSecret } from '../config/envSecrets.js';
import { XROGA_MODELS } from '../config/modelRegistry.js';

export interface GrokSearchHit {
  title: string;
  url: string;
  snippet: string;
  source: 'grok_web' | 'grok_x';
}

export interface GrokSearchBundle {
  summary: string;
  hits: GrokSearchHit[];
}

function extractOutputText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  if (typeof d.output_text === 'string') return d.output_text.trim();
  const output = d.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      if (o.type === 'message' && Array.isArray(o.content)) {
        for (const block of o.content) {
          if (block && typeof block === 'object' && (block as { type?: string }).type === 'output_text') {
            const t = (block as { text?: string }).text;
            if (t) parts.push(t);
          }
        }
      }
    }
    if (parts.length) return parts.join('\n').trim();
  }
  return '';
}

function extractCitations(data: unknown): GrokSearchHit[] {
  const hits: GrokSearchHit[] = [];
  if (!data || typeof data !== 'object') return hits;
  const citations = (data as { citations?: unknown[] }).citations;
  if (!Array.isArray(citations)) return hits;

  for (const c of citations) {
    if (!c || typeof c !== 'object') continue;
    const row = c as { url?: string; title?: string; snippet?: string; source?: string };
    if (!row.url) continue;
    const isX = /x\.com|twitter\.com/i.test(row.url) || row.source === 'x';
    hits.push({
      title: row.title?.trim() || row.url,
      url: row.url,
      snippet: (row.snippet ?? '').slice(0, 280),
      source: isX ? 'grok_x' : 'grok_web',
    });
  }
  return hits;
}

/** Run Grok web + optional X.com search. Returns null if API key missing or call fails. */
export async function grokAgentSearch(
  query: string,
  opts?: { xSearch?: boolean; webSearch?: boolean; maxTokens?: number }
): Promise<GrokSearchBundle | null> {
  const apiKey = getSecret('GROK_API_KEY') ?? getSecret('XAI_API_KEY');
  if (!apiKey) return null;

  const tools: Array<{ type: string }> = [];
  if (opts?.webSearch !== false) tools.push({ type: 'web_search' });
  if (opts?.xSearch) tools.push({ type: 'x_search' });
  if (!tools.length) tools.push({ type: 'web_search' });

  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: XROGA_MODELS.grok_fast.apiModel,
        input: [
          {
            role: 'user',
            content: `Research query (cite sources, be factual, no guesses):\n${query}`,
          },
        ],
        tools,
        max_output_tokens: opts?.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      console.warn('[grokSearch] API', response.status, (await response.text()).slice(0, 120));
      return null;
    }

    const data = await response.json();
    const summary = extractOutputText(data);
    const hits = extractCitations(data);
    if (!summary && !hits.length) return null;

    return { summary: summary.slice(0, 2000), hits: hits.slice(0, 8) };
  } catch (err) {
    console.warn('[grokSearch]', (err as Error).message?.slice(0, 120));
    return null;
  }
}

export function formatGrokSearchContext(bundle: GrokSearchBundle): string {
  const lines = bundle.hits.map((h) => `- **${h.title}** (${h.url}): ${h.snippet}`);
  return [
    '## Grok live research (web + X.com when enabled)',
    bundle.summary ? bundle.summary : '',
    lines.length ? `\nSources:\n${lines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
