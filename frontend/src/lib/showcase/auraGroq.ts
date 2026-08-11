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
  const persona = typeof body.persona === 'string' && body.persona in PERSONAS
    ? (body.persona as keyof typeof PERSONAS)
    : 'balanced';
  const temperature = Math.min(1.5, Math.max(0, Number(body.temperature) || 0.7));
  const maxTokens = Math.min(3000, Math.max(400, Math.round(Number(body.maxTokens) || 1400)));

  return { messages, model, persona, temperature, maxTokens };
}

export async function requestGroqStream(input: AuraChatInput, signal: AbortSignal) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false as const, status: 503, message: 'Live AI is temporarily unavailable.' };

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages: [
        { role: 'system', content: `You are Aura, an AI assistant in an Xroga AI public product showcase. ${PERSONAS[input.persona]}` },
        ...input.messages,
      ],
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    return {
      ok: false as const,
      status: response.status === 429 ? 429 : 502,
      message: response.status === 429 ? 'The public demo is busy. Please try again shortly.' : 'The AI provider could not complete this request.',
    };
  }

  return { ok: true as const, body: response.body };
}
