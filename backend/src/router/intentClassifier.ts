/**
 * Dual-pipeline intent classifier — routes "build" vs "chat".
 */

import { routingPrompt } from '../lib/promptRouting.js';
import {
  isBuildContinuation,
  isGeneralAdviceOrKnowledgePrompt,
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

  // Advice / strategy / Q&A must stay on chat — never a silent landing-page build
  if (isGeneralAdviceOrKnowledgePrompt(text)) return 'chat';

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

  // Removed bare "create/make + short text → build" — it stole "make a strategy" / "create a plan"

  return 'chat';
}

export function isBuildIntent(prompt: string): boolean {
  return classifyPipelineIntent(prompt) === 'build';
}
