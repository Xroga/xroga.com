import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';

/** Sprinter — raw user input only, max 50 tokens (manifesto) */
export async function groqSprinter(userInput: string): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat([{ role: 'user', content: userInput }], {
    maxTokens: API_ROLES.groq.maxOutputTokens,
  });
  if (!text.trim()) throw new Error('Groq returned empty');
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
