import { getSecret } from '../../config/envSecrets.js';

export async function transcribeWithGroqWhisper(audio: Buffer, mimeType = 'audio/webm'): Promise<string> {
  const apiKey = getSecret('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('language', 'en');
  // Bias Whisper toward clear conversational English (improves understanding)
  form.append(
    'prompt',
    'XROGA voice conversation. Clear speech about business, technology, advice, and questions.'
  );

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (res.status === 429) {
    throw new RateLimitError('Groq Whisper rate limit exceeded');
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper STT failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? '';
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
