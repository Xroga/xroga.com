/**
 * Public execution payloads expose one product identity: Black Hole ∞.
 * Routing metadata remains available to internal telemetry and persisted run
 * records, but is removed at HTTP/SSE serialization boundaries.
 */
const INTERNAL_IDENTITY = /\b(?:kimi(?:\s+k?\d+(?:\.\d+)?)?|moonshot|deepseek(?:[-\s](?:v?\d+(?:\.\d+)*|r\d+|coder))?|gemini(?:[-\s](?:\d+(?:\.\d+)*|pro|flash)(?:[-\s][a-z0-9.]+)?)?|glm(?:[-\s]\d+(?:\.\d+)*)?|claude(?:[-\s](?:\d+(?:\.\d+)*|opus|sonnet|haiku)(?:[-\s][a-z0-9.]+)?)?|gpt(?:[-\s]\d+(?:\.\d+)*(?:[-\s][a-z0-9.]+)?)?|openai|anthropic|openrouter|groq)\b/gi;

const INTERNAL_KEYS = new Set([
  'provider',
  'providerid',
  'providerused',
  'providersused',
  'model',
  'modelid',
  'route',
  'deepeekpeak',
  'deepseekpeak',
]);

export function publicAiText(value: string): string {
  return value.replace(INTERNAL_IDENTITY, 'Black Hole ∞');
}

export function publicAiPayload<T>(value: T): T {
  if (typeof value === 'string') return publicAiText(value) as T;
  if (Array.isArray(value)) return value.map((item) => publicAiPayload(item)) as T;
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (INTERNAL_KEYS.has(key.toLowerCase())) continue;
    output[key] = publicAiPayload(item);
  }
  return output as T;
}
