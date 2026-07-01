/**
 * Image-to-video prompt pipeline — analyze uploaded frame, merge with user intent.
 * Groq/Gemini for simple; DeepSeek for complex motion descriptions.
 */

import { groqChat } from '../groq.js';
import { geminiGenerate } from '../gemini.js';
import { deepSeekChat } from '../deepseek.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { enhanceVideoPrompt, buildGenerationPrompt, type EnhancedVideoPrompt } from './videoPromptEnhancer.js';

export interface ImageToVideoPromptResult extends EnhancedVideoPrompt {
  imageDescription: string;
  motionPrompt: string;
  aspectHint?: '9:16' | '16:9' | '1:1';
  analyzerProvider: string;
}

const ANALYZER_SYSTEM = `You are Xroga Image Director. Analyze the reference image and user's animation request.

Return ONLY JSON:
{
  "imageDescription": "what is in the image — subject, pose, colors, style, background",
  "motionPrompt": "cinematic motion to apply while keeping the same subject identity from the reference frame",
  "lockedSubjects": ["main subject nouns from image"],
  "mustNotInclude": ["forbidden elements — never add nudity or wrong subjects"],
  "negativePrompt": "morphing, wrong character, extra limbs, blurry",
  "aspectHint": "9:16|16:9|1:1"
}

Rules:
- Preserve the uploaded image subject exactly (face, costume, colors, art style).
- If user gives no motion details, infer subtle cinematic motion (breathing, wind, camera push-in, energy aura).
- Family-safe only. No suggestive motion.`;

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  if (imageUrl.startsWith('data:image/')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], data: match[2] };
    throw new Error('Invalid data URL');
  }
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
  return { data: buffer.toString('base64'), mimeType };
}

function heuristicFromPrompt(userIntent: string, imageUrl: string): ImageToVideoPromptResult {
  const base = userIntent || 'Animate this image with cinematic motion';
  const enhanced = {
    userIntent: sanitizeVideoPrompt(base),
    renderPrompt: `${base}. Same subject as reference image, smooth cinematic animation, preserve identity and style from source frame.`,
    negativePrompt: 'wrong subject, morphing, warping, nudity, bikini, extra limbs',
    lockedSubjects: ['reference image subject'],
    mustNotInclude: ['nudity', 'bikini', 'wrong character'],
    enhancerProvider: 'heuristic',
  };
  return {
    ...enhanced,
    imageDescription: 'Reference image subject',
    motionPrompt: base,
    analyzerProvider: 'heuristic',
  };
}

function parseAnalyzerJson(
  raw: string,
  userIntent: string
): Omit<ImageToVideoPromptResult, 'renderPrompt' | 'enhancerProvider'> | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const data = JSON.parse(match[0]) as {
      imageDescription?: string;
      motionPrompt?: string;
      lockedSubjects?: string[];
      mustNotInclude?: string[];
      negativePrompt?: string;
      aspectHint?: string;
    };
    if (!data.imageDescription && !data.motionPrompt) return null;

    const locked = data.lockedSubjects?.filter(Boolean) ?? ['reference subject'];
    const aspect =
      data.aspectHint === '9:16' || data.aspectHint === '16:9' || data.aspectHint === '1:1'
        ? data.aspectHint
        : undefined;

    return {
      userIntent: sanitizeVideoPrompt(userIntent || data.motionPrompt || 'animate image'),
      imageDescription: data.imageDescription ?? 'Reference image',
      motionPrompt: data.motionPrompt ?? userIntent ?? 'subtle cinematic motion',
      lockedSubjects: locked,
      mustNotInclude: data.mustNotInclude ?? [],
      negativePrompt: data.negativePrompt ?? 'morphing, wrong subject, blurry',
      aspectHint: aspect,
      analyzerProvider: 'llm',
    };
  } catch {
    return null;
  }
}

async function analyzeWithGemini(
  imageUrl: string,
  userIntent: string
): Promise<ImageToVideoPromptResult | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const frame = await fetchImageAsBase64(imageUrl);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const userLine = userIntent.trim()
    ? `User animation request: ${userIntent}`
    : 'User wants: turn this image into a short cinematic video with natural motion.';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${ANALYZER_SYSTEM}\n\n${userLine}` },
            { inline_data: { mime_type: frame.mimeType, data: frame.data } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 512, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = parseAnalyzerJson(raw, userIntent);
  if (!parsed) return null;

  const renderPrompt = `${parsed.imageDescription}. ${parsed.motionPrompt}. Keep exact same subject, face, costume, and art style as reference image.`;
  return {
    ...parsed,
    renderPrompt,
    enhancerProvider: 'gemini-vision',
    analyzerProvider: 'gemini',
  };
}

async function refineWithLlm(
  partial: ImageToVideoPromptResult
): Promise<EnhancedVideoPrompt> {
  const complex = partial.motionPrompt.length > 100 || /\b(fight|fly|power|explosion|chase|transform)\b/i.test(partial.motionPrompt);
  const combined = `${partial.imageDescription}. ${partial.motionPrompt}`;

  try {
    if (complex && process.env.DEEPSEEK_API_KEY) {
      const raw = await deepSeekChat(
        [
          {
            role: 'system',
            content:
              'Polish this image-to-video render prompt for OSS video models. Return ONLY JSON: {"renderPrompt":"","negativePrompt":"","lockedSubjects":[],"mustNotInclude":[]}',
          },
          { role: 'user', content: combined },
        ],
        { maxTokens: 512 }
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const data = JSON.parse(match[0]) as EnhancedVideoPrompt;
        if (data.renderPrompt) return { ...data, enhancerProvider: 'deepseek', userIntent: partial.userIntent };
      }
    }
    if (process.env.GROQ_API_KEY) {
      const raw = await groqChat(
        [
          {
            role: 'system',
            content:
              'Polish image-to-video prompt. Return ONLY JSON: {"renderPrompt":"","negativePrompt":"","lockedSubjects":[],"mustNotInclude":[]}',
          },
          { role: 'user', content: combined },
        ],
        { maxTokens: 512 }
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const data = JSON.parse(match[0]) as EnhancedVideoPrompt;
        if (data.renderPrompt) return { ...data, enhancerProvider: 'groq', userIntent: partial.userIntent };
      }
    }
  } catch {
    /* fall through */
  }

  return enhanceVideoPrompt(combined);
}

/**
 * Step 1: Vision-analyze reference image.
 * Step 2: Merge with user text via Groq/DeepSeek/Gemini.
 * Step 3: Return locked render prompt for video AI + user keyframe URL.
 */
export async function buildImageToVideoPrompt(
  imageUrl: string,
  userPrompt: string
): Promise<ImageToVideoPromptResult> {
  const userIntent = sanitizeVideoPrompt(userPrompt) || 'Animate this image with cinematic motion';

  let analyzed: ImageToVideoPromptResult | null = null;
  try {
    analyzed = await analyzeWithGemini(imageUrl, userIntent);
  } catch (err) {
    console.warn('[ImageToVideoPrompt] Gemini analyze failed:', (err as Error).message);
  }

  if (!analyzed) {
    analyzed = heuristicFromPrompt(userIntent, imageUrl);
  }

  const refined = await refineWithLlm(analyzed);
  const renderPrompt = `${refined.renderPrompt}. Preserve reference image subject identity exactly.`;

  return {
    ...refined,
    renderPrompt,
    imageDescription: analyzed.imageDescription,
    motionPrompt: analyzed.motionPrompt,
    aspectHint: analyzed.aspectHint,
    analyzerProvider: analyzed.analyzerProvider,
    lockedSubjects: refined.lockedSubjects.length ? refined.lockedSubjects : analyzed.lockedSubjects,
    mustNotInclude: [...new Set([...(refined.mustNotInclude ?? []), ...(analyzed.mustNotInclude ?? [])])],
  };
}

export function buildImageToVideoGenerationPrompt(result: ImageToVideoPromptResult): string {
  return buildGenerationPrompt({
    userIntent: result.userIntent,
    renderPrompt: result.renderPrompt,
    negativePrompt: result.negativePrompt,
    lockedSubjects: result.lockedSubjects,
    mustNotInclude: result.mustNotInclude,
    enhancerProvider: result.enhancerProvider,
  });
}
