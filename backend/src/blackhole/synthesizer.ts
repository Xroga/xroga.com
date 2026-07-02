import { BLACKHOLE_PERSONA } from '../prompts/blackholePrompts.js';
import { groqGenerate } from '../council/groqClient.js';
import { geminiGenerate } from '../lib/gemini.js';
import { deepSeekChat } from '../lib/deepseek.js';
import { getSecret } from '../config/envSecrets.js';
import type { CouncilLayer } from '../config/hybridConfig.js';

export type EmitIntent = 'greeting' | 'stem' | 'cultural' | 'general' | 'reserve';

export interface BlackHoleEmitResult {
  text: string;
  layer: CouncilLayer;
}

/** Strip common AI-isms before final polish */
export function deAiify(text: string): string {
  return text
    .replace(/\b(In conclusion|Furthermore|Moreover|It's worth noting that|Delve into|tapestry of)\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Black Hole V∞ — absorb Council or Reserve output and emit final XROGA persona.
 * Uses Groq for speed; Gemini/DeepSeek as fallback synthesizers.
 */
export async function blackHoleEmit(
  rawResponse: string,
  userInput: string,
  intent: EmitIntent,
  sourceLayer: 'elite' | 'reserve'
): Promise<BlackHoleEmitResult> {
  const cleaned = deAiify(rawResponse);
  if (!cleaned || cleaned.length < 20) {
    return { text: cleaned || rawResponse, layer: 'blackhole' };
  }

  const system = `${BLACKHOLE_PERSONA}

Intent: ${intent}
Source: ${sourceLayer === 'elite' ? 'Elite Council' : 'OSS Reserve Swarm'}
Rewrite the raw council/swarm output into the final XROGA voice. Keep all facts. Improve structure.`;

  const user = `User asked:\n${userInput.slice(0, 1500)}\n\nRaw output to absorb:\n${cleaned.slice(0, 8000)}`;

  if (getSecret('GROQ_API_KEY')) {
    try {
      const text = await groqGenerate(system, user, 2048);
      return { text, layer: 'blackhole' };
    } catch (err) {
      console.warn('[BlackHole] Groq synthesize failed:', (err as Error).message.slice(0, 80));
    }
  }

  if (getSecret('GEMINI_API_KEY')) {
    try {
      const text = await geminiGenerate(system, user, { model: 'gemini-2.0-flash', maxTokens: 2048 });
      if (text.trim()) return { text: text.trim(), layer: 'blackhole' };
    } catch (err) {
      console.warn('[BlackHole] Gemini synthesize failed:', (err as Error).message.slice(0, 80));
    }
  }

  if (getSecret('DEEPSEEK_API_KEY')) {
    try {
      const text = await deepSeekChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { model: 'deepseek-chat', maxTokens: 2048 }
      );
      if (text.trim()) return { text: text.trim(), layer: 'blackhole' };
    } catch {
      /* pass through */
    }
  }

  return { text: cleaned, layer: sourceLayer };
}
