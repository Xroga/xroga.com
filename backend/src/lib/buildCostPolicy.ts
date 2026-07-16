/**
 * Cost-control policy for swarm builds.
 *
 * Grok 4.5 is part of Xroga (small monthly share) — NOT 0% overall —
 * but NEVER burned on basic blogs. Save 4.5 for standard/premium strategy.
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
  /** Remap expensive roles down on simple builds (Flash/Pro only) */
  remapExpensiveRoles: boolean;
  /** Plan review/agree loop iterations */
  maxPlanIterations: number;
  /** Per-step verify→correct attempts (Pro corrections are expensive) */
  maxStepCorrections: number;
  /** Cap plan steps so crypto doesn't run 7×120s Pro loops */
  maxBuildSteps: number;
  /** Use single Flash verify instead of Flash+Gemini+Mistral */
  lightVerifyAlways: boolean;
}

export function policyForPrompt(prompt: string): BuildCostPolicy {
  const tier = getBuildCostTier(prompt);
  if (tier === 'simple_static') {
    // Basic blog/landing: Flash + Pro ONLY. No Grok 4.5 — save it for harder builds.
    // Free SearXNG research is OK (no paid Tavily/Grok search).
    return {
      tier,
      allowWebResearch: true,
      allowGrokAgentSearch: false,
      allowGrokResearchSynthesis: false,
      allowGrokStrategy: false,
      allowGrokReviewLoop: false,
      grokReviewMaxRounds: 0,
      allowGrok45: false,
      preferGrok45ForStrategy: false,
      maxGrok45Calls: 0,
      grok45StrategyMaxTokens: 0,
      preferFlashUiPolish: true,
      remapExpensiveRoles: true,
      maxPlanIterations: 0,
      maxStepCorrections: 0,
      maxBuildSteps: 1,
      lightVerifyAlways: true,
    };
  }
  if (tier === 'premium') {
    // Crypto/hackathon: best work, lean cost — 1× short Grok 4.5 strategy, Flash UI,
    // SearXNG research (no expensive Grok research synthesis / review loop / Opus).
    // Hard step/correction caps stop 30min DeepSeek Pro burn loops.
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
      grok45StrategyMaxTokens: 1536,
      preferFlashUiPolish: true,
      remapExpensiveRoles: false,
      maxPlanIterations: 1,
      maxStepCorrections: 1,
      maxBuildSteps: 2,
      lightVerifyAlways: true,
    };
  }
  // standard: small strategic Grok 4.5 share (part of monthly mix, not 0%)
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
    preferFlashUiPolish: true,
    remapExpensiveRoles: false,
    maxPlanIterations: 1,
    maxStepCorrections: 1,
    maxBuildSteps: 3,
    lightVerifyAlways: true,
  };
}

/**
 * Role remap for cost.
 * Simple builds: grok/sonnet/opus → Flash/Pro only.
 */
export function costAwareRole(
  role: 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus',
  policy: BuildCostPolicy
): 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus' {
  if (policy.remapExpensiveRoles) {
    if (role === 'grok' || role === 'opus') return 'pro';
    if (role === 'sonnet') return 'flash';
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
