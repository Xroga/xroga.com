import { deepSeekChat } from '../../lib/deepseek.js';
import { geminiGenerate } from '../../lib/gemini.js';

const SYSTEM = `You are Xroga, an AI Swarm assistant. Be helpful, concise, and friendly. 
If the user greets you, greet them back and offer to help build apps, videos, websites, or automate tasks.`;

export async function quickChat(prompt: string): Promise<string> {
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const reply = await deepSeekChat(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 600, model: 'deepseek-chat' }
      );
      if (reply.trim()) return reply.trim();
    } catch (err) {
      console.error('[quickChat] DeepSeek failed:', (err as Error).message);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const reply = await geminiGenerate(SYSTEM, prompt, { maxTokens: 600, model: 'gemini-2.0-flash' });
      if (reply.trim()) return reply.trim();
    } catch (err) {
      console.error('[quickChat] Gemini failed:', (err as Error).message);
    }
  }

  const lower = prompt.toLowerCase().trim();
  if (/^(hi|hello|hey|yo|sup)\b/.test(lower)) {
    return "Hello! I'm Xroga — your AI Swarm is online and ready. Ask me to build a website, make a video, research a topic, or automate a task.";
  }

  return `I received your message: "${prompt.slice(0, 200)}". I'm Xroga's AI assistant — tell me what you'd like to build and I'll route it through the Swarm.`;
}
