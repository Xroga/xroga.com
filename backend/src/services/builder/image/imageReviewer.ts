import { deepSeekChat } from '../../../lib/deepseek.js';
import { groqChat } from '../../../lib/groq.js';

export interface ImageCandidate {
  provider: string;
  imageUrl: string;
}

/** Cheap reviewer picks the best image when multi-model voting runs (premium). */
export async function pickBestImage(
  prompt: string,
  candidates: ImageCandidate[]
): Promise<ImageCandidate> {
  if (candidates.length === 1) return candidates[0]!;

  const listing = candidates
    .map((c, i) => `${i + 1}. provider=${c.provider} url=${c.imageUrl}`)
    .join('\n');

  const system = `You pick the best AI-generated image for a prompt. Respond ONLY with JSON: {"choice":1} where choice is the 1-based index of the best candidate based on expected visual quality, composition, and prompt adherence.`;

  try {
    let raw = '';
    if (process.env.DEEPSEEK_API_KEY) {
      raw = await deepSeekChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `Prompt: ${prompt}\n\nCandidates:\n${listing}` },
        ],
        { maxTokens: 64 }
      );
    } else if (process.env.GROQ_API_KEY) {
      raw = await groqChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `Prompt: ${prompt}\n\nCandidates:\n${listing}` },
        ],
        { maxTokens: 64 }
      );
    }

    if (raw) {
      const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleaned) as { choice?: number };
      const idx = (parsed.choice ?? 1) - 1;
      if (idx >= 0 && idx < candidates.length) return candidates[idx]!;
    }
  } catch (err) {
    console.warn('[ImageReviewer] review failed:', (err as Error).message);
  }

  return candidates[0]!;
}
