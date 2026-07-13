/**
 * Cost-control policy for swarm builds.
 * Simple sites (blog, landing, portfolio) must use DeepSeek Flash + light Pro —
 * never Grok web/X search or Grok 4.5 review loops.
 */

export type BuildCostTier = 'simple_static' | 'standard' | 'premium';

/** True for blogs, landings, portfolios, marketing sites — cheap path */
export function isSimpleStaticBuild(prompt: string): boolean {
  const t = prompt.toLowerCase();
  if (/\b(crm|saas|dashboard|hackathon|crypto|web3|defi|nft|marketplace|enterprise|multi.?tenant)\b/.test(t)) {
    return false;
  }
  if (/\b(blog|landing|portfolio|personal site|marketing site|simple website|simple site|homepage|coffee shop|restaurant|bakery)\b/.test(t)) {
    return true;
  }
  // Short "build a website / site for X" without heavy keywords → treat as simple
  if (/\b(build|create|make)\b[\s\S]{0,40}\b(website|web site|site|web page|webpage)\b/.test(t) && t.length < 280) {
    return true;
  }
  return false;
}

export function getBuildCostTier(prompt: string): BuildCostTier {
  if (isSimpleStaticBuild(prompt)) return 'simple_static';
  if (/\b(hackathon|crypto|web3|defi|security audit|production saas)\b/i.test(prompt)) return 'premium';
  return 'standard';
}

export interface BuildCostPolicy {
  tier: BuildCostTier;
  /** Run SearXNG / free webSearch */
  allowWebResearch: boolean;
  /** Run Grok agent tools (web_search / x_search) — EXPENSIVE ($5/1k + tokens) */
  allowGrokAgentSearch: boolean;
  /** Grok synthesis of research notes */
  allowGrokResearchSynthesis: boolean;
  /** runGrokCodeReviewLoop — can be 4–7 Grok API calls */
  allowGrokReviewLoop: boolean;
  /** Max rounds inside Grok review loop when allowed */
  grokReviewMaxRounds: number;
  /** Allow pickGrokVariant → grok-4.5 (very expensive) */
  allowGrok45: boolean;
  /** Prefer DeepSeek Flash for UI polish instead of Sonnet when true */
  preferFlashUiPolish: boolean;
}

export function policyForPrompt(prompt: string): BuildCostPolicy {
  const tier = getBuildCostTier(prompt);
  if (tier === 'simple_static') {
    return {
      tier,
      allowWebResearch: false,
      allowGrokAgentSearch: false,
      allowGrokResearchSynthesis: false,
      allowGrokReviewLoop: false,
      grokReviewMaxRounds: 0,
      allowGrok45: false,
      preferFlashUiPolish: true,
    };
  }
  if (tier === 'premium') {
    return {
      tier,
      allowWebResearch: true,
      allowGrokAgentSearch: false, // still prefer free SearXNG; Grok tools are last resort
      allowGrokResearchSynthesis: true,
      allowGrokReviewLoop: true,
      grokReviewMaxRounds: 1,
      allowGrok45: false,
      preferFlashUiPolish: false,
    };
  }
  return {
    tier,
    allowWebResearch: true,
    allowGrokAgentSearch: false,
    allowGrokResearchSynthesis: false,
    allowGrokReviewLoop: true,
    grokReviewMaxRounds: 1,
    allowGrok45: false,
    preferFlashUiPolish: false,
  };
}
