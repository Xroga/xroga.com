import { geminiGenerate } from '../lib/gemini.js';
import { getSecret } from '../config/envSecrets.js';
import { GEMINI_POLYMATH_PROMPT } from '../prompts/councilPrompts.js';

export async function geminiGenerateCultural(userInput: string): Promise<string> {
  if (!getSecret('GEMINI_API_KEY')) throw new Error('GEMINI_API_KEY not configured');
  const text = await geminiGenerate(GEMINI_POLYMATH_PROMPT, userInput, {
    model: 'gemini-2.0-flash',
    maxTokens: 2048,
  });
  if (!text.trim()) throw new Error('Gemini returned empty');
  return text.trim();
}

export async function geminiReview(draft: string, userInput: string): Promise<string> {
  if (!getSecret('GEMINI_API_KEY')) throw new Error('GEMINI_API_KEY not configured');
  const text = await geminiGenerate(
    'You are Gemini Critic. Review the draft for cultural accuracy, missing context, and clarity. Be concise.',
    `User request: ${userInput}\n\nDraft:\n${draft.slice(0, 6000)}`,
    { model: 'gemini-2.0-flash', maxTokens: 1024 }
  );
  if (!text.trim()) throw new Error('Gemini review empty');
  return text.trim();
}
