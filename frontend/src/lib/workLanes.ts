import type { ChatAttachment } from '@/lib/api';
import { isVideoGenerationPrompt } from '@/lib/parseImageContent';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';
import {
  isBuildThreadContinuation,
  isWebsiteBuildPrompt,
  isWebsiteBuildUpdate,
  isWebsiteUpdateRequest,
} from '@/lib/chatMemory';
import { isTrivialPrompt, isSimpleChat } from '@/lib/promptClassifier';
import { isCodeBuildProcessing } from '@/lib/codeBuildProcessing';
import { shouldRouteToPhase1 } from '@/lib/phase1Routing';

export type WorkLane = 'light' | 'heavy';

/** Minimal message shape — avoids circular import with TerminalChatContext */
interface LaneMessage {
  id?: string;
  role: string;
  content?: string;
  featureOutput?: unknown;
}

const IMAGE_GEN_PROMPT =
  /\b(generate|create|make|draw|design)\b[\s\S]{0,50}\b(image|picture|photo|logo|thumbnail|poster|mockup|illustration)\b/i;

const BROWSER_AUTOMATION =
  /\b(automate|browser|scrape|fill form|linkedin jobs|apply to)\b/i;

/** Explicit “build it now” phrasing — always heavy even mid-planning thread. */
const BUILD_NOW =
  /\b(build\s+it\s+now|start\s+building|go\s+ahead\s+and\s+build|ship\s+it\s+now|generate\s+the\s+(site|website|app)|create\s+the\s+(site|website|app)\s+now)\b/i;

/**
 * Light lane = chat, planning, research talk (always open alongside a build).
 * Heavy lane = website/build/update + other multi-model jobs (max 1 running).
 */
export function classifyWorkLane(
  prompt: string,
  messages: LaneMessage[],
  attachments?: ChatAttachment[],
  opts?: { completedWebsiteBuild?: boolean }
): WorkLane {
  if (attachments?.length) return 'heavy';
  if (isVideoGenerationPrompt(prompt)) return 'heavy';
  if (IMAGE_GEN_PROMPT.test(prompt)) return 'heavy';
  if (BROWSER_AUTOMATION.test(prompt)) return 'heavy';
  if (BUILD_NOW.test(prompt)) return 'heavy';
  if (
    isCodeBuildProcessing(prompt, messages as Parameters<typeof isCodeBuildProcessing>[1], {
      completedBuildRef: opts?.completedWebsiteBuild,
    })
  ) {
    return 'heavy';
  }
  if (isWebsiteBuildPrompt(prompt)) return 'heavy';
  if (requiresGitHubForBuild(prompt)) return 'heavy';
  if (isBuildThreadContinuation(prompt, messages as Parameters<typeof isBuildThreadContinuation>[1])) {
    return 'heavy';
  }
  if (isWebsiteBuildUpdate(prompt, messages as Parameters<typeof isWebsiteBuildUpdate>[1])) {
    return 'heavy';
  }
  if (opts?.completedWebsiteBuild && isWebsiteUpdateRequest(prompt)) return 'heavy';

  // Planning / Q&A / roadmaps stay light even if the thread previously built a site.
  if (shouldRouteToPhase1(prompt, messages, attachments, opts)) return 'light';
  if (isTrivialPrompt(prompt) || isSimpleChat(prompt)) return 'light';
  return 'light';
}

export function isHeavyLane(
  prompt: string,
  messages: LaneMessage[],
  attachments?: ChatAttachment[],
  opts?: { completedWebsiteBuild?: boolean }
): boolean {
  return classifyWorkLane(prompt, messages, attachments, opts) === 'heavy';
}

/** Next heavy queue position label (#2, #3, …) for toast / UI. */
export function nextHeavyQueuePosition(queue: Array<{ lane?: WorkLane }>): number {
  const heavyQueued = queue.filter((q) => (q.lane ?? 'heavy') === 'heavy').length;
  return heavyQueued + 2; // #1 is the running build
}
