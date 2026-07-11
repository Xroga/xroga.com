import type { FeatureCategory, FeatureOutput } from '../types/features.js';
import { generateImage } from './builder/imageGen.js';
import { buildLandingPage } from './builder/landingPage.js';
import { runBrowserAutomation } from './automation/browser.js';
import { crossPost } from './social/crossPost.js';
import { conductDeepResearch } from './research/deepResearch.js';
import { debugCode } from './debugging/codeDebugger.js';
import { detectFeatureIntent } from '../lib/featureIntent.js';

/**
 * Execute a feature directly via real APIs — never text-only LLM hallucination.
 */
export async function executeFeature(
  category: FeatureCategory,
  prompt: string,
  ctx?: { userId?: string; projectId?: string; extras?: Record<string, unknown> }
): Promise<FeatureOutput> {
  const userId = ctx?.userId ?? 'anonymous';

  switch (category) {
    case 'image_generation':
      return await generateImage(prompt);
    case 'landing_page':
      return await buildLandingPage(prompt);
    case 'browser_automation':
      return await runBrowserAutomation(prompt);
    case 'deep_research':
      return await conductDeepResearch(userId, prompt, ctx?.projectId);
    case 'code_debug': {
      const code = (ctx?.extras?.code as string) ?? prompt;
      const filename = (ctx?.extras?.filename as string) ?? 'snippet.js';
      return await debugCode({ code, filename, language: ctx?.extras?.language as string | undefined });
    }
    case 'cross_post':
      return await crossPost(prompt, {});
    default:
      throw new Error(`Feature ${category} requires full swarm execution`);
  }
}

/** Resolve category: classifier result or strong intent rules */
export function resolveFeatureCategory(
  prompt: string,
  classified?: FeatureCategory
): FeatureCategory {
  const intent = detectFeatureIntent(prompt);
  if (intent !== 'chat') return intent;
  return classified ?? 'chat';
}
