/**
 * Xroga's own model route for Stagehand (INFRA-007): the only place a browser job's AI steps can spend money.
 *
 * The browser container holds no model key and cannot reach a provider. Each Stagehand `ClientLLM` request arrives here from
 * `ContainerBrowserWorker`, and this gateway:
 *   1. bounds the call by the job's remaining allowance (output tokens are capped so the worst case fits),
 *   2. reserves it in the CANONICAL ledger (`ai/providerBudget.ts`, micro-USD) under a deterministic key per
 *      (tenant, run, task, attempt, call number), so a replay of the same call cannot reserve or settle twice,
 *   3. calls the canonical OpenAI-compatible route (`ai/openaiCompat.ts` `resolveEndpoint`), never a hosted Stagehand service,
 *   4. settles with the MEASURED usage, or releases the reservation on failure,
 *   5. returns Stagehand's result shape plus the measured cost. A call whose usage the provider did not report is not answered.
 * There is no fallback model, no second ledger and no paid hosted-browser path.
 */
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { ModelId } from '../ai/models.js';
import { resolveEndpoint } from '../ai/openaiCompat.js';
import { actualProviderCostMicroUsd, estimateProviderReservationMicroUsd, finishFailedProviderReservation, reserveProviderBudget, settleProviderBudget, type ProviderReservation } from '../ai/providerBudget.js';
import type { BrowserJob } from './browserJob.js';
import type { BrowserModelGateway } from './containerBrowserWorker.js';

export class BrowserModelError extends Error {
  constructor(readonly code: 'MODEL_BUDGET_EXHAUSTED' | 'MODEL_USAGE_UNMEASURED' | 'MODEL_REQUEST_INVALID' | 'MODEL_FAILED', message: string) { super(message); this.name = 'BrowserModelError'; }
}

type Block = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean };
interface StagehandParams {
  messages: Array<{ role: 'user' | 'assistant'; content: Block | Block[] }>;
  systemPrompt?: string; temperature?: number; stopSequences?: string[];
  responseFormat?: { type: 'text' } | { type: 'json_schema'; name: string; description?: string; schema: unknown };
  tools?: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
  toolChoice?: { mode?: 'auto' | 'required' | 'none' };
}

export interface GatewayDeps {
  modelId: ModelId;
  /** canonical ledger; injectable for tests */
  reserve?: typeof reserveProviderBudget; settle?: typeof settleProviderBudget; release?: typeof finishFailedProviderReservation;
  /** OpenAI-compatible client for the resolved endpoint; injectable for tests */
  client?: () => { model: string; create: (body: Record<string, unknown>, opts: { signal: AbortSignal }) => Promise<any> };
  /** largest single answer, before the budget cap */
  maxOutputTokens?: number;
}

const MAX_REQUEST_CHARS = 2_000_000;
const deterministicUuid = (parts: unknown[]) => {
  const h = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function toOpenAiMessages(p: StagehandParams): unknown[] {
  const out: unknown[] = [];
  if (p.systemPrompt) out.push({ role: 'system', content: p.systemPrompt });
  for (const m of p.messages) {
    const blocks = Array.isArray(m.content) ? m.content : [m.content];
    const parts: unknown[] = []; const toolCalls: unknown[] = [];
    for (const b of blocks) {
      if (b.type === 'text') parts.push({ type: 'text', text: b.text });
      else if (b.type === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${b.mimeType};base64,${b.data}` } });
      else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } });
      else if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.toolUseId, content: b.content.map((c) => (c.type === 'text' ? c.text : '[image]')).join('\n') || (b.isError ? 'error' : 'ok') });
      else throw new BrowserModelError('MODEL_REQUEST_INVALID', 'unsupported content block');
    }
    if (m.role === 'assistant') {
      const text = parts.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n');
      if (text || toolCalls.length) out.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else if (parts.length) out.push({ role: 'user', content: parts });
  }
  return out;
}

export function createBrowserModelGateway(deps: GatewayDeps): BrowserModelGateway {
  const reserve = deps.reserve ?? reserveProviderBudget; const settle = deps.settle ?? settleProviderBudget; const release = deps.release ?? finishFailedProviderReservation;
  const makeClient = deps.client ?? (() => {
    const e = resolveEndpoint(deps.modelId);
    const c = new OpenAI({ apiKey: e.apiKey, baseURL: e.baseUrl, timeout: 120_000, maxRetries: 0, defaultHeaders: e.defaultHeaders });
    return { model: e.apiModel, create: (body, opts) => c.chat.completions.create(body as never, { signal: opts.signal }) };
  });
  const seq = new Map<string, number>();

  return {
    async generate(raw, { job, remainingMicros, signal }) {
      const p = raw as StagehandParams;
      if (!p || !Array.isArray(p.messages) || p.messages.length === 0) throw new BrowserModelError('MODEL_REQUEST_INVALID', 'no messages');
      const messages = toOpenAiMessages(p);
      const requestText = JSON.stringify(messages);
      if (requestText.length > MAX_REQUEST_CHARS) throw new BrowserModelError('MODEL_REQUEST_INVALID', 'request too large');
      const estimatedInputTokens = Math.ceil(requestText.length / 3);

      // the largest answer that still fits the remaining allowance, after the input
      let maxOut = Math.min(deps.maxOutputTokens ?? 4_096, 8_192);
      while (maxOut >= 64 && estimateProviderReservationMicroUsd({ modelId: deps.modelId, estimatedInputTokens, maximumOutputTokens: maxOut }) > remainingMicros) maxOut = Math.floor(maxOut / 2);
      if (maxOut < 64) throw new BrowserModelError('MODEL_BUDGET_EXHAUSTED', 'the job model allowance cannot cover this call');

      const jobKey = `${job.tenantId}|${job.runId}|${job.taskId}|${job.attempt}`;
      const n = (seq.get(jobKey) ?? 0) + 1; seq.set(jobKey, n);
      const reservation: ProviderReservation = await reserve({ userId: job.userId, modelId: deps.modelId, estimatedInputTokens, maximumOutputTokens: maxOut, purpose: 'daily_work', idempotencyKey: deterministicUuid(['browser-ai', jobKey, n]) });

      let completion: any;
      const client = makeClient();
      try {
        const structured = p.responseFormat?.type === 'json_schema' ? p.responseFormat : undefined;
        completion = await client.create({
          model: client.model, messages, max_tokens: maxOut, ...(p.temperature !== undefined ? { temperature: p.temperature } : {}), ...(p.stopSequences?.length ? { stop: p.stopSequences } : {}),
          ...(structured ? { response_format: { type: 'json_schema', json_schema: { name: structured.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'result', schema: structured.schema, strict: false } } } : {}),
          ...(p.tools?.length ? { tools: p.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema } })), ...(p.toolChoice?.mode ? { tool_choice: p.toolChoice.mode } : {}) } : {}),
        }, { signal });
      } catch (e) {
        await release({ userId: job.userId, reservation, error: e }).catch(() => undefined);
        throw new BrowserModelError('MODEL_FAILED', 'the model route failed');
      }

      const inputTokens = completion?.usage?.prompt_tokens; const outputTokens = completion?.usage?.completion_tokens;
      if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens)) {
        await release({ userId: job.userId, reservation, error: new Error('usage not reported') }).catch(() => undefined);
        throw new BrowserModelError('MODEL_USAGE_UNMEASURED', 'the provider did not report usage');
      }
      const reasoningTokens = completion?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      const costMicros = actualProviderCostMicroUsd({ modelId: deps.modelId, inputTokens, outputTokens: Math.max(0, outputTokens - reasoningTokens), reasoningTokens });
      await settle({ userId: job.userId, modelId: deps.modelId, reservation, result: { inputTokens, outputTokens: Math.max(0, outputTokens - reasoningTokens), reasoningTokens, providerRequestId: completion?.id } });

      const msg = completion?.choices?.[0]?.message ?? {};
      const usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
      let result: Record<string, unknown>;
      if (p.responseFormat?.type === 'json_schema') {
        let structuredContent: unknown;
        try { structuredContent = JSON.parse(String(msg.content ?? '')); } catch { throw new BrowserModelError('MODEL_FAILED', 'the model did not return valid JSON'); }
        result = { role: 'assistant', content: { type: 'text', text: String(msg.content) }, outputFormat: 'json_schema', structuredContent, usage, stopReason: completion?.choices?.[0]?.finish_reason };
      } else {
        const blocks: Block[] = [];
        if (msg.content) blocks.push({ type: 'text', text: String(msg.content) });
        for (const tc of msg.tool_calls ?? []) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { throw new BrowserModelError('MODEL_FAILED', 'the model returned invalid tool arguments'); }
          blocks.push({ type: 'tool_use', id: String(tc.id), name: String(tc.function?.name), input });
        }
        result = { role: 'assistant', content: blocks.length ? blocks : { type: 'text', text: '' }, outputFormat: 'text', usage, stopReason: completion?.choices?.[0]?.finish_reason };
      }
      return { result, inputTokens, outputTokens, costMicros };
    },
  };
}
