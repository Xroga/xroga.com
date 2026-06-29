import { deepSeekChat } from '../../../lib/deepseek.js';
import { groqChat } from '../../../lib/groq.js';

const DEFAULT_FOLLOW_UPS = [
  'Make it 4K',
  'Change style to anime',
  'Generate variations',
  'Remove background',
  'Upscale for print',
];

/** Generate contextual follow-up suggestions using cheap models only. */
export async function generateImageFollowUps(
  prompt: string,
  provider: string
): Promise<{ followUps: string[]; pros: string[]; cons: string[] }> {
  const system = `For an AI-generated image, respond ONLY with JSON:
{"followUps":["suggestion1","suggestion2","suggestion3"],"pros":["pro1","pro2"],"cons":["con1"]}
followUps: actionable edit/variation prompts. pros/cons: brief quality notes.`;

  try {
    let raw = '';
    if (process.env.DEEPSEEK_API_KEY) {
      raw = await deepSeekChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `Prompt: ${prompt}\nProvider: ${provider}` },
        ],
        { maxTokens: 256 }
      );
    } else if (process.env.GROQ_API_KEY) {
      raw = await groqChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: `Prompt: ${prompt}\nProvider: ${provider}` },
        ],
        { maxTokens: 256 }
      );
    }

    if (raw) {
      const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleaned) as {
        followUps?: string[];
        pros?: string[];
        cons?: string[];
      };
      return {
        followUps: parsed.followUps?.slice(0, 4) ?? DEFAULT_FOLLOW_UPS,
        pros: parsed.pros?.slice(0, 3) ?? ['High detail', 'Unique composition'],
        cons: parsed.cons?.slice(0, 2) ?? ['May need refinement for specific use cases'],
      };
    }
  } catch (err) {
    console.warn('[ImageFollowUps] generation failed:', (err as Error).message);
  }

  return {
    followUps: DEFAULT_FOLLOW_UPS,
    pros: ['Creative interpretation', 'Fast generation'],
    cons: ['Review before commercial use if brand-critical'],
  };
}
