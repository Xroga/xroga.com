import { MODELS, ACTIVE_MODEL_IDS } from './models.js';
import { assertModelEnabled } from './providerPolicy.js';

const externalIds = new Set(ACTIVE_MODEL_IDS.map(id => MODELS[id].apiModel));
function denied(afterDispatch = false): never {
  throw Object.assign(new Error('Zurelay model, routing or receipt could not be verified.'),
    { code: 'MODEL_DESTINATION_DENIED', status: 400,
      ...(afterDispatch ? { type: 'xroga_model_redirect_denied_after_dispatch' } : {}) });
}

/** Data-only wire checks, shared by ordinary and direct SDK execution paths. */
export function validateZurelayRequest(body: unknown, expectedModel: string): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) denied();
  const value = body as Record<string, unknown>;
  const id = ACTIVE_MODEL_IDS.find(id => MODELS[id].apiModel === expectedModel);
  if (!id) denied();
  assertModelEnabled(id);
  if (!externalIds.has(expectedModel) || value.model !== expectedModel || 'models' in value
    || 'provider' in value || 'fallback' in value || 'routing' in value) denied();
  if (!Number.isSafeInteger(value.max_tokens) || Number(value.max_tokens) <= 0) denied();
  if ('n' in value && value.n !== 1) denied();
  // Claude cache writes have a separate surcharge and no verified Chat receipt
  // breakdown yet. Do not request them or assume they are ordinary input.
  const records = (items:unknown):Record<string,unknown>[] => Array.isArray(items)
    ? items.filter((v):v is Record<string,unknown> => Boolean(v) && typeof v==='object' && !Array.isArray(v)) : [];
  if ('cache_control' in value || records(value.tools).some(tool=>'cache_control' in tool)
    || records(value.messages).some(message=>'cache_control' in message || records(message.content).some(part=>'cache_control' in part))) denied();
  if (expectedModel === 'claude-sonnet-5-5' &&
    (('temperature' in value && value.temperature !== 1) || ('top_p' in value && value.top_p !== 1)
      || ('tool_choice' in value && !['auto', 'none'].includes(String(value.tool_choice))))) denied();
  if (value.stream === true && (value.stream_options as { include_usage?: unknown })?.include_usage !== true) denied();
}

export function validateZurelayUsage(usage: unknown): void {
  const u = usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } } | null;
  if (!u || ![u.prompt_tokens, u.completion_tokens, u.total_tokens].every(n => Number.isSafeInteger(n) && Number(n) >= 0)
    || u.total_tokens !== Number(u.prompt_tokens) + Number(u.completion_tokens)) denied(true);
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0, reasoning = u.completion_tokens_details?.reasoning_tokens ?? 0;
  if (![cached,reasoning].every(n => Number.isSafeInteger(n) && n >= 0)
    || cached > Number(u.prompt_tokens) || reasoning > Number(u.completion_tokens)) denied(true);
  // An unexpected cache write cannot be settled at the ordinary input rate.
  const details = u.prompt_tokens_details as Record<string,unknown> | undefined;
  if (['cache_creation_input_tokens','cache_write_tokens'].some(key=>key in u && (u as Record<string,unknown>)[key] !== 0
    || details && key in details && details[key] !== 0)) denied(true);
}

/** Inspect before the SDK can publish text or tools. A failure follows provider
 * bytes and therefore retains an unknown-cost reservation, never a free retry. */
export async function verifyZurelayResponse(response: Response, apiModel: string, streaming: boolean): Promise<Response> {
  if (!response.ok) return response;
  const trace = response.headers.get('x-request-id');
  if (!trace || !/^[A-Za-z0-9_.:/-]{1,200}$/.test(trace)
    || response.headers.get('x-zurelay-model') !== apiModel || response.headers.has('x-zurelay-routed-from')) denied(true);
  const stopped = response.headers.get('x-zurelay-stopped');
  if (!streaming) {
    const body = await response.clone().json() as { model?: string; usage?: unknown; choices?: { index?:number;finish_reason?: string }[] };
    if (body.model !== apiModel || !Array.isArray(body.choices) || body.choices.length!==1
      ||body.choices[0].index!==undefined&&body.choices[0].index!==0) denied(true);
    validateZurelayUsage(body.usage);
    if (stopped && stopped !== 'false' && body.choices?.some(c => c.finish_reason === 'stop')) denied(true);
    return response;
  }
  if (!response.body) denied(true);
  let buffer = '', usageSeen = false, done = false, finishSeen = false;
  const decoder = new TextDecoder();
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') { if (done || !usageSeen || !finishSeen) denied(true); done = true; return; }
    if (done) denied(true);
    let chunk: { model?: string; error?: unknown; usage?: unknown; choices?: {index?:number;delta?:{content?:unknown;tool_calls?:unknown}; finish_reason?: string | null }[] };
    try { chunk=JSON.parse(payload); } catch { denied(true); }
    if (chunk.error || chunk.model !== apiModel) denied(true);
    const choices=chunk.choices??[];
    if(!Array.isArray(choices)||choices.length>1||choices.some(c=>c.index!==undefined&&c.index!==0))denied(true);
    if(finishSeen&&choices.some(c=>c.finish_reason||c.delta?.content||c.delta?.tool_calls))denied(true);
    if (chunk.usage) {
      if(usageSeen||(!finishSeen&&!choices.some(c=>c.finish_reason)))denied(true);
      validateZurelayUsage(chunk.usage); usageSeen = true;
    }
    for (const choice of chunk.choices ?? []) if (choice.finish_reason) {
      finishSeen = true;
      if (stopped && stopped !== 'false' && choice.finish_reason === 'stop') denied(true);
    }
  };
  const checked = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      if (buffer.length > 1_000_000) denied(true);
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, end).replace(/\r$/, '')); buffer = buffer.slice(end + 1); }
      controller.enqueue(bytes);
    },
    flush() {
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer.replace(/\r$/, ''));
      if (!usageSeen || !finishSeen || !done) denied(true);
    },
  }));
  return new Response(checked, { status: response.status, statusText: response.statusText, headers: response.headers });
}
