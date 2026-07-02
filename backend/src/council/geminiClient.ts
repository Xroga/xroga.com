import { geminiGenerate } from '../lib/gemini.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { GEMINI_POLYMATH_PROMPT } from '../prompts/councilPrompts.js';
import {
  type ChatTurn,
  formatConversationContext,
  FRESHNESS_DIRECTIVE,
} from '../lib/conversationContext.js';

function geminiSystem(context?: ChatTurn[]): string {
  return `${GEMINI_POLYMATH_PROMPT}\n\nYou are Gemini Polymath inside XROGA AI. ${FRESHNESS_DIRECTIVE}${formatConversationContext(context)}`;
}

export async function geminiGenerateCultural(
  userInput: string,
  options?: { fileContext?: string; context?: ChatTurn[] }
): Promise<string> {
  if (!getSecret('GEMINI_API_KEY')) throw new Error('GEMINI_API_KEY not configured');
  const user = formatMinimalPrompt(API_ROLES.gemini.minimalPromptTemplate, userInput);
  const fullUser = options?.fileContext
    ? `${user}\n\n[Uploaded content summary]\n${options.fileContext.slice(0, 12000)}`
    : user;

  const text = await geminiGenerate(geminiSystem(options?.context), fullUser, {
    model: 'gemini-2.0-flash',
    maxTokens: API_ROLES.gemini.maxOutputTokens,
  });
  if (!text.trim()) throw new Error('Gemini returned empty');
  return text.trim();
}

export async function geminiReview(draft: string, userInput: string): Promise<string> {
  if (!getSecret('GEMINI_API_KEY')) throw new Error('GEMINI_API_KEY not configured');
  const system = `Review the draft for cultural accuracy, missing context, and clarity. Be concise. No emojis.`;
  const text = await geminiGenerate(
    system,
    `User request: ${userInput}\n\nDraft:\n${draft.slice(0, 6000)}`,
    { model: 'gemini-2.0-flash', maxTokens: 1024 }
  );
  if (!text.trim()) throw new Error('Gemini review empty');
  return text.trim();
}

export function geminiKnowledgeGapCard(reason: string): string {
  return `## Knowledge Gap

Gemini (multimodal) is required for this request but is unavailable.

${reason}

Configure **GEMINI_API_KEY** on the server, or rephrase without file upload.`;
}
