import { generateFalStyleTransfer } from '../../../lib/falStyleTransfer.js';
import { generateFalImage } from '../../../lib/fal.js';
import { generateImageFlux } from '../../../lib/replicate.js';
import { isValidImageResult } from '../imageGen.js';

export const STYLE_VARIANTS = [
  {
    label: 'Modern',
    provider: 'fal-modern',
    suffix: 'modern clean aesthetic, professional studio lighting, sharp contemporary look, 4k',
    strength: 0.68,
  },
  {
    label: 'Cinematic',
    provider: 'fal-cinematic',
    suffix: 'cinematic film still, dramatic lighting, shallow depth of field, blockbuster quality',
    strength: 0.74,
  },
  {
    label: 'Illustration',
    provider: 'fal-illustration',
    suffix: 'stylized digital illustration, vibrant trending art style, polished concept art',
    strength: 0.78,
  },
  {
    label: 'Artistic',
    provider: 'fal-artistic',
    suffix: 'artistic painterly style, creative modern composition, gallery-quality fine art',
    strength: 0.8,
  },
] as const;

export const VARIANT_COUNT = 4;

export function extractSourceImageUrl(
  prompt: string,
  attachmentUrl?: string
): string | undefined {
  if (attachmentUrl && isValidImageResult(attachmentUrl)) return attachmentUrl;

  const patterns = [
    /\[Image(?:\s+Edit)?\][^\n]*?:\s*(https?:\/\/\S+|data:image\/\S+)/i,
    /(?:source|from)\s+image:\s*(https?:\/\/\S+|data:image\/\S+)/i,
    /(https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?)/i,
    /(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1] && isValidImageResult(match[1])) return match[1];
  }

  return undefined;
}

export function extractStyleInstructions(prompt: string): string {
  const cleaned = prompt
    .replace(/\[Image(?:\s+Edit)?\][^\n]*/gi, '')
    .replace(/(?:source|from)\s+image:\s*\S+/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/data:image\/\S+/g, '')
    .trim();

  if (cleaned.length > 8) return cleaned;

  return 'Transform this image with a fresh modern professional look while keeping the same subject';
}

async function runStyleVariant(
  sourceUrl: string,
  basePrompt: string,
  variant: (typeof STYLE_VARIANTS)[number]
): Promise<string> {
  const fullPrompt = `${basePrompt}. ${variant.suffix}. Family-safe, modest, fully clothed, no nudity.`;

  try {
    return await generateFalStyleTransfer(sourceUrl, fullPrompt, variant.strength);
  } catch (falErr) {
    console.warn(`[StyleTransfer] Fal ${variant.label} failed:`, (falErr as Error).message);
  }

  try {
    return await generateFalImage(`${fullPrompt} — based on uploaded reference photo composition`);
  } catch {
    /* try replicate */
  }

  return generateImageFlux(fullPrompt);
}

export async function generateStyleVariants(
  sourceImageUrl: string,
  userPrompt: string,
  onVariant?: (index: number, label: string) => void
): Promise<Array<{ imageUrl: string; provider: string; variantLabel: string }>> {
  const stylePrompt = extractStyleInstructions(userPrompt);
  const results: Array<{ imageUrl: string; provider: string; variantLabel: string }> = [];

  const settled = await Promise.allSettled(
    STYLE_VARIANTS.map(async (variant, index) => {
      onVariant?.(index, variant.label);
      const imageUrl = await runStyleVariant(sourceImageUrl, stylePrompt, variant);
      if (!isValidImageResult(imageUrl)) throw new Error('Invalid style transfer URL');
      return { imageUrl, provider: variant.provider, variantLabel: variant.label };
    })
  );

  for (const r of settled) {
    if (r.status === 'fulfilled') results.push(r.value);
  }

  return results;
}
