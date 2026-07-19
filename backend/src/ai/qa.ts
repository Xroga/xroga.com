import { chatCompletion } from './openaiCompat.js';

export interface ReviewBuildOutputOpts {
  prompt: string;
  html: string;
  css: string;
  js: string;
  isUpdate?: boolean;
}

export interface ReviewBuildOutputResult {
  ok: boolean;
  issues: string[];
  fixHints: string[];
  inputTokens: number;
  outputTokens: number;
}

const REVIEW_SYSTEM = `You are a strict QA reviewer for browser-previewable web builds.
Respond with JSON only: { "ok": boolean, "issues": string[], "fixHints": string[] }.
- ok=true when the build satisfies the user prompt with no critical defects.
- issues: concrete problems (broken layout, missing interactivity, accessibility gaps).
- fixHints: short, actionable repair suggestions the builder can apply.
No markdown. No extra keys.`;

function parseReviewJson(text: string): Pick<ReviewBuildOutputResult, 'ok' | 'issues' | 'fixHints'> {
  const fallback = { ok: true, issues: [] as string[], fixHints: [] as string[] };
  const trimmed = text.trim();
  if (!trimmed) return fallback;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();

  try {
    const parsed = JSON.parse(raw) as {
      ok?: boolean;
      issues?: unknown;
      fixHints?: unknown;
    };
    return {
      ok: parsed.ok !== false,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.filter((x): x is string => typeof x === 'string')
        : [],
      fixHints: Array.isArray(parsed.fixHints)
        ? parsed.fixHints.filter((x): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return fallback;
  }
}

/**
 * Non-blocking QA pass over generated site files. Returns ok=true when the review cannot run.
 */
export async function reviewBuildOutput(
  opts: ReviewBuildOutputOpts,
): Promise<ReviewBuildOutputResult> {
  const empty: ReviewBuildOutputResult = {
    ok: true,
    issues: [],
    fixHints: [],
    inputTokens: 0,
    outputTokens: 0,
  };

  const userPayload = {
    prompt: opts.prompt.slice(0, 4000),
    isUpdate: Boolean(opts.isUpdate),
    html: opts.html.slice(0, 12000),
    css: opts.css.slice(0, 8000),
    js: opts.js.slice(0, 8000),
  };

  try {
    const result = await chatCompletion(
      'deepseek_v4_flash',
      [
        { role: 'system', content: REVIEW_SYSTEM },
        {
          role: 'user',
          content: `Review this build against the user prompt.\n${JSON.stringify(userPayload)}`,
        },
      ],
      { maxTokens: 1024, temperature: 0.2, json: true },
    );

    const parsed = parseReviewJson(result.text);
    return {
      ...parsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch {
    return empty;
  }
}
