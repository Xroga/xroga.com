/**
 * Hugging Face Spaces — Gradio queue API client (REST, no Python dependency).
 * @see https://huggingface.co/docs/hub/spaces-api-endpoints
 */

import { getSecret } from '../../config/envSecrets.js';

export function spaceIdToHost(spaceId: string): string {
  return `${spaceId.replace(/\//g, '-').toLowerCase()}.hf.space`;
}

/** Wake sleeping HF Space before API call */
async function wakeSpace(host: string): Promise<void> {
  try {
    await fetch(`https://${host}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* best-effort */
  }
}

function authHeaders(): Record<string, string> {
  const token = getSecret('HF_TOKEN') ?? getSecret('HUGGINGFACE_API_KEY');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function isRateLimited(status: number, body: string): boolean {
  return status === 429 || /rate.?limit|too many requests|queue is full/i.test(body);
}

function isSpaceSleeping(status: number, body: string): boolean {
  return status === 503 || /sleeping|waking|loading|building/i.test(body);
}

function extractVideoUrl(value: unknown, host?: string): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    if (value.startsWith('http')) return value;
    if (value.startsWith('/') && host) return `https://${host}${value}`;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractVideoUrl(item, host);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.url === 'string' && o.url.startsWith('http')) return o.url;
    if (typeof o.path === 'string') {
      if (o.path.startsWith('http')) return o.path;
      if (o.path.startsWith('/') && host) return `https://${host}${o.path}`;
    }
    for (const v of Object.values(o)) {
      const found = extractVideoUrl(v, host);
      if (found) return found;
    }
  }
  return null;
}

function parseSsePayload(text: string): unknown {
  let lastComplete: unknown = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as {
        type?: string;
        stage?: string;
        message?: string;
        data?: unknown;
        output?: { data?: unknown };
      };
      if (parsed.type === 'status' && parsed.stage === 'error') {
        throw new Error(parsed.message ?? 'Gradio space error');
      }
      if (parsed.output?.data !== undefined) {
        lastComplete = parsed.output.data;
      } else if (parsed.data !== undefined) {
        lastComplete = parsed.data;
      } else if (Array.isArray(parsed)) {
        lastComplete = parsed;
      }
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
  }
  return lastComplete;
}

export interface GradioCallOptions {
  spaceId: string;
  apiName: string;
  data: unknown[];
  timeoutMs?: number;
  label?: string;
}

/** Submit + poll a Gradio Space endpoint; returns raw result data */
export async function callGradioSpace(options: GradioCallOptions): Promise<unknown> {
  const host = spaceIdToHost(options.spaceId);
  const base = `https://${host}`;
  const apiPath = options.apiName.startsWith('/') ? options.apiName : `/${options.apiName}`;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const headers = authHeaders();

  await wakeSpace(host);

  let eventId: string | null = null;
  let lastErr = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const submitRes = await fetch(`${base}/gradio_api/call${apiPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: options.data }),
      signal: AbortSignal.timeout(30_000),
    });

    const submitBody = await submitRes.text();
    if (submitRes.ok) {
      try {
        const parsed = JSON.parse(submitBody) as { event_id?: string };
        eventId = parsed.event_id ?? null;
      } catch {
        throw new Error(`${options.label ?? options.spaceId}: invalid submit response`);
      }
      break;
    }

    lastErr = submitBody.slice(0, 200);
    if (isRateLimited(submitRes.status, submitBody) || isSpaceSleeping(submitRes.status, submitBody)) {
      const wait = 2000 + attempt * 3000;
      console.warn(`[Gradio] ${options.label ?? options.spaceId} ${submitRes.status} — retry in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`${options.label ?? options.spaceId} submit ${submitRes.status}: ${lastErr}`);
  }

  if (!eventId) {
    throw new Error(`${options.label ?? options.spaceId}: no event_id (${lastErr})`);
  }

  const pollRes = await fetch(`${base}/gradio_api/call${apiPath}/${eventId}`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const pollBody = await pollRes.text();
  if (!pollRes.ok) {
    if (isRateLimited(pollRes.status, pollBody)) {
      throw new Error(`RATE_LIMIT:${options.label ?? options.spaceId}`);
    }
    throw new Error(`${options.label ?? options.spaceId} poll ${pollRes.status}: ${pollBody.slice(0, 200)}`);
  }

  const result = parseSsePayload(pollBody);
  if (!result) throw new Error(`${options.label ?? options.spaceId}: empty Gradio result`);
  return result;
}

export function videoUrlFromGradioResult(result: unknown, spaceId: string): string {
  const host = spaceIdToHost(spaceId);
  const url = extractVideoUrl(result, host);
  if (!url) throw new Error('Gradio result contained no video URL');
  return url;
}
