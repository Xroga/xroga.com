import { groqChat } from '../../lib/groq.js';
import {
  builderGenerate,
  classifyComplexity,
} from '../aiRouter.js';

const SYSTEM = `You are Xroga, an AI Swarm assistant. Be helpful, concise, and friendly.
If the user greets you, greet them back and offer to help build apps, videos, websites, or automate tasks.`;

const GREETING_REPLY =
  "Hello! I'm Xroga — your AI Swarm command center is online. I can build apps, generate videos, automate workflows, and research anything. What should we create?";

export async function quickChat(prompt: string): Promise<string> {
  const lower = prompt.toLowerCase().trim();
  if (/^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening))\b/.test(lower)) {
    return GREETING_REPLY;
  }

  const complexity = classifyComplexity(prompt, 'chat');
  const { text, model } = await builderGenerate(prompt, complexity, SYSTEM);
  console.log(`[quickChat] routed to ${model} (complexity: ${complexity})`);
  return text;
}

export async function quickChatWithGroqFallback(prompt: string): Promise<string> {
  try {
    return await quickChat(prompt);
  } catch {
    if (process.env.GROQ_API_KEY) {
      return groqChat(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 400 }
      );
    }
    throw new Error('All chat models failed');
  }
}
