import { deepSeekChat } from '../lib/deepseek.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { XROGA_COUNCIL_BRIEF } from '../prompts/xrogaSystemManifest.js';

export async function deepseekGenerate(userInput: string, maxTokens?: number): Promise<string> {
  if (!getSecret('DEEPSEEK_API_KEY')) throw new Error('DEEPSEEK_API_KEY not configured');
  const user = formatMinimalPrompt(API_ROLES.deepseek.minimalPromptTemplate, userInput);
  const system = `${XROGA_COUNCIL_BRIEF}\n\nYou are DeepSeek Architect — sole model for production code blocks and STEM.`;
  const text = await deepSeekChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model: 'deepseek-chat', maxTokens: maxTokens ?? API_ROLES.deepseek.maxOutputTokens }
  );
  if (!text.trim()) throw new Error('DeepSeek returned empty');
  return text.trim();
}
