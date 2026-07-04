/**
 * Detect when the user is continuing a website build (Phase 1 answers, etc.)
 * — must route to negotiation engine, NOT fast chat.
 */

import { routingPrompt } from './promptRouting.js';

const BUILD_INTENT_IN_THREAD =
  /\b(build|create|make|develop|design)\b[\s\S]{0,80}\b(website|web\s*page|landing|site|coffee|shop|store|restaurant|bakery|app)\b/i;

const PHASE_1_IN_THREAD =
  /\[Phase 1\]|let me understand what you need|what(?:'s| is) the name of your project|what colors do you like|online ordering/i;

const BUILD_ANSWER =
  /^[^,\n]{2,40},\s*[^,\n]{3,60},\s*(yes|no)\b/i;

/** Full prompt still has the memory wrapper from the frontend. */
export function hasThreadContext(prompt: string): boolean {
  return /\[Previous conversation for context/i.test(prompt);
}

export function threadText(prompt: string): string {
  const idx = prompt.indexOf('[Current message]');
  if (idx === -1) return prompt;
  return prompt.slice(0, idx);
}

export function threadHasBuildIntent(prompt: string): boolean {
  const prior = threadText(prompt);
  return BUILD_INTENT_IN_THREAD.test(prior) || PHASE_1_IN_THREAD.test(prior);
}

/** Current user line looks like "Cozy Cup, warm brown & gold, yes" */
export function looksLikeBuildClarificationAnswer(prompt: string): boolean {
  const current = routingPrompt(prompt).trim();
  if (current.length < 8) return false;
  if (BUILD_INTENT_IN_THREAD.test(current)) return false;

  if (BUILD_ANSWER.test(current)) return true;

  const hasComma = current.includes(',');
  const hasColors =
    /\b(brown|gold|dark|light|warm|minimal|pastel|black|white|blue|green|colorful)\b/i.test(current);
  const hasYesNo = /\b(yes|no)\b/i.test(current);
  const hasName = current.split(',')[0]?.trim().length >= 2;

  return hasComma && hasColors && (hasYesNo || hasName);
}

/** User is answering Phase 1 after "build a coffee shop website" — continue build pipeline. */
export function isBuildContinuation(prompt: string): boolean {
  if (/\b(use defaults|just build|build it now|go ahead)\b/i.test(routingPrompt(prompt))) {
    return hasThreadContext(prompt) ? threadHasBuildIntent(prompt) : false;
  }

  if (!hasThreadContext(prompt)) {
    return looksLikeBuildClarificationAnswer(prompt) && false;
  }

  return threadHasBuildIntent(prompt) && looksLikeBuildClarificationAnswer(prompt);
}

/** Extract the original build request from thread context for planning. */
export function extractOriginalBuildRequest(prompt: string): string | null {
  const prior = threadText(prompt);
  const userLines = prior.match(/^User:\s*(.+)$/gim);
  if (!userLines?.length) return null;
  for (const line of userLines) {
    const text = line.replace(/^User:\s*/i, '').trim();
    if (BUILD_INTENT_IN_THREAD.test(text)) return text;
  }
  return userLines[0]?.replace(/^User:\s*/i, '').trim() ?? null;
}
