/**
 * Dual-pipeline intent classifier — routes "build" vs "chat".
 */

import { routingPrompt } from '../lib/promptRouting.js';
import {
  isBuildContinuation,
  isWebsiteBuildUpdate,
  isWebsiteUpdateRequest,
} from '../lib/buildContinuation.js';

export type PipelineIntent = 'build' | 'chat';

const BUILD_KEYWORDS =
  /\b(build|create|make|generate|code|website|web\s*page|landing|site|app|game|software|develop|design|program|deploy|scaffold|prototype)\b/i;

const STRONG_BUILD =
  /\b(build|create|make|generate|develop)\b[\s\S]{0,60}\b(website|web\s*app|web\s*page|landing|site|coffee|shop|store|restaurant|app|game|software|api|script|component)\b/i;

/** Classify user message into build pipeline or chat pipeline. */
export function classifyPipelineIntent(
  prompt: string,
  history?: Array<{ role: string; content: string }>
): PipelineIntent {
  const text = routingPrompt(prompt).trim();
  const lower = text.toLowerCase();

  if (isBuildContinuation(prompt)) return 'build';
  if (isWebsiteBuildUpdate(prompt, history)) return 'build';
  if (isWebsiteUpdateRequest(text) && history?.some((h) => /Built website|YOUR WEBSITE IS READY/i.test(h.content))) {
    return 'build';
  }

  if (STRONG_BUILD.test(text)) return 'build';
  if (BUILD_KEYWORDS.test(text) && /\b(for me|now|please|a\s+\w+)/i.test(text)) return 'build';

  if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error|typescript|python|javascript)\b/i.test(text)) {
    return 'build';
  }

  if (/\b(build|create|make)\b/i.test(lower) && text.length < 120) return 'build';

  return 'chat';
}

export function isBuildIntent(prompt: string): boolean {
  return classifyPipelineIntent(prompt) === 'build';
}
