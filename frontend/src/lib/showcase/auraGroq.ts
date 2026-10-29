import {withGuestProviderBudget} from '../../../../backend/src/ai/guestProviderBudget.js';
import {containsCredentialSecretText} from '../../../../backend/src/security/egress/dataClassification.js';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const AURA_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;

export type AuraModel = (typeof AURA_MODELS)[number];
export type AuraRole = 'user' | 'assistant';

export interface AuraMessage {
  role: AuraRole;
  content: string;
}

const PERSONAS = {
  balanced: 'Be helpful, clear, accurate, and concise. Use structure when it improves the answer.',
  concise: 'Give a direct, compact answer. Avoid filler and long preambles.',
  creative: 'Be imaginative and energetic while remaining useful and truthful.',
  developer: 'Act as a senior software engineer. Prefer robust, practical solutions and explain tradeoffs briefly.',
} as const;

export interface AuraChatInput {
  messages: AuraMessage[];
  model: AuraModel;
  persona: keyof typeof PERSONAS;
  temperature: number;
  maxTokens: number;
}

export function parseAuraInput(value: unknown): AuraChatInput | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.messages)) return null;

  const messages = body.messages
    .slice(-24)
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const item = message as Record<string, unknown>;
      if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') return null;
      const content = item.content.trim().slice(0, 8000);
      return content ? { role: item.role, content } : null;
    })
    .filter((message): message is AuraMessage => Boolean(message));

  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;

  const model = AURA_MODELS.includes(body.model as AuraModel)
    ? (body.model as AuraModel)
    : 'llama-3.3-70b-versatile';
  const persona = typeof body.persona === 'string' && Object.hasOwn(PERSONAS, body.persona)
    ? (body.persona as keyof typeof PERSONAS)
    : 'balanced';
  const temperature = Math.min(1.5, Math.max(0, Number(body.temperature) || 0.7));
  const maxTokens = Math.min(3000, Math.max(400, Math.round(Number(body.maxTokens) || 1400)));

  return { messages, model, persona, temperature, maxTokens };
}

const unavailable = () => ({ok: false as const, status: 503, message: 'Live AI is temporarily unavailable.'});
function rejectResponse(): never { throw new Error('Invalid public inference response.'); }

export function auraAbortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Public inference cancelled.'), {name: 'AbortError'}));
    if (signal.aborted) { pending.catch(() => {}); abort(); return; }
    signal.addEventListener('abort', abort, {once: true});
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function readAuraBoundedText(body: ReadableStream<Uint8Array> | null, signal: AbortSignal, maximum: number) {
  if (!body) rejectResponse();
  const reader = body.getReader(), parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await auraAbortable(reader.read(), signal);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) rejectResponse();
      parts.push(part.value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const part of parts) { combined.set(part, offset); offset += part.byteLength; }
    return new TextDecoder('utf-8', {fatal: true}).decode(combined);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function checkedGroqResult(text: string, model: AuraModel) {
  let done = false, finished = false, id = '', content = '', usage: unknown;
  const frames = text.replace(/\r\n/g, '\n').split('\n\n');
  for (const frame of frames) {
    if (!frame.trim()) continue;
    if (done || frame.length > 262144) rejectResponse();
    const lines = frame.split('\n');
    if (lines.some(line => line && !line.startsWith('data:') && !line.startsWith(':'))) rejectResponse();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) continue;
    if (data === '[DONE]') { done = true; continue; }
    const chunk = JSON.parse(data);
    if (!chunk || typeof chunk !== 'object' || chunk.error || chunk.x_groq?.error
      || typeof chunk.id !== 'string' || !chunk.id || chunk.id.length > 256
      || chunk.model !== model || (id && chunk.id !== id)
      || !Array.isArray(chunk.choices) || chunk.choices.length > 1) rejectResponse();
    id = chunk.id;
    if (chunk.x_groq?.usage != null) {
      if (usage !== undefined) rejectResponse();
      usage = chunk.x_groq.usage;
    }
    for (const choice of chunk.choices) {
      if (finished || choice.index !== 0 || !choice.delta || typeof choice.delta !== 'object'
        || choice.delta.tool_calls || choice.delta.function_call) rejectResponse();
      if (choice.delta.role !== undefined && choice.delta.role !== 'assistant') rejectResponse();
      if (choice.delta.content != null) {
        if (typeof choice.delta.content !== 'string') rejectResponse();
        content += choice.delta.content;
      }
      if (choice.finish_reason != null) {
        if (!['stop', 'length'].includes(choice.finish_reason)) rejectResponse();
        finished = true;
      }
    }
  }
  if (!done || !finished || !id || !content.trim() || !usage || containsCredentialSecretText(content)) rejectResponse();
  return {content, usage};
}

/** This surface accepts manual anonymous conversation only. It never reads a
 * tenant repository, private upload, connected app, credential or tool output.
 * Use the same durable guest quota and lease as the canonical guest route.
 */
export async function requestGroqStream(input: AuraChatInput, clientSignal: AbortSignal, guest?: {sessionId: string; address: string}) {
  if (!guest) return unavailable();
  const parsed = parseAuraInput(input);
  if (!parsed) return unavailable();
  const body = JSON.stringify({
    model: parsed.model, stream: true, temperature: parsed.temperature,
    max_completion_tokens: parsed.maxTokens,
    messages: [
      {role: 'system', content: `You are Aura, an AI assistant in an Xroga AI public product showcase. ${PERSONAS[parsed.persona]}`},
      ...parsed.messages,
    ],
  });
  if (containsCredentialSecretText(body)) return unavailable();
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return unavailable();
  const signal = AbortSignal.any([clientSignal, AbortSignal.timeout(40000)]);
  const current = () => { if (signal.aborted || process.env.GROQ_API_KEY !== apiKey || containsCredentialSecretText(body)) rejectResponse(); };
  try {
    const admitted = await auraAbortable(withGuestProviderBudget(guest.sessionId, guest.address, Buffer.byteLength(body), parsed.maxTokens, signal, async guard => {
      current();
      await guard.consume();
      current();
      const response = await fetch(GROQ_CHAT_URL, {
        method: 'POST', redirect: 'manual', cache: 'no-store',
        headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream'},
        body, signal,
      });
      current();
      if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
        void response.body?.cancel().catch(() => {});
        return {ok: false as const, status: response.status === 429 ? 429 : 502, message: 'The AI provider could not complete this request.'};
      }
      const result = checkedGroqResult(await readAuraBoundedText(response.body, signal, 1048576), parsed.model);
      current();
      await guard.complete(result.usage);
      current();
      // No provider headers, debug metadata, tool instructions or unaccounted
      // partial content cross the publication boundary.
      const wire = `data: ${JSON.stringify({choices: [{delta: {content: result.content}}]})}\n\ndata: [DONE]\n\n`;
      return {ok: true as const, body: new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(new TextEncoder().encode(wire)); controller.close();}})};
    }), signal);
    current();
    return admitted;
  } catch {
    return unavailable();
  }
}
