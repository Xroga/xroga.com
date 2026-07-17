import type { ChatAttachment } from '@/lib/api';
import { isVideoGenerationPrompt } from '@/lib/parseImageContent';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import {
  isBuildThreadContinuation,
  isGeneralAdviceOrKnowledgePrompt,
  isWebsiteBuildPrompt,
  isWebsiteBuildUpdate,
  isWebsiteUpdateRequest,
} from '@/lib/chatMemory';
import { isTrivialPrompt } from '@/lib/promptClassifier';

interface ChatMessageLike {
  id?: string;
  role: string;
  content?: string;
}

const IMAGE_GEN_PROMPT =
  /\b(generate|create|make|draw|design)\b[\s\S]{0,50}\b(image|picture|photo|logo|thumbnail|poster|mockup|illustration)\b/i;

const BROWSER_AUTOMATION =
  /\b(automate|browser|scrape|fill form|linkedin jobs|apply to)\b/i;

/** Extra guard — catch product builds that slip past isWebsiteBuildPrompt into Phase 1 essays. */
function looksLikeProductBuild(prompt: string): boolean {
  const t = prompt.trim();
  if (!t) return false;
  if (
    /\b(build|building|create|creating|make|making|develop)\b[\s\S]{0,120}\b(website|site|blog|landing|portfolio|app|saas|dashboard|chatbot|chat\s*bot|crypto|web3|defi|swap|wallet|marketplace|crm|assistant|bot|platform)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (t.length < 180 && /\b(blog|landing|portfolio)\s+(website|site|page)\b/i.test(t)) return true;
  return false;
}

/** Route to Phase 1 engine for text AI; swarm handles builds, media, and attachments. */
export function shouldRouteToPhase1(
  prompt: string,
  messages: ChatMessageLike[],
  attachments?: ChatAttachment[],
  options?: { completedWebsiteBuild?: boolean; selectedRepo?: string | null }
): boolean {
  if (attachments?.length) return false;
  // Greetings / "hi" / thanks → cheap swarm fast-chat (never Phase 1 WOW essays + history bleed).
  if (isTrivialPrompt(prompt)) return false;
  // Builds must NEVER hit Phase 1 — it answers with long how-to essays instead of shipping code.
  if (looksLikeProductBuild(prompt) || isWebsiteBuildPrompt(prompt)) return false;
  if (isVideoGenerationPrompt(prompt)) return false;
  if (IMAGE_GEN_PROMPT.test(prompt)) return false;
  if (BROWSER_AUTOMATION.test(prompt)) return false;
  // Advice / strategy / research always stays on Phase 1 — even after a site build in #1 terminal
  if (isGeneralAdviceOrKnowledgePrompt(prompt)) return true;
  if (requiresGitHubForBuild(prompt) || isBuildThreadContinuation(prompt, messages as Parameters<typeof isBuildThreadContinuation>[1])) return false;
  if (isWebsiteBuildUpdate(prompt, messages as Parameters<typeof isWebsiteBuildUpdate>[1])) return false;
  // Site patches: prior build OR selected GitHub repo → negotiation incremental update (never how-to essays)
  if (isWebsiteUpdateRequest(prompt)) {
    if (options?.completedWebsiteBuild) return false;
    if (options?.selectedRepo?.includes('/')) return false;
  }
  return true;
}
