import { deepSeekChat } from '../lib/deepseek.js';
import { getSecret } from '../config/envSecrets.js';
import { DEEPSEEK_ARCHITECT_PROMPT } from '../prompts/councilPrompts.js';

export async function deepseekGenerate(userInput: string, maxTokens = 2048): Promise<string> {
  if (!getSecret('DEEPSEEK_API_KEY')) throw new Error('DEEPSEEK_API_KEY not configured');
  const text = await deepSeekChat(
    [
      { role: 'system', content: DEEPSEEK_ARCHITECT_PROMPT },
      { role: 'user', content: userInput },
    ],
    { model: 'deepseek-chat', maxTokens }
  );
  if (!text.trim()) throw new Error('DeepSeek returned empty');
  return text.trim();
}
