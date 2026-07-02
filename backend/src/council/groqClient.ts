import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import {
  GROQ_SPRINTER_PROMPT,
  GROQ_GREETING_PROMPT,
  GROQ_EDGE_PROMPT,
} from '../prompts/councilPrompts.js';
import { XROGA_USER_IDENTITY } from '../prompts/xrogaIdentity.js';
import {
  type ChatTurn,
  formatConversationContext,
  FRESHNESS_DIRECTIVE,
} from '../lib/conversationContext.js';

function groqSystem(rolePrompt: string, context?: ChatTurn[]): string {
  return `${XROGA_USER_IDENTITY}\n\n${rolePrompt}\n\n${FRESHNESS_DIRECTIVE}${formatConversationContext(context)}`;
}

function isGreetingText(input: string): boolean {
  return /^(hi|hello|hey|yo|sup|salam|good\s+(morning|afternoon|evening))\b/i.test(input.trim());
}

/** Sprinter — sealed role prompt */
export async function groqSprinter(userInput: string, context?: ChatTurn[]): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const greeting = isGreetingText(userInput);
  const rolePrompt = greeting ? GROQ_GREETING_PROMPT : GROQ_SPRINTER_PROMPT;
  const maxTokens = greeting ? 120 : API_ROLES.groq.maxOutputTokens;
  const text = await groqChat(
    [
      { role: 'system', content: groqSystem(rolePrompt, context) },
      { role: 'user', content: userInput },
    ],
    { maxTokens }
  );
  if (!text.trim()) throw new Error('Groq returned empty');
  return text.trim();
}

/** General chat */
export async function groqGeneral(userInput: string, context?: ChatTurn[]): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat(
    [
      { role: 'system', content: groqSystem(GROQ_SPRINTER_PROMPT, context) },
      { role: 'user', content: userInput },
    ],
    { maxTokens: 1024 }
  );
  if (!text.trim()) throw new Error('Groq returned empty');
  return text.trim();
}

/** Contrarian edge for decision triad */
export async function groqContrarian(userInput: string, draft: string): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat(
    [
      { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${GROQ_EDGE_PROMPT}` },
      { role: 'user', content: `Question: ${userInput}\n\nDraft answer:\n${draft.slice(0, 2000)}` },
    ],
    { maxTokens: 150 }
  );
  if (!text.trim()) throw new Error('Groq contrarian empty');
  return text.trim();
}

export async function groqGenerate(system: string, userInput: string, maxTokens = 1024): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userInput },
    ],
    { maxTokens }
  );
  if (!text.trim()) throw new Error('Groq returned empty');
  return text.trim();
}

export async function groqWithTemplate(userInput: string): Promise<string> {
  const prompt = formatMinimalPrompt(API_ROLES.groq.minimalPromptTemplate, userInput);
  return groqSprinter(prompt);
}

/** @deprecated use groqSprinter */
export async function groqQuickReply(userInput: string): Promise<string> {
  return groqSprinter(userInput);
}
