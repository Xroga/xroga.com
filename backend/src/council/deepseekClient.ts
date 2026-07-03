import { deepSeekChat } from '../lib/deepseek.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { XROGA_USER_IDENTITY } from '../prompts/xrogaIdentity.js';
import { XROGA_MATH_FORMAT_HINT } from '../prompts/xrogaResponseFormat.js';
import {
  type ChatTurn,
  formatConversationContext,
  FRESHNESS_DIRECTIVE,
} from '../lib/conversationContext.js';

function deepseekSystem(context?: ChatTurn[], mathMode?: boolean): string {
  const mathHint = mathMode ? `\n\n${XROGA_MATH_FORMAT_HINT}` : '';
  return `${XROGA_USER_IDENTITY}${mathHint}\n\n${FRESHNESS_DIRECTIVE}${formatConversationContext(context)}`;
}

export async function deepseekGenerate(
  userInput: string,
  options?: { maxTokens?: number; context?: ChatTurn[]; mathMode?: boolean }
): Promise<string> {
  if (!getSecret('DEEPSEEK_API_KEY')) throw new Error('DEEPSEEK_API_KEY not configured');
  const user = formatMinimalPrompt(API_ROLES.deepseek.minimalPromptTemplate, userInput);
  const text = await deepSeekChat(
    [
      { role: 'system', content: deepseekSystem(options?.context, options?.mathMode) },
      { role: 'user', content: user },
    ],
    { model: 'deepseek-chat', maxTokens: options?.maxTokens ?? API_ROLES.deepseek.maxOutputTokens }
  );
  if (!text.trim()) throw new Error('DeepSeek returned empty');
  return text.trim();
}
