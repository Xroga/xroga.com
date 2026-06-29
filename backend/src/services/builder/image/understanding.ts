import { groqChat } from '../../../lib/groq.js';

export interface ImageQueryIntent {
  subject: string;
  action?: string;
  environment?: string;
  style: string;
  quality: 'standard' | 'premium';
  resolution?: string;
  rawQuery: string;
}

const CLASSIFY_SYSTEM = `You classify image generation requests. Respond ONLY with valid JSON:
{"subject":"main subject","action":"optional action","environment":"setting/scene","style":"art style keywords","quality":"standard|premium","resolution":"optional e.g. 4K"}

Rules:
- quality=premium when user asks for photorealistic, cinematic, hero, masterpiece, 4K/8K, ultra, professional, or similar.
- Otherwise quality=standard.
- Extract concise fields from the user query.`;

function parseIntentJson(raw: string, query: string): ImageQueryIntent {
  const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<ImageQueryIntent>;
    return {
      subject: parsed.subject?.trim() || query.slice(0, 120),
      action: parsed.action?.trim(),
      environment: parsed.environment?.trim(),
      style: parsed.style?.trim() || 'detailed, high quality',
      quality: parsed.quality === 'premium' ? 'premium' : 'standard',
      resolution: parsed.resolution?.trim(),
      rawQuery: query,
    };
  } catch {
    return fallbackIntent(query);
  }
}

function fallbackIntent(query: string): ImageQueryIntent {
  const lower = query.toLowerCase();
  const premium =
    /\b(photorealistic|cinematic|hero|masterpiece|4k|8k|ultra|professional|studio quality)\b/.test(lower);
  return {
    subject: query.slice(0, 120),
    style: 'detailed, high quality',
    quality: premium ? 'premium' : 'standard',
    rawQuery: query,
  };
}

/** Step A: Groq classifies the user's image request (cheap, fast). */
export async function classifyImageQuery(userQuery: string): Promise<ImageQueryIntent> {
  const query = userQuery.trim();
  if (!query) {
    return { subject: 'image', style: 'detailed', quality: 'standard', rawQuery: query };
  }

  if (!process.env.GROQ_API_KEY) {
    return fallbackIntent(query);
  }

  try {
    const raw = await groqChat(
      [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: query },
      ],
      { model: 'llama-3.3-70b-versatile', maxTokens: 256 }
    );
    return parseIntentJson(raw, query);
  } catch (err) {
    console.warn('[ImageUnderstanding] Groq classify failed:', (err as Error).message);
    return fallbackIntent(query);
  }
}
