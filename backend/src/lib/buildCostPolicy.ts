/**
 * Cost-control policy for swarm builds.
 *
 * Grok 4.5 is allowed strategically (best brain for short strategy) —
 * NOT zero, NOT for bulk code / agent web search / multi-round loops.
 */

export type BuildCostTier = 'simple_static' | 'standard' | 'premium';

/** True for blogs, landings, portfolios, marketing sites — cheap path */
export function isSimpleStaticBuild(prompt: string): boolean {
  const t = prompt.toLowerCase();
  if (/\b(crm|saas|dashboard|hackathon|crypto|web3|defi|nft|marketplace|enterprise|multi.?tenant)\b/.test(t)) {
    return false;
  }
  if (
    /\b(blog|landing|portfolio|personal site|marketing site|simple website|simple site|homepage|coffee shop|restaurant|bakery)\b/.test(
      t
    )
  ) {
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
  /** Paid research synthesis step */
  allowGrokResearchSynthesis: boolean;
  /** Early-build Grok strategist call (short — best use of 4.5) */
  allowGrokStrategy: boolean;
  /** runGrokCodeReviewLoop — large context; prefer 4.3 not 4.5 */
  allowGrokReviewLoop: boolean;
  /** Max rounds inside Grok review loop when allowed */
  grokReviewMaxRounds: number;
  /** Allow Grok 4.5 for strategic short calls */
  allowGrok45: boolean;
  /** Use 4.5 (not 4.3) for the strategy step when allowGrok45 */
  preferGrok45ForStrategy: boolean;
  /** Hard cap: max Grok 4.5 API calls in one build */
  maxGrok45Calls: number;
  /** Max output tokens for a Grok 4.5 strategy call (keeps $ low) */
  grok45StrategyMaxTokens: number;
  /** Prefer DeepSeek Flash for UI polish instead of Sonnet when true */
  preferFlashUiPolish: boolean;
  /** Remap accidental Sonnet/Opus on simple builds; keep intentional Grok strategy */
  remapExpensiveRoles: boolean;
}

export function policyForPrompt(prompt: string): BuildCostPolicy {
  const tier = getBuildCostTier(prompt);
  if (tier === 'simple_static') {
    return {
      tier,
      allowWebResearch: false,
      allowGrokAgentSearch: false,
      allowGrokResearchSynthesis: false,
      // ONE short Grok 4.5 strategy (~$0.01–0.02) — then Flash/Pro does the rest
      allowGrokStrategy: true,
      allowGrokReviewLoop: false,
      grokReviewMaxRounds: 0,
      allowGrok45: true,
      preferGrok45ForStrategy: true,
      maxGrok45Calls: 1,
      grok45StrategyMaxTokens: 1536,
      preferFlashUiPolish: true,
      remapExpensiveRoles: true,
    };
  }
  if (tier === 'premium') {
    return {
      tier,
      allowWebResearch: true,
      allowGrokAgentSearch: false,
      allowGrokResearchSynthesis: true,
      allowGrokStrategy: true,
      allowGrokReviewLoop: true,
      grokReviewMaxRounds: 1,
      allowGrok45: true,
      preferGrok45ForStrategy: true,
      maxGrok45Calls: 2,
      grok45StrategyMaxTokens: 2048,
      preferFlashUiPolish: false,
      remapExpensiveRoles: false,
    };
  }
  // standard: 1× strategic 4.5 brain, then DeepSeek/Sonnet — no agent search, no review loop on 4.5
  return {
    tier,
    allowWebResearch: true,
    allowGrokAgentSearch: false,
    allowGrokResearchSynthesis: false,
    allowGrokStrategy: true,
    allowGrokReviewLoop: false,
    grokReviewMaxRounds: 0,
    allowGrok45: true,
    preferGrok45ForStrategy: true,
    maxGrok45Calls: 1,
    grok45StrategyMaxTokens: 2048,
    preferFlashUiPolish: false,
    remapExpensiveRoles: false,
  };
}

/**
 * Role remap for cost.
 * - Simple: Sonnet→Flash, Opus→Pro; Grok kept only when strategy is allowed.
 * - Elsewhere: if strategy off, accidental grok → Pro.
 */
export function costAwareRole(
  role: 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus',
  policy: BuildCostPolicy
): 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus' {
  if (policy.remapExpensiveRoles) {
    if (role === 'opus') return 'pro';
    if (role === 'sonnet') return 'flash';
    if (role === 'grok' && !policy.allowGrokStrategy) return 'pro';
    return role;
  }
  if (!policy.allowGrokStrategy && role === 'grok') return 'pro';
  return role;
}

/** Pick Grok 4.5 only for short strategy when policy allows; review stays 4.3. */
export function strategyGrokVariant(policy: BuildCostPolicy): 'reasoning' | 'fast' {
  if (policy.allowGrok45 && policy.preferGrok45ForStrategy) return 'fast';
  return 'reasoning';
}
