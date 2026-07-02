import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';
import { GROQ_SPRINTER_PROMPT } from '../prompts/councilPrompts.js';

export async function groqQuickReply(userInput: string, context?: string): Promise<string> {
  if (!getSecret('GROQ_API_KEY')) throw new Error('GROQ_API_KEY not configured');
  const user = context ? `${context}\n\nUser: ${userInput}` : userInput;
  const text = await groqChat(
    [
      { role: 'system', content: GROQ_SPRINTER_PROMPT },
      { role: 'user', content: user },
    ],
    { maxTokens: 256 }
  );
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
