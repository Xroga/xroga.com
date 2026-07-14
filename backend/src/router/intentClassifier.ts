/**
 * Dual-pipeline intent classifier — routes "build" vs "chat".
 */

import { routingPrompt } from '../lib/promptRouting.js';
import {
  isBuildContinuation,
  isWebsiteBuildUpdate,
  isWebsiteUpdateRequest,
} from '../lib/buildContinuation.js';
import { isProductBuildRequest } from '../lib/buildIntent.js';

export type PipelineIntent = 'build' | 'chat';

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

  // Blog / website / app product builds — NEVER chat how-to essays
  if (isProductBuildRequest(text)) return 'build';

  if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error|typescript|python|javascript)\b/i.test(text)) {
    return 'build';
  }

  if (/\b(build|building|create|make)\b/i.test(lower) && text.length < 140) return 'build';

  return 'chat';
}

export function isBuildIntent(prompt: string): boolean {
  return classifyPipelineIntent(prompt) === 'build';
}
