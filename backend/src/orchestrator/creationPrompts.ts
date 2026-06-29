import type { FeatureCategory } from '../types/features.js';
import { buildFullSystemPrompt, CATEGORY_TRAINING } from './aiTraining.js';

/** Creation-area training prompts — injected into Builder per artifact type */

export const CREATION_SYSTEM_PROMPTS: Partial<Record<FeatureCategory | string, string>> = {
  chat: CATEGORY_TRAINING.chat!,
  landing_page: CATEGORY_TRAINING.landing_page!,
  image_generation: CATEGORY_TRAINING.image_generation!,
  video_studio: CATEGORY_TRAINING.video_studio!,
  browser_automation: CATEGORY_TRAINING.browser_automation!,
  code_debug: CATEGORY_TRAINING.code_debug!,
  deep_research: CATEGORY_TRAINING.deep_research!,
  cross_post: CATEGORY_TRAINING.cross_post!,
  job_hunter: CATEGORY_TRAINING.job_hunter!,
  content_blocker: CATEGORY_TRAINING.content_blocker!,
  key_creation: CATEGORY_TRAINING.key_creation!,
};

export function getCreationSystemPrompt(category: FeatureCategory, userPrompt: string): string {
  return buildFullSystemPrompt(category, userPrompt);
}
