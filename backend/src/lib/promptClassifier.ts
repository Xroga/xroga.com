/** Classify prompt complexity for routing — fast chat vs full swarm */

import { detectFeatureIntent, requiresFeaturePipeline } from './featureIntent.js';
import { routingPrompt } from './promptRouting.js';
import { isBuildContinuation, isWebsiteUpdateRequest, threadHasCompletedWebsite } from './buildContinuation.js';
import { isCapabilitiesQuery } from './xrogaCapabilities.js';
import { isMathQuery } from './mathQuery.js';

export { requiresFeaturePipeline, detectFeatureIntent };

const GREETING =
  /^(hi|hello|hey|yo|sup|hola|howdy|what'?s\s*up|good\s+(morning|afternoon|evening)|gm|gn)\b[!.,?\s]*$/i;

const TRIVIAL =
  /^(thanks|thank\s*you|thx|ok|okay|k|yes|no|yep|nope|bye|goodbye|see\s*ya|cool|nice|got\s*it)\b[!.,?\s]*$/i;

const BUILD_INTENT =
  /\b(build|building|create|creating|make|making|generate|deploy|code|debug|fix|website|blog|portfolio|app|video|image|scrape|automate|research|script|api|game|3d|landing)\b/i;

export function isTrivialPrompt(prompt: string): boolean {
  const t = routingPrompt(prompt).trim();
  if (!t) return true;
  if (t.length <= 24 && (GREETING.test(t) || TRIVIAL.test(t))) return true;
  return false;
}

/** Short conversational messages — use fast chat, not full 5-agent swarm */
export function isSimpleChat(prompt: string): boolean {
  const t = routingPrompt(prompt).trim();
  if (isCapabilitiesQuery(t)) return true;
  if (isMathQuery(t)) return true;
  if (isTrivialPrompt(t)) return true;
  if (t.length > 200) return false;
  if (BUILD_INTENT.test(t)) return false;
  return true;
}

export function shouldUseFastChat(prompt: string, category?: string): boolean {
  if (isBuildContinuation(prompt)) return false;
  if (isWebsiteUpdateRequest(prompt) && threadHasCompletedWebsite(prompt)) return false;
  const routeText = routingPrompt(prompt);
  if (isWebsiteUpdateRequest(routeText) && /\b(website|site|color|section|menu|theme)\b/i.test(routeText)) {
    return false;
  }
  // Never fast-chat product builds — they become long essays instead of shipping code
  if (
    /\b(build|building|create|make)\b[\s\S]{0,120}\b(blog|website|site|landing|portfolio|app|chatbot|chat\s*bot|crypto|web3|defi|swap|dashboard|saas|wallet|dapp|assistant|bot|platform)\b/i.test(
      routeText
    )
  ) {
    return false;
  }
  if (isCapabilitiesQuery(routeText)) return true;
  if (isMathQuery(routeText)) return true;
  if (requiresFeaturePipeline(routeText)) return false;
  if (category && category !== 'chat') return false;
  return isSimpleChat(routeText);
}
