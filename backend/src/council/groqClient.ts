import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';
import { API_ROLES, formatMinimalPrompt } from '../config/apiRoles.js';
import { XROGA_COUNCIL_BRIEF } from '../prompts/xrogaSystemManifest.js';

/** Sprinter — raw user input only, max 50 tokens (manifesto) */
export async function groqSprinter(userInput: string): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat([{ role: 'user', content: userInput }], {
    maxTokens: API_ROLES.groq.maxOutputTokens,
  });
  if (!text.trim()) throw new Error('Groq returned empty');
  return text.trim();
}

/** General chat — Groq + XROGA platform brief (short prompts) */
export async function groqGeneral(userInput: string): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const system = `${XROGA_COUNCIL_BRIEF}\n\nYou are Groq Sprinter inside XROGA. Answer clearly; mention relevant XROGA features when helpful.`;
  const text = await groqChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userInput },
    ],
    { maxTokens: 1024 }
  );
  if (!text.trim()) throw new Error('Groq returned empty');
  return text.trim();
}

/** Devil's advocate — Groq replaces Grok for decision triad */
export async function groqContrarian(userInput: string, draft: string): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const text = await groqChat(
    [
      {
        role: 'system',
        content:
          'You are Groq inside XROGA. Give a punchy contrarian take — challenge assumptions in under 80 words.',
      },
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
