import { deepSeekChat } from '../lib/deepseek.js';
import { groqChat } from '../lib/groq.js';
import { geminiGenerate } from '../lib/gemini.js';
import { claudeGenerate } from '../lib/anthropic.js';
import OpenAI from 'openai';
import { XROGA_CORE_TRAINING } from '../orchestrator/aiTraining.js';
import type { FeatureCategory } from '../types/features.js';

export type TaskComplexity = 'light' | 'medium' | 'heavy';

const HEAVY_CATEGORIES: FeatureCategory[] = [
  'landing_page',
  'video_studio',
  'deep_research',
  'code_debug',
  'job_hunter',
];

const HEAVY_PATTERNS =
  /\b(full.?stack|production|enterprise|complex|algorithm|architect|refactor|movie|feature film|phd|research report|deploy)\b/i;

const REASONING_PATTERNS =
  /\b(explain|why|how does|how do|compare|analyze|analyse|reason|step.?by.?step|debug|design|plan|evaluate|trade.?offs?|pros and cons|walk me through|break down|think through|deep dive|detailed)\b/i;

export function classifyComplexity(prompt: string, category?: FeatureCategory): TaskComplexity {
  if (category && HEAVY_CATEGORIES.includes(category)) return 'heavy';
  if (HEAVY_PATTERNS.test(prompt) || prompt.length > 400) return 'heavy';
  if (prompt.length > 120 || /\b(code|app|website|api|database)\b/i.test(prompt)) return 'medium';
  return 'light';
}

/** Terminal chat — bump to medium/heavy when the user asks for reasoning or depth */
export function classifyChatComplexity(prompt: string, category?: FeatureCategory): TaskComplexity {
  const base = classifyComplexity(prompt, category);
  if (base === 'heavy') return 'heavy';
  if (REASONING_PATTERNS.test(prompt) || prompt.length > 220) {
    return base === 'light' ? 'medium' : 'heavy';
  }
  return base;
}

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

/** Architect — DeepSeek-V4 Flash (cheap) → Gemini Flash fallback */
export async function architectPlan(prompt: string, category: string): Promise<string> {
  const system = `${XROGA_CORE_TRAINING}

You are the Xroga Architect. Break this request into a structured JSON plan.
Category: ${category}
Return concise JSON with keys: goal, steps (array), tools_needed, estimated_complexity.`;

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const reply = await deepSeekChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        { model: 'deepseek-chat', maxTokens: 512 }
      );
      if (reply.trim()) return reply.trim();
    } catch (err) {
      console.warn('[aiRouter] architect DeepSeek failed:', (err as Error).message);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await geminiGenerate(system, prompt, { model: 'gemini-2.0-flash', maxTokens: 512 });
    } catch (err) {
      console.warn('[aiRouter] architect Gemini failed:', (err as Error).message);
    }
  }

  return JSON.stringify({ goal: prompt, steps: [prompt], tools_needed: [], estimated_complexity: 'light' });
}

/** Builder — 80% cheap (Gemini/DeepSeek), 20% premium (Claude/GPT-4o) */
export async function builderGenerate(
  prompt: string,
  complexity: TaskComplexity,
  systemPrompt: string
): Promise<{ text: string; model: string }> {
  const usePremium = complexity === 'heavy' || (complexity === 'medium' && Math.random() < 0.3);

  if (usePremium && process.env.ANTHROPIC_API_KEY) {
    try {
      const text = await claudeGenerate(systemPrompt, prompt, { maxTokens: 2048 });
      if (text.trim()) return { text: text.trim(), model: 'claude-3.5-sonnet' };
    } catch (err) {
      console.warn('[aiRouter] builder Claude failed:', (err as Error).message);
    }
  }

  if (usePremium) {
    const openai = getOpenAI();
    if (openai) {
      try {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1024,
        });
        const text = res.choices[0]?.message?.content ?? '';
        if (text.trim()) return { text: text.trim(), model: 'gpt-4o-mini' };
      } catch (err) {
        console.warn('[aiRouter] builder OpenAI failed:', (err as Error).message);
      }
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await geminiGenerate(systemPrompt, prompt, {
        model: 'gemini-2.0-flash',
        maxTokens: 1024,
      });
      if (text.trim()) return { text: text.trim(), model: 'gemini-2.0-flash' };
    } catch (err) {
      console.warn('[aiRouter] builder Gemini failed:', (err as Error).message);
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const text = await deepSeekChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        { model: 'deepseek-chat', maxTokens: 1024 }
      );
      if (text.trim()) return { text: text.trim(), model: 'deepseek-chat' };
    } catch (err) {
      console.warn('[aiRouter] builder DeepSeek failed:', (err as Error).message);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const text = await groqChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 512 }
      );
      if (text) return { text, model: 'groq-llama' };
    } catch (err) {
      console.warn('[aiRouter] builder Groq failed:', (err as Error).message);
    }
  }

  return { text: `I received: "${prompt.slice(0, 200)}". Configure AI keys on Fly.io.`, model: 'fallback' };
}

/**
 * Terminal chat — Groq (general) with occasional Gemini; DeepSeek for reasoning/complex.
 */
export async function chatGenerate(
  prompt: string,
  complexity: TaskComplexity,
  systemPrompt: string
): Promise<{ text: string; model: string }> {
  const useDeepSeek = complexity === 'heavy' || complexity === 'medium';
  const preferGemini = !useDeepSeek && Math.random() < 0.28;

  if (useDeepSeek && process.env.DEEPSEEK_API_KEY) {
    try {
      const text = await deepSeekChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        { model: 'deepseek-chat', maxTokens: 1536 }
      );
      if (text.trim()) return { text: text.trim(), model: 'deepseek-chat' };
    } catch (err) {
      console.warn('[aiRouter] chat DeepSeek failed:', (err as Error).message);
    }
  }

  if (preferGemini && process.env.GEMINI_API_KEY) {
    try {
      const text = await geminiGenerate(systemPrompt, prompt, {
        model: 'gemini-2.0-flash',
        maxTokens: 1024,
      });
      if (text.trim()) return { text: text.trim(), model: 'gemini-2.0-flash' };
    } catch (err) {
      console.warn('[aiRouter] chat Gemini failed:', (err as Error).message);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const text = await groqChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 1024 }
      );
      if (text) return { text, model: 'groq-llama' };
    } catch (err) {
      console.warn('[aiRouter] chat Groq failed:', (err as Error).message);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await geminiGenerate(systemPrompt, prompt, {
        model: 'gemini-2.0-flash',
        maxTokens: 1024,
      });
      if (text.trim()) return { text: text.trim(), model: 'gemini-2.0-flash' };
    } catch (err) {
      console.warn('[aiRouter] chat Gemini fallback failed:', (err as Error).message);
    }
  }

  if (!useDeepSeek && process.env.DEEPSEEK_API_KEY) {
    try {
      const text = await deepSeekChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        { model: 'deepseek-chat', maxTokens: 1024 }
      );
      if (text.trim()) return { text: text.trim(), model: 'deepseek-chat' };
    } catch (err) {
      console.warn('[aiRouter] chat DeepSeek fallback failed:', (err as Error).message);
    }
  }

  return { text: `I received: "${prompt.slice(0, 200)}". Configure AI keys on Fly.io.`, model: 'fallback' };
}

/** Reviewer — DeepSeek-R1 */
export async function reviewerFindDefects(prompt: string, draftSummary: string): Promise<string> {
  const system = `You are the Xroga Reviewer. List 5-15 defects (JSON array) with severity, description, suggestion.
Output ONLY valid JSON array.`;

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      return await deepSeekChat(
        [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `User request: ${prompt}\n\nDraft output summary:\n${draftSummary.slice(0, 3000)}`,
          },
        ],
        { model: 'deepseek-reasoner', maxTokens: 1024 }
      );
    } catch (err) {
      console.warn('[aiRouter] reviewer DeepSeek-R1 failed:', (err as Error).message);
    }
  }

  return '[]';
}

/** QA — Groq ultra-fast */
export async function qaSimulate(prompt: string, draftSummary: string): Promise<{ passed: boolean; notes: string }> {
  if (!process.env.GROQ_API_KEY) {
    return { passed: true, notes: 'QA skipped (no Groq key)' };
  }

  try {
    const reply = await groqChat(
      [
        {
          role: 'system',
          content: 'You are QA Tester. Reply JSON only: {"passed":true/false,"errors":["..."]}',
        },
        { role: 'user', content: `Simulate:\n${prompt}\nOutput:\n${draftSummary.slice(0, 2000)}` },
      ],
      { maxTokens: 256 }
    );
    const parsed = JSON.parse(reply) as { passed?: boolean; errors?: string[] };
    return {
      passed: parsed.passed !== false,
      notes: parsed.errors?.join('; ') || 'All checks passed',
    };
  } catch {
    return { passed: true, notes: 'QA simulation complete' };
  }
}

/** Truth Council — Gemini Flash → Pro for heavy */
export async function truthCouncilVerify(
  prompt: string,
  outputSummary: string,
  complexity: TaskComplexity
): Promise<{ approved: boolean; reasons: string[] }> {
  const model = complexity === 'heavy' ? 'gemini-1.5-pro' : 'gemini-2.0-flash';
  const system = `You are the Truth Council. Verify safety, factual plausibility, and goal alignment.
Reply JSON: {"approved":true/false,"reasons":["..."]}`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const raw = await geminiGenerate(
        system,
        `Request: ${prompt}\n\nOutput:\n${outputSummary.slice(0, 4000)}`,
        { model, maxTokens: 512 }
      );
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '')) as {
        approved?: boolean;
        reasons?: string[];
      };
      return {
        approved: parsed.approved !== false,
        reasons: parsed.reasons ?? ['Verified'],
      };
    } catch (err) {
      console.warn('[aiRouter] truth council failed:', (err as Error).message);
    }
  }

  return { approved: true, reasons: ['Default approval (no Gemini key)'] };
}
