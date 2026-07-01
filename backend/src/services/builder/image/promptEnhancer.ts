import { deepSeekChat } from '../../../lib/deepseek.js';
import { groqChat } from '../../../lib/groq.js';
import { geminiGenerate } from '../../../lib/gemini.js';
import type { ImageQueryIntent } from './understanding.js';
import { styleVibePromptSuffix, contentTypePromptSuffix, type ImageStyleVibe, type ImageContentType } from './imageIntent.js';

export interface EnhancedImagePrompt {
  prompt: string;
  negativePrompt: string;
  styleTags: string[];
}

const NEGATIVE_DEFAULT =
  'blurry, low quality, distorted, deformed, watermark, ugly, duplicate, mutilated, disfigured, bad anatomy, extra limbs, extra fingers, extra hands, extra feet, missing fingers, fused limbs, malformed hands, malformed feet, cropped, out of frame, text overlay, nsfw, nude, bikini, lingerie, suggestive pose';

const ENHANCE_SYSTEM = `You are an expert image prompt engineer. Given structured intent JSON, output ONE detailed image generation prompt (60-150 words).
Include: subject, action, environment, lighting, composition, camera angle, art style, quality tags.
Match the styleVibe (3d, pixel, minecraft, cartoon, anime, logo, photorealistic) and contentType (thumbnail, logo, avatar, og, story).
REQUIREMENTS: family-safe, modest clothing, correct anatomy (two hands, two feet, five fingers each), photorealistic when requested, no suggestive content.
Do NOT wrap in quotes. Do NOT use markdown. Output only the prompt text.`;

const SLOT_ANGLE_HINTS = [
  'Cinematic wide-angle establishing shot, dramatic golden-hour lighting, film still quality, depth of field',
  'Close-up hero portrait, shallow depth of field, studio rim lighting, ultra-sharp facial detail',
  'Dynamic three-quarter action angle, vibrant modern color grading, editorial magazine style',
  'Unique artistic perspective, minimalist composition, trending aesthetic, creative camera tilt',
] as const;

function buildIntentPayload(intent: ImageQueryIntent): string {
  return JSON.stringify({
    subject: intent.subject,
    action: intent.action,
    environment: intent.environment,
    style: intent.style,
    resolution: intent.resolution ?? 'high quality',
    quality: intent.quality,
    aspectFormat: intent.aspectFormat,
    contentType: intent.contentType,
    styleVibe: intent.styleVibe,
  });
}

function injectStyle(prompt: string, styleTags: string[]): string {
  const unique = [...new Set(styleTags.filter(Boolean))];
  if (!unique.length) return prompt;
  return `${prompt}, ${unique.join(', ')}`;
}

async function enhanceWithDeepSeek(intent: ImageQueryIntent): Promise<string> {
  return deepSeekChat(
    [
      { role: 'system', content: ENHANCE_SYSTEM },
      { role: 'user', content: buildIntentPayload(intent) },
    ],
    { model: 'deepseek-chat', maxTokens: 512 }
  );
}

async function enhanceWithGroq(intent: ImageQueryIntent): Promise<string> {
  return groqChat(
    [
      { role: 'system', content: ENHANCE_SYSTEM },
      { role: 'user', content: buildIntentPayload(intent) },
    ],
    { maxTokens: 512 }
  );
}

async function enhanceWithGeminiFlash(intent: ImageQueryIntent): Promise<string> {
  return geminiGenerate(ENHANCE_SYSTEM, buildIntentPayload(intent), {
    model: 'gemini-2.0-flash',
    maxTokens: 512,
  });
}

function deriveStyleTags(intent: ImageQueryIntent): string[] {
  const tags = intent.style.split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
  if (intent.quality === 'premium') {
    tags.push('cinematic', 'hyperrealistic', 'masterpiece', 'trending on ArtStation');
  }
  return tags;
}

/** Step B: Gemini/Groq enhance prompt — Gemini preferred for detail, Groq as fast fallback. */
export async function enhanceImagePrompt(intent: ImageQueryIntent): Promise<EnhancedImagePrompt> {
  const styleTags = deriveStyleTags(intent);
  let prompt = '';

  const enhancers: Array<() => Promise<string>> = [];
  if (process.env.GEMINI_API_KEY) enhancers.push(() => enhanceWithGeminiFlash(intent));
  if (process.env.GROQ_API_KEY) enhancers.push(() => enhanceWithGroq(intent));
  if (process.env.DEEPSEEK_API_KEY) enhancers.push(() => enhanceWithDeepSeek(intent));

  for (const run of enhancers) {
    try {
      const result = (await run()).trim();
      if (result.length > 20) {
        prompt = result;
        break;
      }
    } catch (err) {
      console.warn('[PromptEnhancer] enhancer failed:', (err as Error).message);
    }
  }

  if (!prompt) {
    const parts = [intent.subject, intent.action, intent.environment, intent.style].filter(Boolean);
    prompt = parts.join(', ');
  }

  prompt = injectStyle(prompt, styleTags);

  const vibe = (intent.styleVibe as ImageStyleVibe) || 'general';
  const content = (intent.contentType as ImageContentType) || 'general';
  if (vibe !== 'general') prompt += `. ${styleVibePromptSuffix(vibe)}`;
  if (content !== 'general') prompt += `. ${contentTypePromptSuffix(content)}`;

  return {
    prompt,
    negativePrompt: NEGATIVE_DEFAULT,
    styleTags,
  };
}

const MULTI_SLOT_SYSTEM = `You are an expert image prompt engineer. Given a base image intent, output exactly 4 DIFFERENT prompts as JSON array.
Each prompt must vary: camera angle, lighting, composition, and artistic vibe. All must be family-safe and modest.
Format: ["prompt1","prompt2","prompt3","prompt4"] — no markdown, no extra text.`;

/** Build unique per-provider prompts so each variant looks different. */
export async function buildPerSlotPrompts(
  intent: ImageQueryIntent,
  basePrompt: string,
  slotCount = 4
): Promise<string[]> {
  const payload = JSON.stringify({
    subject: intent.subject,
    style: intent.style,
    styleVibe: intent.styleVibe,
    contentType: intent.contentType,
    basePrompt: basePrompt.slice(0, 400),
  });

  const llmBuilders: Array<() => Promise<string[]>> = [];
  if (process.env.GEMINI_API_KEY) {
    llmBuilders.push(async () => {
      const raw = await geminiGenerate(MULTI_SLOT_SYSTEM, payload, { model: 'gemini-2.0-flash', maxTokens: 900 });
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('no json array');
      const parsed = JSON.parse(match[0]) as string[];
      if (!Array.isArray(parsed) || parsed.length < 2) throw new Error('invalid array');
      return parsed.map((p) => String(p).trim()).filter((p) => p.length > 20);
    });
  }
  if (process.env.GROQ_API_KEY) {
    llmBuilders.push(async () => {
      const raw = await groqChat(
        [
          { role: 'system', content: MULTI_SLOT_SYSTEM },
          { role: 'user', content: payload },
        ],
        { maxTokens: 900 }
      );
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('no json array');
      const parsed = JSON.parse(match[0]) as string[];
      if (!Array.isArray(parsed) || parsed.length < 2) throw new Error('invalid array');
      return parsed.map((p) => String(p).trim()).filter((p) => p.length > 20);
    });
  }

  for (const run of llmBuilders) {
    try {
      const prompts = await run();
      if (prompts.length >= 2) {
        while (prompts.length < slotCount) {
          prompts.push(`${prompts[prompts.length % prompts.length]}. ${SLOT_ANGLE_HINTS[prompts.length % SLOT_ANGLE_HINTS.length]}`);
        }
        return prompts.slice(0, slotCount);
      }
    } catch (err) {
      console.warn('[PromptEnhancer] multi-slot failed:', (err as Error).message);
    }
  }

  return SLOT_ANGLE_HINTS.map(
    (hint, i) => `${basePrompt}. ${hint}. Variant ${i + 1}, unique composition and lighting`
  );
}
