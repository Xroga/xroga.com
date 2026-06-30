import { groqChat } from '../../../lib/groq.js';

export interface ImageQueryIntent {
  subject: string;
  action?: string;
  environment?: string;
  style: string;
  quality: 'standard' | 'premium';
  resolution?: string;
  rawQuery: string;
  aspectFormat?: string;
  contentType?: string;
  styleVibe?: string;
}

const CLASSIFY_SYSTEM = `You classify image generation requests. Respond ONLY with valid JSON:
{"subject":"main subject (short)","action":"optional action","environment":"setting/scene","style":"art style keywords","quality":"standard|premium","resolution":"optional","aspectFormat":"1:1|4:5|16:9|9:16|3:4|4:3","contentType":"thumbnail|logo|avatar|og|post|story|banner|wallpaper|general","styleVibe":"photorealistic|3d|pixel|minecraft|cartoon|anime|logo|illustration|general"}

Rules:
- quality=premium for photorealistic, cinematic, 4K/8K, masterpiece, professional.
- aspectFormat: thumbnail/og/banner/youtube=16:9, story/tiktok/mobile=9:16, logo/avatar=1:1, instagram post=1:1 or 4:5.
- contentType: detect logo, avatar, thumbnail, og, story, banner, wallpaper, post from user words.
- styleVibe: detect 3d, pixel, minecraft, cartoon, anime, logo, photorealistic from user words.
- Keep subject under 12 words.`;

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
      aspectFormat: parsed.aspectFormat?.trim(),
      contentType: parsed.contentType?.trim(),
      styleVibe: parsed.styleVibe?.trim(),
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
