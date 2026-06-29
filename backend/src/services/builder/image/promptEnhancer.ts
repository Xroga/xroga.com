import { deepSeekChat } from '../../../lib/deepseek.js';
import { groqChat } from '../../../lib/groq.js';
import { geminiGenerate } from '../../../lib/gemini.js';
import type { ImageQueryIntent } from './understanding.js';

export interface EnhancedImagePrompt {
  prompt: string;
  negativePrompt: string;
  styleTags: string[];
}

const NEGATIVE_DEFAULT =
  'blurry, low quality, distorted, deformed, watermark, text overlay, ugly, duplicate, mutilated, disfigured, bad anatomy, extra limbs';

const ENHANCE_SYSTEM = `You are an expert image prompt engineer. Given structured intent JSON, output ONE detailed image generation prompt (80-200 words).
Include: subject, action, environment, lighting, composition, camera angle, art style, quality tags.
Do NOT wrap in quotes. Do NOT use markdown. Output only the prompt text.`;

function buildIntentPayload(intent: ImageQueryIntent): string {
  return JSON.stringify({
    subject: intent.subject,
    action: intent.action,
    environment: intent.environment,
    style: intent.style,
    resolution: intent.resolution ?? 'high quality',
    quality: intent.quality,
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

/** Step B: DeepSeek enhances prompt (Groq/Gemini Flash as fallbacks — no premium LLMs). */
export async function enhanceImagePrompt(intent: ImageQueryIntent): Promise<EnhancedImagePrompt> {
  const styleTags = deriveStyleTags(intent);
  let prompt = '';

  const enhancers: Array<() => Promise<string>> = [];
  if (process.env.DEEPSEEK_API_KEY) enhancers.push(() => enhanceWithDeepSeek(intent));
  if (process.env.GROQ_API_KEY) enhancers.push(() => enhanceWithGroq(intent));
  if (process.env.GEMINI_API_KEY) enhancers.push(() => enhanceWithGeminiFlash(intent));

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

  return {
    prompt,
    negativePrompt: NEGATIVE_DEFAULT,
    styleTags,
  };
}
