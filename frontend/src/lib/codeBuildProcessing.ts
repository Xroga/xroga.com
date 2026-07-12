import type { ChatMessage } from '@/context/TerminalChatContext';
import { isWebsiteBuildActive, isBuildThreadContinuation } from '@/lib/chatMemory';
import { requiresGitHubForBuild } from '@/lib/messageHelpers';

/** True when user is building code / software — shows agent to-do panel during processing */
export function isCodeBuildProcessing(
  prompt: string,
  messages: ChatMessage[],
  opts?: { completedBuildRef?: boolean }
): boolean {
  if (isWebsiteBuildActive(prompt, messages, opts)) return true;
  if (isBuildThreadContinuation(prompt, messages)) return true;
  if (requiresGitHubForBuild(prompt)) return true;
  return false;
}
