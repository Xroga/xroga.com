/**
 * Grok self-review — STRICT cost control.
 * Default: max 1 audit round with Grok 4.3 only.
 * Fixes use DeepSeek Flash (not Grok 4.5).
 * Simple static builds should skip this entirely (see buildCostPolicy).
 */

import { buildModelCall } from './buildModelRouter.js';
import type { BuildUsageTracker } from '../../lib/buildUsageTracker.js';

const GROK_REVIEW_SYSTEM = `You are XROGA Code Auditor. Skeptically review generated code for:
- Invented libraries, CSS variables, or APIs
- Missing imports / broken event handlers
- Placeholder-only sections

Respond exactly:
VERDICT: PASS or FAIL
ISSUES: (bullet list — empty if PASS)
FIXES: (only if FAIL — concise instructions, not full rewrite)`;

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

/** Single Grok 4.3 audit — never Grok 4.5. */
export async function grokSelfReviewCode(
  assembledCode: string,
  userPrompt: string,
  tracker?: BuildUsageTracker,
  userId?: string
): Promise<GrokReviewResult> {
  const slice = assembledCode.slice(0, 24_000);
  const { text } = await buildModelCall(
    'grok',
    GROK_REVIEW_SYSTEM,
    `User request:\n${userPrompt.slice(0, 1200)}\n\nCode:\n${slice}`,
    1024,
    tracker,
    { userId, grokVariant: 'reasoning', claudeTask: 'qa' }
  );
  return parseGrokReview(text);
}

function looksLikeCode(text: string): boolean {
  const t = text.trim();
  return t.length > 80 && /```|<html|<!DOCTYPE|function\s|const\s|localStorage/.test(t);
}

/**
 * Cost-safe review: 1× Grok 4.3 audit + DeepSeek Flash fix (no multi-round Grok 4.5).
 */
export async function runGrokCodeReviewLoop(
  assembledCode: string,
  userPrompt: string,
  tracker?: BuildUsageTracker,
  userId?: string,
  maxRounds = 1
): Promise<{ code: string; pass: boolean; rounds: number }> {
  const rounds = Math.max(0, Math.min(maxRounds, 1));
  if (rounds === 0) {
    return { code: assembledCode, pass: true, rounds: 0 };
  }

  let code = assembledCode;
  const review = await grokSelfReviewCode(code, userPrompt, tracker, userId);
  if (review.pass) {
    return { code, pass: true, rounds: 1 };
  }

  if (!review.fixInstructions && !review.issues) {
    return { code, pass: false, rounds: 1 };
  }

  // Fix with DeepSeek Flash — NOT Grok 4.5
  const { text: fixed } = await buildModelCall(
    'flash',
    `Apply the audit fixes. Return ONLY fenced html/css/javascript blocks — no commentary.`,
    `User request:\n${userPrompt.slice(0, 1000)}\n\nAudit issues:\n${review.issues}\n\nFix instructions:\n${review.fixInstructions}\n\nCurrent code:\n${code.slice(0, 28_000)}`,
    12288,
    tracker,
    { userId, claudeTask: 'qa' }
  );

  if (fixed && looksLikeCode(fixed)) {
    code = fixed;
  }

  return { code, pass: false, rounds: 1 };
}
