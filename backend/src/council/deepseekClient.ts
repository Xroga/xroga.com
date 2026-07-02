import { deepSeekChat } from '../lib/deepseek.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { DEEPSEEK_ARCHITECT_PROMPT } from '../prompts/councilPrompts.js';
import {
  type ChatTurn,
  formatConversationContext,
  FRESHNESS_DIRECTIVE,
} from '../lib/conversationContext.js';

function deepseekSystem(context?: ChatTurn[]): string {
  return `${DEEPSEEK_ARCHITECT_PROMPT}\n\nYou are DeepSeek Architect inside XROGA AI. ${FRESHNESS_DIRECTIVE}${formatConversationContext(context)}`;
}

export async function deepseekGenerate(
  userInput: string,
  options?: { maxTokens?: number; context?: ChatTurn[] }
): Promise<string> {
  if (!getSecret('DEEPSEEK_API_KEY')) throw new Error('DEEPSEEK_API_KEY not configured');
  const user = formatMinimalPrompt(API_ROLES.deepseek.minimalPromptTemplate, userInput);
  const text = await deepSeekChat(
    [
      { role: 'system', content: deepseekSystem(options?.context) },
      { role: 'user', content: user },
    ],
    { model: 'deepseek-chat', maxTokens: options?.maxTokens ?? API_ROLES.deepseek.maxOutputTokens }
  );
  if (!text.trim()) throw new Error('DeepSeek returned empty');
  return text.trim();
}
