/**
 * Grok self-review — catches hallucinations, fake APIs, and "done but broken" code.
 * Uses Grok 4 reasoning (high effort) to audit output from Grok 4.5 / Flash passes.
 */

import { buildModelCall } from './buildModelRouter.js';
import type { BuildUsageTracker } from '../../lib/buildUsageTracker.js';

const GROK_REVIEW_SYSTEM = `You are XROGA Code Auditor (Grok 4 Reasoning). Your job is to SKEPTICALLY review generated code — Grok and other models often:
- Claim success when code is broken
- Invent libraries, CSS variables, or APIs that do not exist
- Ship hacky one-liners instead of correct fixes
- Leave missing imports, undefined handlers, or broken localStorage logic

Respond in this exact format:
VERDICT: PASS or FAIL
ISSUES: (bullet list — empty if PASS)
FIXES: (only if FAIL — concise instructions for what to change, not full rewrite)`;

export interface GrokReviewResult {
  pass: boolean;
  issues: string;
  fixInstructions: string;
}

export function parseGrokReview(text: string): GrokReviewResult {
  const verdict = /VERDICT:\s*(PASS|FAIL)/i.exec(text)?.[1]?.toUpperCase();
  const issuesMatch = /ISSUES:\s*([\s\S]*?)(?=FIXES:|$)/i.exec(text);
  const fixesMatch = /FIXES:\s*([\s\S]*?)$/i.exec(text);
  return {
    pass: verdict === 'PASS',
    issues: issuesMatch?.[1]?.trim() ?? '',
    fixInstructions: fixesMatch?.[1]?.trim() ?? '',
  };
}

/** Skeptical Grok 4 review before deploy — always reasoning mode, not 4.5. */
export async function grokSelfReviewCode(
  assembledCode: string,
  userPrompt: string,
  tracker?: BuildUsageTracker,
  userId?: string
): Promise<GrokReviewResult> {
  const slice = assembledCode.slice(0, 48_000);
  const { text } = await buildModelCall(
    'grok',
    GROK_REVIEW_SYSTEM,
    `User request:\n${userPrompt.slice(0, 2000)}\n\nGenerated code (html/css/js or fenced blocks):\n${slice}`,
    2048,
    tracker,
    { userId, grokVariant: 'reasoning', claudeTask: 'qa' }
  );
  return parseGrokReview(text);
}
