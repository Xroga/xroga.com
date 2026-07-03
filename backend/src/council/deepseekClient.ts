import { deepSeekChat } from '../lib/deepseek.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { DEEPSEEK_ARCHITECT_PROMPT } from '../prompts/councilPrompts.js';
import { XROGA_USER_IDENTITY } from '../prompts/xrogaIdentity.js';
import {
  type ChatTurn,
  formatConversationContext,
  FRESHNESS_DIRECTIVE,
} from '../lib/conversationContext.js';

function deepseekSystem(context?: ChatTurn[]): string {
  return `${XROGA_USER_IDENTITY}\n\n${DEEPSEEK_ARCHITECT_PROMPT}\n\n${FRESHNESS_DIRECTIVE}${formatConversationContext(context)}`;
}

export async function deepseekGenerate(
  userInput: string,
  options?: { maxTokens?: number; context?: ChatTurn[]; mathMode?: boolean }
): Promise<string> {
  if (!getSecret('DEEPSEEK_API_KEY')) throw new Error('DEEPSEEK_API_KEY not configured');
  const user = options?.mathMode
    ? `${formatMinimalPrompt(API_ROLES.deepseek.minimalPromptTemplate, userInput)}\n\nFollow the MATH layout exactly. Never merge Step labels with equations.`
    : formatMinimalPrompt(API_ROLES.deepseek.minimalPromptTemplate, userInput);
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
