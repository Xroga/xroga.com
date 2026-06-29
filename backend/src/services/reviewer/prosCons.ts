import { groqChat } from '../../lib/groq.js';
import { deepSeekChat } from '../../lib/deepseek.js';

export interface ProsConsResult {
  pros: string[];
  cons: string[];
  nextSteps: string[];
  followUps: string[];
}

const GENERIC: ProsConsResult = {
  pros: [],
  cons: [],
  nextSteps: [],
  followUps: [],
};

export async function generateProsCons(
  prompt: string,
  answer: string
): Promise<ProsConsResult> {
  // Skip for trivial short answers
  if (answer.length < 120 || prompt.length < 15) return GENERIC;

  const system = `Analyze the following answer and provide 3 specific pros, 2 specific cons, and 2 concrete next steps.
Also provide 3 context-aware follow-up questions the user might ask.
Reply ONLY with JSON: {"pros":["..."],"cons":["..."],"nextSteps":["..."],"followUps":["..."]}`;

  const user = `User question: ${prompt.slice(0, 500)}\n\nAnswer:\n${answer.slice(0, 3000)}`;

  if (process.env.GROQ_API_KEY) {
    try {
      const raw = await groqChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 512 }
      );
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '')) as ProsConsResult;
      if (parsed.pros?.length) return parsed;
    } catch {
      /* fallback */
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const raw = await deepSeekChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { model: 'deepseek-chat', maxTokens: 512 }
      );
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '')) as ProsConsResult;
      if (parsed.pros?.length) return parsed;
    } catch {
      /* fallback */
    }
  }

  return GENERIC;
}

export function formatProsConsBlock(result: ProsConsResult): string {
  if (!result.pros.length) return '';
  const pros = result.pros.map((p) => `- ${p}`).join('\n');
  const cons = result.cons.map((c) => `- ${c}`).join('\n');
  const next = result.nextSteps.map((n) => `- ${n}`).join('\n');
  return `\n\n**Pros**\n${pros}\n\n**Cons**\n${cons}\n\n**Next steps**\n${next}`;
}
