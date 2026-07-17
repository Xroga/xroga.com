import { chatCompletion } from './openaiCompat.js';
import { CONVERTER_SYSTEM, converterUserPrompt } from './prompts.js';

/**
 * Converter AI: turns any raw user request into a detailed builder instruction.
 * Uses DeepSeek V4 Flash (cheap) — no template catalogs.
 */
export async function convertUserRequest(
  userRequest: string,
  researchBlock?: string,
): Promise<{ instruction: string; inputTokens: number; outputTokens: number }> {
  const result = await chatCompletion('deepseek_v4_flash', [
    { role: 'system', content: CONVERTER_SYSTEM },
    { role: 'user', content: converterUserPrompt(userRequest, researchBlock) },
  ], {
    temperature: 0.4,
    maxTokens: 4096,
  });

  const instruction = result.text.trim();
  if (!instruction) {
    throw new Error('Converter returned an empty instruction');
  }

  return {
    instruction,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
