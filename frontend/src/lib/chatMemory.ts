import type { ChatMessage } from '@/context/TerminalChatContext';
import { isSimpleChat, isTrivialPrompt } from '@/lib/promptClassifier';

const MAX_CONTEXT_TURNS = 10;
const MAX_SNIPPET = 320;

const UPDATE_HINT =
  /\b(update|change|edit|modify|redo|regenerate|same|previous|earlier|last|that image|those images|again)\b/i;

const BUILD_CLARIFICATION =
  /\b(let me understand|quick questions|tech stack|clarifying|fully clarified|reply with)\b/i;

const BUILD_INTENT = /\b(build|create|make|design|develop)\b[\s\S]{0,40}\b(website|web\s*page|landing|site|app|shop|coffee)\b/i;

function lastAssistantMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return messages[i];
  }
  return undefined;
}

function isBuildClarificationFollowUp(prompt: string, messages: ChatMessage[]): boolean {
  if (messages.length < 2) return false;
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant?.content) return false;
  const assistantAsked = BUILD_CLARIFICATION.test(lastAssistant.content);
  const userAnswering = prompt.trim().length >= 12 && !BUILD_INTENT.test(prompt);
  return assistantAsked && userAnswering;
}

function formatContextBlock(messages: ChatMessage[], current: string): string {
  const recent = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.featureOutput))
    .slice(-MAX_CONTEXT_TURNS);

  const lines = recent.map((m) => {
    const label = m.role === 'user' ? 'User' : 'Assistant';
    let body = m.content?.trim() ?? '';
    if (!body && m.featureOutput && typeof m.featureOutput === 'object') {
      const o = m.featureOutput as { type?: string; title?: string; prompt?: string };
      if (o.type === 'image') body = `[Generated image: ${o.prompt ?? o.title ?? 'image'}]`;
      else if (o.type === 'video_studio') body = `[Generated video: ${o.title ?? 'video'}]`;
    }
    return `${label}: ${body.slice(0, MAX_SNIPPET)}`;
  });

  return `[Previous conversation for context — refer when user asks about earlier messages]\n${lines.join('\n')}\n\n[Current message]\n${current}`;
}

/** Inject recent thread context for conversational memory across chat and media follow-ups. */
export function buildPromptWithMemory(prompt: string, messages: ChatMessage[]): string {
  const trimmed = prompt.trim();
  if (isTrivialPrompt(trimmed)) return trimmed;

  if (isBuildClarificationFollowUp(trimmed, messages)) {
    return formatContextBlock(messages, trimmed);
  }

  const wantsMemory =
    UPDATE_HINT.test(trimmed) ||
    (isSimpleChat(trimmed) && messages.length >= 4);
  if (!wantsMemory || messages.length < 2) return trimmed;

  return formatContextBlock(messages, trimmed);
}
