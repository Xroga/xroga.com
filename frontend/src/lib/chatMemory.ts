import type { ChatMessage } from '@/context/TerminalChatContext';
import { isSimpleChat, isTrivialPrompt } from '@/lib/promptClassifier';

const MAX_CONTEXT_TURNS = 10;
const MAX_SNIPPET = 320;

const UPDATE_HINT =
  /\b(update|change|edit|modify|redo|regenerate|same|previous|earlier|last|that image|those images|again)\b/i;

const BUILD_CLARIFICATION =
  /\b(let me understand|phase 1|what(?:'|'| is) the name|what colors|online ordering|clarifying|fully clarified|reply with)\b/i;

const BUILD_INTENT =
  /\b(build|create|make|design|develop|launch|scaffold)\b[\s\S]{0,80}\b(website|web\s*page|landing|site|app|application|shop|store|saas|chatbot|bot|dashboard|crm|marketplace|platform|software|tool|game|api|portfolio|blog|restaurant|coffee|e[\s-]?commerce|crypto|blockchain|web3|defi|nft|wallet|token|dao)\b/i;

const NON_BUILD_MEDIA =
  /\b(generate|create|make|draw)\b[\s\S]{0,40}\b(image|picture|photo|logo|thumbnail|video|film|clip|research report|resume|cover letter)\b/i;

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

/** Site/UI nouns — required for most “update” phrases so advice is not misrouted. */
const SITE_UI_NOUN =
  /\b(website|site|webpage|web\s*page|landing|homepage|hero|navbar|nav\b|css|html|preview|deploy|header|footer|repo|github|codebase|section|menu|layout|stylesheet)\b/i;

/**
 * Business advice / strategy / research / Q&A — must stay on Phase 1 chat,
 * even inside a repo terminal that already built a site.
 */
export function isGeneralAdviceOrKnowledgePrompt(prompt: string): boolean {
  const t = prompt.trim();
  if (!t || isWebsiteBuildPrompt(t)) return false;
  // Explicit site-patch language wins over advice heuristics
  if (
    SITE_UI_NOUN.test(t) &&
    /\b(change|update|edit|fix|patch|delete|remove)\b/i.test(t) &&
    /\b(color|theme|button|section|hero|css|html|page|header|footer|deploy|preview)\b/i.test(t)
  ) {
    return false;
  }
  return (
    /\b(advice|advise|strategy|strategies|recommend|recommendation|should i|how (do|can|should) (i|we)|what (is|are|should|would|can)|explain|analyze|analysis|research|market|business|pricing|competitor|competitors|growth|marketing|revenue|current (news|data|trends|info|information)|best practice|opinion|tips?|guide me|help me (with|understand|decide))\b/i.test(
      t
    ) ||
    (/^(why|who|when|where|which)\b/i.test(t) && t.length < 280 && !SITE_UI_NOUN.test(t))
  );
}

/** User wants to change name, colors, or sections after a build. */
export function isWebsiteUpdateRequest(prompt: string): boolean {
  const t = prompt.trim().toLowerCase();
  // Never treat advice / strategy / research as a site patch
  if (isGeneralAdviceOrKnowledgePrompt(prompt)) return false;

  if (/\b(dark\s*mode|night\s*mode|day\s*mode|theme\s*toggle|light\s*mode)\b/.test(t)) return true;
  if (/\b(broken|doesn'?t\s+work|not\s+working)\b/.test(t) && /\b(button|link|toggle|form|menu)\b/.test(t)) {
    return true;
  }
  // "can I change…" only if clearly about the site/UI
  if (
    /\b(can i change|could you change|please change|i want to change)\b/.test(t) &&
    SITE_UI_NOUN.test(t)
  ) {
    return true;
  }
  if (
    /\b(more updates|another update|add a new|add new|remove the|new section)\b/.test(t) &&
    SITE_UI_NOUN.test(t)
  ) {
    return true;
  }
  if (/\b(improve|enhance|polish|refresh)\b/.test(t) && /\b(section|page|design|site|website|menu|hero)\b/.test(t)) {
    return true;
  }
  if (
    /\b(change|update|edit|modify|rename|switch|adjust|tweak|fix|patch)\b/.test(t) &&
    /\b(name|color|theme|title|menu|section|page|design|logo|header|footer|gallery|order|hero|font|background|button|layout)\b/.test(
      t
    ) &&
    (SITE_UI_NOUN.test(t) ||
      /\b(color|theme|logo|header|footer|hero|button|font|background|layout|menu|section)\b/.test(t))
  ) {
    return true;
  }
  // "update the content on the site" — content alone is not enough (matches "content strategy")
  if (
    /\b(change|update|edit|modify|fix|patch)\b/.test(t) &&
    /\bcontent\b/.test(t) &&
    SITE_UI_NOUN.test(t)
  ) {
    return true;
  }
  if (/\b(make|turn)\s+it\s+(blue|red|green|darker|lighter|warmer|cooler|minimal|modern|emerald)\b/.test(t)) {
    return true;
  }
  if (/\b(changed?|changing)\s+(the\s+)?(color|name|theme|section|menu|design)\b/.test(t)) return true;
  if (
    /\b(update|patch|push|apply|fix|edit)\b/.test(t) &&
    /\b(github|repo|preview|codebase|current (site|website|project)|selected repo|existing (repo|code|site))\b/.test(t)
  ) {
    return true;
  }
  if (/\b(same|current|existing)\s+preview\b/.test(t)) return true;
  return false;
}

export function threadHasCompletedWebsite(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.featureOutput && typeof m.featureOutput === 'object') {
      const o = m.featureOutput as {
        type?: string;
        deployUrl?: string;
        githubPushConfirmed?: boolean;
        githubRepoName?: string;
        generatedFiles?: string[];
        html?: string;
      };
      if (o.type === 'landing_page') {
        if (
          o.deployUrl ||
          o.githubPushConfirmed ||
          o.githubRepoName ||
          (o.generatedFiles?.length ?? 0) > 0 ||
          (o.html?.length ?? 0) > 80
        ) {
          return true;
        }
      }
    }
    if (m.role === 'assistant' && /YOUR WEBSITE IS READY|Live Preview|Built website|YOUR PROJECT IS LIVE/i.test(m.content ?? '')) {
      return true;
    }
  }
  return false;
}

/** True when a website build or post-build update is in progress — drives processing UI and suppresses code in chat. */
export function isWebsiteBuildActive(
  prompt: string,
  messages: ChatMessage[],
  opts?: { completedBuildRef?: boolean }
): boolean {
  if (isWebsiteBuildPrompt(prompt)) return true;
  if (isWebsiteBuildUpdate(prompt, messages)) return true;
  if (opts?.completedBuildRef && isWebsiteUpdateRequest(prompt)) return true;
  return false;
}

export function isWebsiteBuildUpdate(prompt: string, messages: ChatMessage[]): boolean {
  if (!isWebsiteUpdateRequest(prompt)) return false;
  return threadHasCompletedWebsite(messages);
}

/** User wants to build a product — triggers full build pipeline UI and routing */
export function isWebsiteBuildPrompt(prompt: string): boolean {
  const t = prompt.trim();
  if (NON_BUILD_MEDIA.test(t) && !/\b(website|site|blog|app|landing)\b/i.test(t)) return false;

  // Include "building/creating" — stemmed forms previously fell through to chat essays
  const buildVerb =
    /\b(build|building|create|creating|make|making|develop|developing|design|designing|launch|launching|scaffold|generate|generating)\b/i.test(
      t
    );
  const buildTarget =
    /\b(website|web\s*page|landing\s*page|site|web\s*app|shop|store|e[\s-]?commerce|portfolio|blog|restaurant|bakery|saas|crm|dashboard|marketplace|platform|chatbot|bot|assistant|tool|software|game|api|app|application|membership|forum|directory|invoice|tracker|planner|clone|startup|storefront|landing|landing page|crypto|blockchain|web3|defi|nft|wallet|token|dao|dapp|exchange|staking)\b/i.test(
      t
    );
  if (buildVerb && buildTarget) return true;

  if (
    buildVerb &&
    /\b(coffee|salon|gym|clinic|hotel|agency|nonprofit|school|construction|wedding|pet|dental|lawyer|real estate|fitness|yoga|photography|consulting|boutique|barber|plumbing|roofing|cleaning|auto repair|veterinary|bistro|pizza|pastry|spa|beauty|barber)\b/i.test(
      t
    )
  ) {
    return true;
  }

  // "simple blog website about AI" / "blog about X" — still a product build
  if (
    t.length < 180 &&
    /\b(blog|landing|portfolio)\b/i.test(t) &&
    /\b(website|site|page|about|for)\b/i.test(t)
  ) {
    return true;
  }

  return /\b(build|building|create|make)\b[\s\S]{0,100}\b(website|web\s*page|landing|site|blog|shop|coffee|store|restaurant|bakery|app)\b/i.test(
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
