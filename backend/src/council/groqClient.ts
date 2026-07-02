import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import {
  GROQ_SPRINTER_PROMPT,
  GROQ_EDGE_PROMPT,
} from '../prompts/councilPrompts.js';
import {
  type ChatTurn,
  formatConversationContext,
  FRESHNESS_DIRECTIVE,
} from '../lib/conversationContext.js';

function groqSystem(rolePrompt: string, context?: ChatTurn[]): string {
  return `${rolePrompt}\n\nYou are Groq Sprinter inside XROGA AI. ${FRESHNESS_DIRECTIVE}${formatConversationContext(context)}`;
}

/** Sprinter — sealed role prompt, max 50 tokens */
export async function groqSprinter(userInput: string, context?: ChatTurn[]): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat(
    [
      { role: 'system', content: groqSystem(GROQ_SPRINTER_PROMPT, context) },
      { role: 'user', content: userInput },
    ],
    { maxTokens: API_ROLES.groq.maxOutputTokens }
  );
  if (!text.trim()) throw new Error('Groq returned empty');
  return text.trim();
}

/** General chat — Groq Sprinter with conversation memory */
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
      { role: 'system', content: GROQ_EDGE_PROMPT },
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
