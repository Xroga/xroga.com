/**
 * Dual-pipeline router — Chat (conversation) vs Build (code generation).
 */

import type { FeatureCategory } from '../types/features.js';
import type { SwarmProgressEvent } from '../types/features.js';
import type { ChatTurn } from '../lib/conversationContext.js';
import { classifyPipelineIntent, type PipelineIntent } from './intentClassifier.js';
import { routingPrompt } from '../lib/promptRouting.js';

export interface DualPipelineContext {
  userId: string;
  prompt: string;
  history?: ChatTurn[];
  onProgress?: (event: SwarmProgressEvent) => void;
}

export interface DualPipelineRoute {
  intent: PipelineIntent;
  pipeline: 'chat' | 'build';
  featureCategory: FeatureCategory;
  userText: string;
}

/** Select chat or build pipeline with feature category hint. */
export function routeDualPipeline(ctx: DualPipelineContext): DualPipelineRoute {
  const userText = routingPrompt(ctx.prompt);
  const intent = classifyPipelineIntent(ctx.prompt, ctx.history);

  if (intent === 'build') {
    let featureCategory: FeatureCategory = 'landing_page';
    const lower = userText.toLowerCase();
    if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error)\b/i.test(lower)) {
      featureCategory = 'code_debug';
    } else if (/\b(scrape|automate|browser)\b/i.test(lower)) {
      featureCategory = 'browser_automation';
    } else if (/\b(game|pygame|unity)\b/i.test(lower)) {
      featureCategory = 'landing_page';
    }
    return { intent: 'build', pipeline: 'build', featureCategory, userText };
  }

  return { intent: 'chat', pipeline: 'chat', featureCategory: 'chat', userText };
}
