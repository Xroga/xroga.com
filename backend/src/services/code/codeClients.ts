/**
 * Code pipeline API clients — use DEEPSEEK_CODE_API_KEY, GROQ_CODE_API_KEY, GEMINI_CODE_API_KEY.
 * Retries with exponential backoff; falls back to chat keys via apiKeyRouter.
 */

import { resolveApiKey, CODE_MODELS, type CodeProvider } from '../../config/apiKeyRouter.js';
import { geminiGenerate } from '../../lib/gemini.js';
import { groqChat } from '../../lib/groq.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      const msg = lastErr.message || '';
      // Timeouts / aborts: fail fast — retrying burns more API time with no progress
      if (/aborted|timeout|TimeoutError|AbortError/i.test(msg) || lastErr.name === 'TimeoutError' || lastErr.name === 'AbortError') {
        throw lastErr;
      }
      const isRateLimit = /429|rate.?limit|quota/i.test(msg);
      if (attempt < MAX_RETRIES - 1 && isRateLimit) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_DELAY_MS);
        continue;
      }
    }
  }
  throw lastErr ?? new Error(`${label} failed after ${MAX_RETRIES} retries`);
}

/** DeepSeek Code — primary code generation engine */
export async function deepseekCode(
  system: string,
  user: string,
  options?: { maxTokens?: number; model?: string; timeoutMs?: number }
): Promise<string> {
  const apiKey = resolveApiKey('deepseek', 'code');
  if (!apiKey) throw new Error('DEEPSEEK_CODE_API_KEY / DEEPSEEK_API_KEY not configured');

  const timeoutMs = options?.timeoutMs ?? 90_000;

  return withRetry(async () => {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? CODE_MODELS.deepseek,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: options?.maxTokens ?? 16384,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek Code API error: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }, 'DeepSeek Code');
}

/** Groq Code — fast syntax verification */
export async function groqCode(
  system: string,
  user: string,
  options?: { maxTokens?: number }
): Promise<string> {
  const apiKey = resolveApiKey('groq', 'code');
  if (!apiKey) throw new Error('GROQ_CODE_API_KEY / GROQ_API_KEY not configured');

  return withRetry(async () => {
    return groqChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: options?.maxTokens ?? 512, apiKey }
    );
  }, 'Groq Code');
}

/** Gemini Code — multimodal / planning (skipped unless images attached) */
export async function geminiCode(
  system: string,
  user: string,
  options?: { maxTokens?: number }
): Promise<string> {
  const apiKey = resolveApiKey('gemini', 'code');
  if (!apiKey) throw new Error('GEMINI_CODE_API_KEY / GEMINI_API_KEY not configured');

  return withRetry(async () => {
    return geminiGenerate(system, user, {
      model: CODE_MODELS.gemini,
      maxTokens: options?.maxTokens ?? 4096,
      apiKey,
    });
  }, 'Gemini Code');
}

/** Parse JSON file dictionary from DeepSeek Code output */
export function parseCodeJsonOutput(raw: string): Record<string, string> | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fence?.[1] ?? raw).trim();
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      if (Object.keys(out).length) return out;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export const DEEPSEEK_CODE_BUILD_PROMPT = `You are XROGA Architect (DeepSeek Code). Build a complete, production-ready project.

Detect the appropriate technology stack:
- Websites/landing pages → HTML + CSS + JS (modern, responsive, styled — never bare unstyled links)
- Games → HTML5 Canvas, Phaser, or Python (pygame) as appropriate
- Apps/software → use the best language (Python, JavaScript, TypeScript, Go, Rust, etc.)
- Always output complete, runnable code — no placeholders or TODO stubs

Output files as a JSON dictionary: {"filename": "content", ...}
For static sites use keys: html, css, js (or index.html, styles.css, script.js)
Do NOT output explanations — only valid JSON.
Use sensible defaults: modern design, responsive, clean structure, real content from the brief.`;

export const DEEPSEEK_CODE_VERIFY_PROMPT = `You are XROGA Architect (DeepSeek Code). Review the JSON code you generated.
Check for syntax errors, missing imports, logical flaws, incomplete features.
Fix any issues. Output ONLY the corrected JSON dictionary.`;
