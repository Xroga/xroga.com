/**
 * 20% Reserve — Claude / GPT polish. On failure → Core Quartet handles 100%.
 */

import { claudeGenerate } from '../../lib/anthropic.js';
import OpenAI from 'openai';
import { getSecret } from '../../config/envSecrets.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';

function getOpenAI(): OpenAI | null {
  const key = getSecret('OPENAI_API_KEY');
  return key ? new OpenAI({ apiKey: key }) : null;
}

export async function reservePolish(
  assembledCode: string,
  userPrompt: string,
  reason: 'ultra_polish' | 'repeated_failure'
): Promise<string | null> {
  const system = `${XROGA_USER_IDENTITY}

You are XROGA Reserve polish (${reason}). Refine UI/UX and edge-case logic. Keep all working code intact.`;
  const user = `Request: ${userPrompt.slice(0, 600)}\n\nCodebase:\n${assembledCode.slice(0, 12000)}`;

  if (getSecret('ANTHROPIC_API_KEY')) {
    try {
      const text = await claudeGenerate(system, user, { maxTokens: 4096 });
      if (text.trim()) return text.trim();
    } catch (err) {
      console.warn('[Reserve] Claude failed:', (err as Error).message.slice(0, 80));
    }
  }

  const openai = getOpenAI();
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.warn('[Reserve] GPT failed:', (err as Error).message.slice(0, 80));
    }
  }

  return null;
}

export function shouldUseReserve(userPrompt: string, correctionAttempts: number): boolean {
  if (correctionAttempts >= 3) return true;
  return /\b(ultra.?polish|premium ui|pixel.?perfect|polished ui)\b/i.test(userPrompt);
}
