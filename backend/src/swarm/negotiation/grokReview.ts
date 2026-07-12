/**
 * Grok self-review loop — Grok 4.5 fixes → Grok 4 Reasoning re-audits until PASS (max rounds).
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

const GROK_FIX_SYSTEM = `You are XROGA Code Fixer (Grok 4.5 Velocity). Apply the audit fixes to the code.
Return ONLY complete fenced html, css, and/or javascript blocks — no commentary.
Do not invent APIs. Keep the user's intent. Fix every issue listed.`;

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

/** Skeptical Grok 4 review — always reasoning mode, not 4.5. */
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

function looksLikeCode(text: string): boolean {
  const t = text.trim();
  return t.length > 80 && /```|<html|<!DOCTYPE|function\s|const\s|localStorage/.test(t);
}

const MAX_GROK_REVIEW_ROUNDS = 3;

/** Grok 4.5 fix → Grok 4 re-audit loop until PASS or max rounds. */
export async function runGrokCodeReviewLoop(
  assembledCode: string,
  userPrompt: string,
  tracker?: BuildUsageTracker,
  userId?: string
): Promise<{ code: string; pass: boolean; rounds: number }> {
  let code = assembledCode;

  for (let round = 0; round < MAX_GROK_REVIEW_ROUNDS; round++) {
    const review = await grokSelfReviewCode(code, userPrompt, tracker, userId);
    if (review.pass) {
      return { code, pass: true, rounds: round + 1 };
    }

    if (!review.fixInstructions && !review.issues) break;

    const { text: fixed } = await buildModelCall(
      'grok',
      GROK_FIX_SYSTEM,
      `User request:\n${userPrompt.slice(0, 1500)}\n\nAudit issues:\n${review.issues}\n\nFix instructions:\n${review.fixInstructions}\n\nCurrent code:\n${code.slice(0, 40_000)}`,
      16384,
      tracker,
      { userId, grokVariant: 'fast', claudeTask: 'qa' }
    );

    if (fixed && looksLikeCode(fixed)) {
      code = fixed;
    } else {
      break;
    }
  }

  const finalReview = await grokSelfReviewCode(code, userPrompt, tracker, userId);
  return { code, pass: finalReview.pass, rounds: MAX_GROK_REVIEW_ROUNDS };
}
