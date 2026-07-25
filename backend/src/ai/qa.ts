import { chatCompletion } from './openaiCompat.js';
import type { ProjectFile } from './patches.js';
import { staticValidateProject } from './staticValidate.js';
import type { ModelId } from './models.js';

export interface ReviewBuildOutputOpts {
  prompt: string;
  html: string;
  css: string;
  js: string;
  isUpdate?: boolean;
  /** Framework / multi-file tree for Next/Expo QA */
  files?: ProjectFile[];
  reviewerModel?: ModelId;
  acceptanceCriteria?: string[];
  architectureSummary?: string;
  changedFiles?: string[];
  validationResults?: unknown[];
  securitySensitiveContext?: string[];
  completion?: typeof chatCompletion;
}

export interface ReviewBuildOutputResult {
  ok: boolean;
  issues: string[];
  fixHints: string[];
  inputTokens: number;
  outputTokens: number;
  staticKind?: string;
  reviewerModel: ModelId;
  findings: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    evidence: string;
    affectedFiles: string[];
  }>;
}

const REVIEW_SYSTEM = `You are a strict QA reviewer for Xroga builds (static HTML, Next.js, or Expo).
Respond with JSON only: { "ok": boolean, "issues": string[], "fixHints": string[], "findings": [{ "severity": "low|medium|high|critical", "title": string, "evidence": string, "affectedFiles": string[] }] }.
- ok=true when the build satisfies the user prompt with no critical defects.
- For Next/Expo: check entry files, env usage (no hardcoded secrets), and that the ask was met.
- issues: concrete problems.
- fixHints: short, actionable repairs.
No markdown. No extra keys.`;

function parseReviewJson(text: string): Pick<ReviewBuildOutputResult, 'ok' | 'issues' | 'fixHints' | 'findings'> {
  const fallback = { ok: false, issues: ['QA parse failed — treat as needs review'], fixHints: [] as string[] };
  const trimmed = text.trim();
  if (!trimmed) return { ...fallback, findings: [] };

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();

  try {
    const parsed = JSON.parse(raw) as {
      ok?: boolean;
      issues?: unknown;
      fixHints?: unknown;
      findings?: unknown;
    };
    return {
      ok: parsed.ok !== false,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.filter((x): x is string => typeof x === 'string')
        : [],
      fixHints: Array.isArray(parsed.fixHints)
        ? parsed.fixHints.filter((x): x is string => typeof x === 'string')
        : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings.flatMap((finding) => {
        if (!finding || typeof finding !== 'object') return [];
        const value = finding as Record<string, unknown>;
        if (typeof value.title !== 'string' || typeof value.evidence !== 'string') return [];
        const severity = ['low', 'medium', 'high', 'critical'].includes(String(value.severity))
          ? value.severity as ReviewBuildOutputResult['findings'][number]['severity']
          : 'medium';
        return [{
          severity,
          title: value.title,
          evidence: value.evidence,
          affectedFiles: Array.isArray(value.affectedFiles)
            ? value.affectedFiles.filter((item): item is string => typeof item === 'string')
            : [],
        }];
      }) : [],
    };
  } catch {
    return { ...fallback, findings: [] };
  }
}

function frameworkSamples(files: ProjectFile[]): string {
  const prefer = [
    'package.json',
    'app/page.tsx',
    'app/layout.tsx',
    'app/index.tsx',
    'app.json',
    'app/api/health/route.ts',
    'app/api/chat/route.ts',
    'index.html',
  ];
  const picked: ProjectFile[] = [];
  for (const p of prefer) {
    const f = files.find((x) => x.path === p);
    if (f) picked.push(f);
  }
  if (!picked.length) picked.push(...files.slice(0, 4));
  return picked
    .map((f) => `### ${f.path}\n${f.content.slice(0, 2500)}`)
    .join('\n\n')
    .slice(0, 14000);
}

/**
 * QA: static structure checks + LLM review (HTML or framework samples).
 * Does NOT fail-open on parse errors anymore.
 */
export async function reviewBuildOutput(
  opts: ReviewBuildOutputOpts,
): Promise<ReviewBuildOutputResult> {
  const emptyFail: ReviewBuildOutputResult = {
    ok: false,
    issues: ['QA unavailable'],
    fixHints: ['Retry build'],
    inputTokens: 0,
    outputTokens: 0,
    reviewerModel: opts.reviewerModel ?? 'deepseek_v4_flash',
    findings: [],
  };

  const staticResult = opts.files?.length
    ? staticValidateProject(opts.files)
    : { ok: true, issues: [] as string[], fixHints: [] as string[], kind: 'static' as const };

  const userPayload = {
    prompt: opts.prompt.slice(0, 4000),
    isUpdate: Boolean(opts.isUpdate),
    kind: staticResult.kind,
    html: opts.html.slice(0, 8000),
    css: opts.css.slice(0, 4000),
    js: opts.js.slice(0, 4000),
    files: opts.files?.length ? frameworkSamples(opts.files) : undefined,
    staticIssues: staticResult.issues,
    acceptanceCriteria: opts.acceptanceCriteria,
    architectureSummary: opts.architectureSummary,
    changedFiles: opts.changedFiles,
    validationResults: opts.validationResults,
    securitySensitiveContext: opts.securitySensitiveContext,
  };

  try {
    const result = await (opts.completion ?? chatCompletion)(
      opts.reviewerModel ?? 'deepseek_v4_flash',
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
    const issues = [...staticResult.issues, ...parsed.issues];
    const fixHints = [...staticResult.fixHints, ...parsed.fixHints];
    const ok = staticResult.ok && parsed.ok && issues.filter((i) => /missing|not valid|secret/i.test(i)).length === 0;

    return {
      ok,
      issues: [...new Set(issues)].slice(0, 12),
      fixHints: [...new Set(fixHints)].slice(0, 12),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      staticKind: staticResult.kind,
      reviewerModel: opts.reviewerModel ?? 'deepseek_v4_flash',
      findings: parsed.findings,
    };
  } catch {
    // Still surface static validation if LLM QA fails
    if (staticResult.issues.length) {
      return {
        ok: staticResult.ok,
        issues: staticResult.issues,
        fixHints: staticResult.fixHints,
        inputTokens: 0,
        outputTokens: 0,
        staticKind: staticResult.kind,
        reviewerModel: opts.reviewerModel ?? 'deepseek_v4_flash',
        findings: [],
      };
    }
    return emptyFail;
  }
}
