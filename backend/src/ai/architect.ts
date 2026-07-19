/**
 * Architect agent — emits a concrete file plan before the builder runs.
 */

import { chatCompletion } from './openaiCompat.js';

export interface ArchitectPlan {
  stack: string;
  files: Array<{ path: string; purpose: string }>;
  notes: string[];
  inputTokens: number;
  outputTokens: number;
  raw: string;
}

const ARCHITECT_SYSTEM = `You are the Architect agent on Xroga.
Given a builder brief, output JSON only:
{
  "stack": "static|nextjs|expo|other",
  "files": [{ "path": "relative/path", "purpose": "one line" }],
  "notes": ["constraint or risk"]
}
Rules:
- Prefer the smallest complete file set that ships.
- For SaaS/auth/API use nextjs with app/api/* and .env.example.
- For Android/iOS use expo (app.json, app/index.tsx, …).
- For simple sites use static index.html/styles.css/script.js.
- Max 24 files in the plan.
- No markdown fences. JSON only.`;

function parsePlan(text: string): Pick<ArchitectPlan, 'stack' | 'files' | 'notes'> {
  const fallback = {
    stack: 'static',
    files: [] as Array<{ path: string; purpose: string }>,
    notes: [] as string[],
  };
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();
  try {
    const parsed = JSON.parse(raw) as {
      stack?: string;
      files?: Array<{ path?: string; purpose?: string }>;
      notes?: unknown;
    };
    const files = Array.isArray(parsed.files)
      ? parsed.files
          .filter((f) => typeof f?.path === 'string')
          .map((f) => ({
            path: String(f.path).replace(/^\.\//, ''),
            purpose: typeof f.purpose === 'string' ? f.purpose : '',
          }))
          .slice(0, 24)
      : [];
    return {
      stack: typeof parsed.stack === 'string' ? parsed.stack : 'static',
      files,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 8)
        : [],
    };
  } catch {
    return fallback;
  }
}

export async function runArchitectPlan(opts: {
  brief: string;
  userPrompt: string;
  isUpdate?: boolean;
}): Promise<ArchitectPlan> {
  const result = await chatCompletion(
    'deepseek_v4_flash',
    [
      { role: 'system', content: ARCHITECT_SYSTEM },
      {
        role: 'user',
        content: `${opts.isUpdate ? 'INCREMENTAL UPDATE — plan only files that must change.\n' : ''}Builder brief:\n${opts.brief.slice(0, 6000)}\n\nUser request:\n${opts.userPrompt.slice(0, 2000)}`,
      },
    ],
    { maxTokens: 1200, temperature: 0.2, json: true },
  );
  const parsed = parsePlan(result.text);
  return {
    ...parsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    raw: result.text.slice(0, 4000),
  };
}

export function formatArchitectForBuilder(plan: ArchitectPlan): string {
  if (!plan.files.length) return '';
  const listing = plan.files.map((f) => `- ${f.path}: ${f.purpose}`).join('\n');
  const notes = plan.notes.length ? `\nNotes:\n${plan.notes.map((n) => `- ${n}`).join('\n')}` : '';
  return `\n\nARCHITECT FILE PLAN (stack=${plan.stack}) — implement these paths:\n${listing}${notes}\n`;
}
