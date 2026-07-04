import type { ChatMessage } from '@/context/TerminalChatContext';
import { isSimpleChat, isTrivialPrompt } from '@/lib/promptClassifier';

const MAX_CONTEXT_TURNS = 10;
const MAX_SNIPPET = 320;

const UPDATE_HINT =
  /\b(update|change|edit|modify|redo|regenerate|same|previous|earlier|last|that image|those images|again)\b/i;

const BUILD_CLARIFICATION =
  /\b(let me understand|phase 1|what(?:'|'| is) the name|what colors|online ordering|clarifying|fully clarified|reply with)\b/i;

const BUILD_INTENT =
  /\b(build|create|make|design|develop)\b[\s\S]{0,60}\b(website|web\s*page|landing|site|app|shop|coffee|store|restaurant)\b/i;

const BUILD_ANSWER =
  /^[^,\n]{2,40},\s*[^,\n]{3,60},\s*(yes|no)\b/i;

function lastAssistantMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return messages[i];
  }
  return undefined;
}

function threadHasActiveBuild(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'user' && BUILD_INTENT.test(m.content ?? '')) return true;
    if (m.role === 'assistant' && BUILD_CLARIFICATION.test(m.content ?? '')) return true;
  }
  return false;
}

export function looksLikeBuildClarificationAnswer(prompt: string): boolean {
  const t = prompt.trim();
  if (t.length < 8) return false;
  if (BUILD_INTENT.test(t)) return false;
  if (BUILD_ANSWER.test(t)) return true;
  const hasComma = t.includes(',');
  const hasColors =
    /\b(brown|gold|dark|light|warm|minimal|pastel|black|white|blue|green|colorful)\b/i.test(t);
  const hasYesNo = /\b(yes|no)\b/i.test(t);
  return hasComma && hasColors && hasYesNo;
}

/** Assistant asked Phase 1 build questions — next user message continues the build. */
export function isPhase1BuildQuestion(text: string): boolean {
  return /\[Phase 1\]|let me understand what you need|what(?:'|'| is) the name of your project/i.test(
    text
  );
}

/** User wants to change name, colors, or sections after a build. */
export function isWebsiteUpdateRequest(prompt: string): boolean {
  const t = prompt.trim().toLowerCase();
  if (/\b(can i change|could you change|please change|i want to change)\b/.test(t)) return true;
  if (/\b(more updates|another update|add a new|add new|remove the|new section)\b/.test(t)) return true;
  if (/\b(improve|enhance|polish|refresh)\b/.test(t) && /\b(section|page|design|site|website|menu|hero)\b/.test(t)) {
    return true;
  }
  if (
    /\b(change|update|edit|modify|rename|switch|adjust|tweak|fix)\b/.test(t) &&
    /\b(name|color|theme|title|menu|section|page|design|logo|header|footer|gallery|order|hero|font|background|button|layout|content)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(make|turn)\s+it\s+(blue|red|green|darker|lighter|warmer|cooler|minimal|modern)\b/.test(t)) {
    return true;
  }
  if (/\b(changed?|changing)\s+(the\s+)?(color|name|theme|section|menu|design)\b/.test(t)) return true;
  return false;
}

export function threadHasCompletedWebsite(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.featureOutput && typeof m.featureOutput === 'object') {
      const o = m.featureOutput as { type?: string; deployUrl?: string };
      if (o.type === 'landing_page' && o.deployUrl) return true;
    }
    if (m.role === 'assistant' && /YOUR WEBSITE IS READY|Live Preview|Built website/i.test(m.content ?? '')) {
      return true;
    }
  }
  return false;
}

export function isWebsiteBuildUpdate(prompt: string, messages: ChatMessage[]): boolean {
  if (!isWebsiteUpdateRequest(prompt)) return false;
  return threadHasCompletedWebsite(messages);
}

/** User wants to build a website — triggers build pipeline UI and routing */
export function isWebsiteBuildPrompt(prompt: string): boolean {
  const t = prompt.trim();
  return /\b(build|create|make)\b[\s\S]{0,80}\b(website|web\s*page|landing|site|shop|coffee|store|restaurant|bakery|app)\b/i.test(
    t
  );
}

export function isBuildThreadContinuation(prompt: string, messages: ChatMessage[]): boolean {
  if (looksLikeBuildClarificationAnswer(prompt) && threadHasActiveBuild(messages)) return true;
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant?.content) return false;
  return (
    BUILD_CLARIFICATION.test(lastAssistant.content) &&
    looksLikeBuildClarificationAnswer(prompt)
  );
}

function isBuildClarificationFollowUp(prompt: string, messages: ChatMessage[]): boolean {
  if (messages.length < 2) return false;
  return isBuildThreadContinuation(prompt, messages);
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
      else if (o.type === 'landing_page')
        body = `[Built website: ${(o as { deployUrl?: string }).deployUrl ?? 'live preview'}]`;
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

  if (threadHasActiveBuild(messages)) {
    return formatContextBlock(messages, trimmed);
  }

  if (isWebsiteUpdateRequest(trimmed) && threadHasCompletedWebsite(messages)) {
    return formatContextBlock(messages, trimmed);
  }

  if (isWebsiteUpdateRequest(trimmed) && threadHasActiveBuild(messages)) {
    return formatContextBlock(messages, trimmed);
  }

  const wantsMemory =
    UPDATE_HINT.test(trimmed) ||
    (isSimpleChat(trimmed) && messages.length >= 4);
  if (!wantsMemory || messages.length < 2) return trimmed;

  return formatContextBlock(messages, trimmed);
}
