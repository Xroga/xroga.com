import type { ChatAttachment } from '@/lib/api';
import { isVideoGenerationPrompt } from '@/lib/parseImageContent';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import {
  isBuildThreadContinuation,
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

/** Route to Phase 1 engine for text AI; swarm handles builds, media, and attachments. */
export function shouldRouteToPhase1(
  prompt: string,
  messages: ChatMessageLike[],
  attachments?: ChatAttachment[],
  options?: { completedWebsiteBuild?: boolean }
): boolean {
  if (attachments?.length) return false;
  // Greetings / "hi" / thanks → cheap swarm fast-chat (never Phase 1 WOW essays + history bleed).
  if (isTrivialPrompt(prompt)) return false;
  if (isVideoGenerationPrompt(prompt)) return false;
  if (IMAGE_GEN_PROMPT.test(prompt)) return false;
  if (BROWSER_AUTOMATION.test(prompt)) return false;
  if (requiresGitHubForBuild(prompt) || isBuildThreadContinuation(prompt, messages as Parameters<typeof isBuildThreadContinuation>[1])) return false;
  if (isWebsiteBuildPrompt(prompt) || isWebsiteBuildUpdate(prompt, messages as Parameters<typeof isWebsiteBuildUpdate>[1])) return false;
  if (options?.completedWebsiteBuild && isWebsiteUpdateRequest(prompt)) return false;
  return true;
}
