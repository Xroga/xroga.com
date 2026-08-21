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
  /** The commit the reviewed files came from. Recorded in the review's evidence. */
  commitSha?: string;
}

/**
 * What the reviewer actually looked at.
 *
 * A verdict with no scope is not evidence. Previously the review reported a boolean and
 * nothing else, so "the reviewer passed it" could mean it read the whole project or the
 * first four files in array order, and no consumer could tell the difference.
 */
export interface ReviewScope {
  /** Every path whose content was placed in front of the reviewer. */
  examinedFiles: string[];
  /** Paths in the project the reviewer never saw. */
  unexaminedFiles: string[];
  /** Paths whose content was cut short by the size budget. */
  truncatedFiles: string[];
  totalFiles: number;
  /** True when anything was left out or cut short. */
  incomplete: boolean;
  /** The commit the review was performed against, when the caller supplied one. */
  commitSha?: string;
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
  /** Always present, including on the failure paths. */
  scope: ReviewScope;
}

const REVIEW_SYSTEM = `You are a strict QA reviewer for Xroga builds (static HTML, Next.js, or Expo).
Respond with JSON only: { "ok": boolean, "issues": string[], "fixHints": string[], "findings": [{ "severity": "low|medium|high|critical", "title": string, "evidence": string, "affectedFiles": string[] }] }.
- ok=true when the build satisfies the user prompt with no critical defects.
- For Next/Expo: check entry files, env usage (no hardcoded secrets), and that the ask was met.
- issues: concrete problems.
- fixHints: short, actionable repairs.
No markdown. No extra keys.`;

/**
 * Parses a reviewer response, failing closed on everything that is not an explicit pass.
 *
 * The defect this replaces: `ok: parsed.ok !== false`. Well-formed JSON that simply
 * omitted `ok` — `{"issues":[]}`, or `{}` — was read as a pass, because the only value
 * that could fail was a literal `false`. A reviewer that answered with an empty object,
 * or answered a different question, or returned a shape the prompt never asked for, was
 * indistinguishable from one that had checked the build and approved it.
 *
 * The rule now: `ok` must be present and must be the boolean `true`. Nothing else passes
 * — not `"true"`, not `1`, not absent.
 */
function parseReviewJson(text: string): Pick<ReviewBuildOutputResult, 'ok' | 'issues' | 'fixHints' | 'findings'> {
  const failClosed = (reason: string) => ({
    ok: false,
    issues: [reason],
    fixHints: [] as string[],
    findings: [] as ReviewBuildOutputResult['findings'],
  });

  const trimmed = text.trim();
  if (!trimmed) return failClosed('The reviewer returned nothing — treated as not reviewed.');

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return failClosed('The reviewer response was not a JSON object — treated as not reviewed.');
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return failClosed('The reviewer response could not be parsed — treated as not reviewed.');
  }

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((x): x is string => typeof x === 'string')
    : [];
  const fixHints = Array.isArray(parsed.fixHints)
    ? parsed.fixHints.filter((x): x is string => typeof x === 'string')
    : [];
  const findings = Array.isArray(parsed.findings)
    ? parsed.findings.flatMap((finding) => {
        if (!finding || typeof finding !== 'object') return [];
        const value = finding as Record<string, unknown>;
        if (typeof value.title !== 'string' || typeof value.evidence !== 'string') return [];
        const severity = ['low', 'medium', 'high', 'critical'].includes(String(value.severity))
          ? (value.severity as ReviewBuildOutputResult['findings'][number]['severity'])
          : 'medium';
        return [
          {
            severity,
            title: value.title,
            evidence: value.evidence,
            affectedFiles: Array.isArray(value.affectedFiles)
              ? value.affectedFiles.filter((item): item is string => typeof item === 'string')
              : [],
          },
        ];
      })
    : [];

  // The whole point. A missing status is not a pass, and neither is a truthy non-boolean.
  if (parsed.ok !== true) {
    const reason =
      parsed.ok === undefined
        ? 'The reviewer returned no verdict — a missing status is not a pass.'
        : typeof parsed.ok !== 'boolean'
          ? `The reviewer verdict was ${JSON.stringify(parsed.ok)}, which is not a boolean — treated as not passed.`
          : 'The reviewer did not pass the build.';
    return { ok: false, issues: issues.length ? issues : [reason], fixHints, findings };
  }

  return { ok: true, issues, fixHints, findings };
}

/** How much file content one reviewer call carries. */
export const REVIEW_BATCH_BYTES = 14_000;
/** How many reviewer calls a single review may make. Beyond this, files are omitted. */
export const REVIEW_MAX_BATCHES = 8;
/** No single file may consume the whole budget and starve the rest of the batch. */
const PER_FILE_BYTES = 6_000;

export interface ReviewBatch {
  sample: string;
  paths: string[];
  truncated: string[];
}

/**
 * Splits the changed files into deterministic bounded batches, each of which is reviewed.
 *
 * The defect this replaces: when none of eight preferred paths existed, the reviewer was
 * handed `files.slice(0, 4)` — the first four files in array order — with no disclosure
 * anywhere that the review had covered a fraction of the change. A defect in the fifth
 * changed file could not be found, and the resulting `ok: true` was indistinguishable
 * from one produced by reading the whole diff.
 *
 * Every changed file now lands in some batch. Batching is by path order so the same input
 * produces the same batches; a file larger than `PER_FILE_BYTES` is cut and named in
 * `truncated` rather than silently shortened. Only when the change exceeds
 * `REVIEW_MAX_BATCHES` worth of content is anything left out, and those paths are returned
 * as `omitted` so the caller can refuse to verify.
 */
export function buildReviewBatches(
  files: readonly ProjectFile[],
  changedFiles: readonly string[],
  options: { maxBytes?: number; maxBatches?: number; perFileBytes?: number } = {},
): { batches: ReviewBatch[]; omitted: string[] } {
  const maxBytes = options.maxBytes ?? REVIEW_BATCH_BYTES;
  const maxBatches = options.maxBatches ?? REVIEW_MAX_BATCHES;
  const perFileBytes = Math.min(options.perFileBytes ?? PER_FILE_BYTES, maxBytes);

  const changed = new Set(changedFiles);
  const toReview = changed.size ? files.filter((f) => changed.has(f.path)) : [...files];
  toReview.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const batches: ReviewBatch[] = [];
  let current: ReviewBatch | null = null;
  let used = 0;

  for (const file of toReview) {
    const heading = `### ${file.path}\n`;
    const body = file.content.slice(0, perFileBytes);
    const cost = heading.length + body.length + 2;

    if (!current || used + cost > maxBytes) {
      if (batches.length >= maxBatches) break;
      current = { sample: '', paths: [], truncated: [] };
      batches.push(current);
      used = 0;
    }

    current.sample += `${current.sample ? '\n\n' : ''}${heading}${body}`;
    current.paths.push(file.path);
    if (body.length < file.content.length) current.truncated.push(file.path);
    used += cost;
  }

  const covered = new Set(batches.flatMap((b) => b.paths));
  const omitted = toReview.filter((f) => !covered.has(f.path)).map((f) => f.path);
  return { batches, omitted };
}

/**
 * QA: static structure checks + LLM review of all changed files.
 *
 * The defects this replaces: `parsed.ok !== false` read a missing `ok` as a pass; the
 * reviewer was handed `files.slice(0, 4)` when none of eight preferred paths existed;
 * and no commit or file-list evidence was recorded.
 */
export async function reviewBuildOutput(
  opts: ReviewBuildOutputOpts,
): Promise<ReviewBuildOutputResult> {
  const model = opts.reviewerModel ?? 'deepseek_v4_flash';
  const emptyScope: ReviewScope = {
    examinedFiles: [],
    unexaminedFiles: opts.files?.map((f) => f.path) ?? [],
    truncatedFiles: [],
    totalFiles: opts.files?.length ?? 0,
    incomplete: true,
    commitSha: opts.commitSha,
  };
  const emptyFail: ReviewBuildOutputResult = {
    ok: false,
    issues: ['QA unavailable'],
    fixHints: ['Retry build'],
    inputTokens: 0,
    outputTokens: 0,
    reviewerModel: model,
    findings: [],
    scope: emptyScope,
  };

  const staticResult = opts.files?.length
    ? staticValidateProject(opts.files)
    : { ok: true, issues: [] as string[], fixHints: [] as string[], kind: 'static' as const };

  if (!opts.files?.length) {
    return {
      ok: staticResult.ok,
      issues: staticResult.issues,
      fixHints: staticResult.fixHints,
      inputTokens: 0,
      outputTokens: 0,
      reviewerModel: model,
      findings: [],
      staticKind: staticResult.kind,
      scope: emptyScope,
    };
  }

  const { batches, omitted } = buildReviewBatches(opts.files, opts.changedFiles ?? []);
  const scope: ReviewScope = {
    examinedFiles: batches.flatMap((b) => b.paths),
    unexaminedFiles: omitted,
    truncatedFiles: batches.flatMap((b) => b.truncated),
    totalFiles: batches.reduce((n, b) => n + b.paths.length, 0) + omitted.length,
    incomplete: omitted.length > 0 || batches.some((b) => b.truncated.length > 0),
    commitSha: opts.commitSha,
  };

  const issues = [...staticResult.issues];
  const fixHints = [...staticResult.fixHints];
  const findings: ReviewBuildOutputResult['findings'] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let reviewerPassed = batches.length > 0;

  for (const [index, batch] of batches.entries()) {
    const userPayload = {
      prompt: opts.prompt.slice(0, 4000),
      isUpdate: Boolean(opts.isUpdate),
      kind: staticResult.kind,
      // The inline site bodies belong to the first call only; repeating them per batch
      // would spend the batch budget re-sending content already reviewed.
      html: index === 0 ? opts.html.slice(0, 8000) : undefined,
      css: index === 0 ? opts.css.slice(0, 4000) : undefined,
      js: index === 0 ? opts.js.slice(0, 4000) : undefined,
      files: batch.sample,
      staticIssues: staticResult.issues,
      acceptanceCriteria: opts.acceptanceCriteria,
      architectureSummary: opts.architectureSummary,
      changedFiles: opts.changedFiles,
      validationResults: index === 0 ? opts.validationResults : undefined,
      securitySensitiveContext: opts.securitySensitiveContext,
      reviewScope: {
        batch: index + 1,
        ofBatches: batches.length,
        commitSha: opts.commitSha,
        filesInThisBatch: batch.paths,
        truncatedInThisBatch: batch.truncated,
        omittedFromReview: omitted,
      },
    };

    let text: string;
    try {
      const result = await (opts.completion ?? chatCompletion)(
        model,
        [
          { role: 'system', content: REVIEW_SYSTEM },
          {
            role: 'user',
            content: `Review this build against the user prompt.\n${JSON.stringify(userPayload)}`,
          },
        ],
        { maxTokens: 1024, temperature: 0.2, json: true },
      );
      text = result.text;
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
    } catch {
      // A provider failure is not a pass. The old catch path returned `staticResult.ok`,
      // so a build whose LLM review never happened could still be reported as reviewed.
      return {
        ...emptyFail,
        issues: [...new Set([
          ...issues,
          'QA unavailable',
          `The reviewer could not be reached for batch ${index + 1} of ${batches.length} — treated as not reviewed.`,
        ])].slice(0, 12),
        fixHints: [...new Set([...fixHints, 'Retry the review.'])].slice(0, 12),
        inputTokens,
        outputTokens,
        staticKind: staticResult.kind,
        findings,
        scope,
      };
    }

    const parsed = parseReviewJson(text);
    issues.push(...parsed.issues);
    fixHints.push(...parsed.fixHints);
    // A finding is evidence only if it says where it is and what commit it is against.
    findings.push(
      ...parsed.findings.map((finding) => ({
        ...finding,
        affectedFiles: finding.affectedFiles.length ? finding.affectedFiles : batch.paths,
      })),
    );
    if (!parsed.ok) reviewerPassed = false;
  }

  if (omitted.length) {
    // R10.3: a changed file the reviewer never saw cannot be verified, so the review does
    // not pass. Named, not summarised — "3 files omitted" is not actionable.
    issues.push(
      `The review did not cover ${omitted.length} changed file(s): ${omitted.slice(0, 8).join(', ')}${omitted.length > 8 ? ', …' : ''}. An unreviewed change is not verified.`,
    );
    fixHints.push('Split the change into smaller commits so every changed file can be reviewed.');
  }

  const ok =
    staticResult.ok &&
    reviewerPassed &&
    omitted.length === 0 &&
    issues.filter((i) => /missing|not valid|secret/i.test(i)).length === 0;

  return {
    ok,
    issues: [...new Set(issues)].slice(0, 12),
    fixHints: [...new Set(fixHints)].slice(0, 12),
    inputTokens,
    outputTokens,
    staticKind: staticResult.kind,
    reviewerModel: model,
    findings,
    scope,
  };
}
