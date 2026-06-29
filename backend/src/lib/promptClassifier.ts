/** Classify prompt complexity for routing — fast chat vs full swarm */

import { detectFeatureIntent, requiresFeaturePipeline } from './featureIntent.js';

export { requiresFeaturePipeline, detectFeatureIntent };

const GREETING =
  /^(hi|hello|hey|yo|sup|hola|howdy|what'?s\s*up|good\s+(morning|afternoon|evening)|gm|gn)\b[!.,?\s]*$/i;

const TRIVIAL =
  /^(thanks|thank\s*you|thx|ok|okay|k|yes|no|yep|nope|bye|goodbye|see\s*ya|cool|nice|got\s*it)\b[!.,?\s]*$/i;

const BUILD_INTENT =
  /\b(build|create|make|generate|deploy|code|debug|fix|website|app|video|image|scrape|automate|research|script|api|game|3d|landing)\b/i;

export function isTrivialPrompt(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return true;
  if (t.length <= 24 && (GREETING.test(t) || TRIVIAL.test(t))) return true;
  return false;
}

/** Short conversational messages — use fast chat, not full 5-agent swarm */
export function isSimpleChat(prompt: string): boolean {
  const t = prompt.trim();
  if (isTrivialPrompt(t)) return true;
  if (t.length > 200) return false;
  if (BUILD_INTENT.test(t)) return false;
  return true;
}

export function shouldUseFastChat(prompt: string, category?: string): boolean {
  if (requiresFeaturePipeline(prompt)) return false;
  if (category && category !== 'chat') return false;
  return isSimpleChat(prompt);
}
