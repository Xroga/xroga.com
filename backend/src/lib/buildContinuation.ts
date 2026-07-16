/**
 * Detect website build vs chat — route builds to negotiation engine, NOT fast chat.
 */

import { routingPrompt } from './promptRouting.js';

const BUILD_INTENT_IN_THREAD =
  /\b(build|create|make|develop|design)\b[\s\S]{0,80}\b(website|web\s*page|landing|site|coffee|shop|store|restaurant|bakery|app|game|software|salon|gym|clinic|portfolio|saas|crm|dashboard|crypto|blockchain|web3|chatbot|bot|api|platform|dapp|defi|nft)\b/i;

const PHASE_1_IN_THREAD =
  /\[Phase 1\]|starting your|steps planned|building your website|updating your website/i;

const BUILD_ANSWER =
  /^[^,\n]{2,40},\s*[^,\n]{3,60},\s*(yes|no)\b/i;

const COMPLETED_WEBSITE_MARKERS =
  /YOUR WEBSITE IS READY|SINGULARITY ACHIEVED|Live Preview|landing_page|Built website|\[Built website:/i;

/** Full prompt still has the memory wrapper from the frontend. */
export function hasThreadContext(prompt: string): boolean {
  return /\[Previous conversation for context/i.test(prompt);
}

export function threadText(prompt: string): string {
  const idx = prompt.indexOf('[Current message]');
  if (idx === -1) return prompt;
  return prompt.slice(0, idx);
}

export function threadHasBuildIntent(prompt: string): boolean {
  const prior = threadText(prompt);
  return BUILD_INTENT_IN_THREAD.test(prior) || PHASE_1_IN_THREAD.test(prior);
}

/** Current user line looks like "Cozy Cup, warm brown & gold, yes" */
export function looksLikeBuildClarificationAnswer(prompt: string): boolean {
  const current = routingPrompt(prompt).trim();
  if (current.length < 8) return false;
  if (BUILD_INTENT_IN_THREAD.test(current)) return false;

  if (BUILD_ANSWER.test(current)) return true;

  const hasComma = current.includes(',');
  const hasColors =
    /\b(brown|gold|dark|light|warm|minimal|pastel|black|white|blue|green|colorful)\b/i.test(current);
  const hasYesNo = /\b(yes|no)\b/i.test(current);
  const hasName = current.split(',')[0]?.trim().length >= 2;

  return hasComma && hasColors && (hasYesNo || hasName);
}

/** User is continuing a website build thread — route to negotiation, not chat. */
export function isBuildContinuation(prompt: string): boolean {
  if (/\b(use defaults|just build|build it now|go ahead)\b/i.test(routingPrompt(prompt))) {
    return hasThreadContext(prompt) ? threadHasBuildIntent(prompt) : false;
  }

  if (!hasThreadContext(prompt)) {
    return false;
  }

  return threadHasBuildIntent(prompt) && looksLikeBuildClarificationAnswer(prompt);
}

const SITE_UI_NOUN =
  /\b(website|site|webpage|web\s*page|landing|homepage|hero|navbar|nav\b|css|html|preview|deploy|header|footer|repo|github|codebase|section|menu|layout|stylesheet)\b/i;

/** Advice / strategy / research — must not enter negotiation website builds. */
export function isGeneralAdviceOrKnowledgePrompt(prompt: string): boolean {
  const t = routingPrompt(prompt);
  if (!t) return false;
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

/** User wants to update an existing website (name, colors, sections). */
export function isWebsiteUpdateRequest(prompt: string): boolean {
  const t = routingPrompt(prompt).toLowerCase();
  if (isGeneralAdviceOrKnowledgePrompt(prompt)) return false;

  if (/\b(dark\s*mode|night\s*mode|day\s*mode|theme\s*toggle|light\s*mode|night\s*\/\s*day|night\/day)\b/.test(t)) {
    return true;
  }
  if (/\b(broken|doesn'?t\s+work|not\s+working)\b/.test(t) && /\b(button|link|toggle|form|menu)\b/.test(t)) {
    return true;
  }
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
    /\b(name|color|theme|title|menu|section|page|design|logo|header|footer|gallery|order|hero|font|background|button|layout|toggle|night|day)\b/.test(
      t
    ) &&
    (SITE_UI_NOUN.test(t) ||
      /\b(color|theme|logo|header|footer|hero|button|font|background|layout|menu|section)\b/.test(t))
  ) {
    return true;
  }
  if (
    /\b(change|update|edit|modify|fix|patch)\b/.test(t) &&
    /\bcontent\b/.test(t) &&
    SITE_UI_NOUN.test(t)
  ) {
    return true;
  }
  if (/\b(make|turn)\s+it\s+(blue|red|green|darker|lighter|warmer|cooler|minimal|modern)\b/.test(t)) {
    return true;
  }
  if (/\b(changed?|changing)\s+(the\s+)?(color|name|theme|section|menu|design)\b/.test(t)) return true;
  // "update in current github / selected repo / same preview"
  if (
    /\b(update|patch|push|apply|fix|edit)\b/.test(t) &&
    /\b(github|repo|preview|codebase|current (site|website|project)|selected repo|existing (repo|code|site)|our (site|website|project))\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(same|current|existing)\s+preview\b/.test(t)) return true;
  if (/\bin\s+(the\s+)?(current|selected|existing)\s+(github\s+)?repo\b/.test(t)) return true;
  return false;
}

/**
 * Selected GitHub repo + clear site-update language → patch that repo.
 * Requires a real update intent — never “repo selected ⇒ every message is a build”.
 */
export function isSelectedRepoUpdateRequest(
  prompt: string,
  githubTargetRepo?: string | null
): boolean {
  if (!githubTargetRepo?.includes('/')) return false;
  if (isGeneralAdviceOrKnowledgePrompt(prompt)) return false;
  return isWebsiteUpdateRequest(prompt);
}

export function threadHasCompletedWebsite(prompt: string): boolean {
  const prior = hasThreadContext(prompt) ? threadText(prompt) : prompt;
  return COMPLETED_WEBSITE_MARKERS.test(prior);
}

export function historyHasCompletedWebsite(
  history?: Array<{ role: string; content: string }>
): boolean {
  return (
    history?.some(
      (h) =>
        COMPLETED_WEBSITE_MARKERS.test(h.content) ||
        /\[Built website:/i.test(h.content) ||
        /githubPushConfirmed|generatedFiles|landing_page/i.test(h.content)
    ) ?? false
  );
}

/** Update request after a completed build in the same thread. */
export function isWebsiteBuildUpdate(
  prompt: string,
  history?: Array<{ role: string; content: string }>
): boolean {
  if (!isWebsiteUpdateRequest(prompt)) return false;
  if (threadHasCompletedWebsite(prompt)) return true;
  if (historyHasCompletedWebsite(history)) return true;
  return false;
}

/** Any message in an active website project — not general chat. */
export function isActiveWebsiteProjectContext(
  prompt: string,
  history?: Array<{ role: string; content: string }>
): boolean {
  if (threadHasCompletedWebsite(prompt) || historyHasCompletedWebsite(history)) return true;
  if (hasThreadContext(prompt) && threadHasBuildIntent(prompt)) return true;
  if (history?.some((h) => BUILD_INTENT_IN_THREAD.test(h.content))) return true;
  return false;
}

/** Extract the original build request from thread context for planning. */
export function extractOriginalBuildRequest(prompt: string): string | null {
  const prior = threadText(prompt);
  const userLines = prior.match(/^User:\s*(.+)$/gim);
  if (!userLines?.length) return null;
  for (const line of userLines) {
    const text = line.replace(/^User:\s*/i, '').trim();
    if (BUILD_INTENT_IN_THREAD.test(text)) return text;
  }
  return userLines[0]?.replace(/^User:\s*/i, '').trim() ?? null;
}
