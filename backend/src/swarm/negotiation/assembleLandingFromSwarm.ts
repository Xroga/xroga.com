import { deepSeekChat } from '../../lib/deepseek.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { getSecret } from '../../config/envSecrets.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { buildLandingPage } from '../../services/builder/landingPage.js';
import { deepseekCode } from '../../services/code/codeClients.js';
import { resolveApiKey } from '../../config/apiKeyRouter.js';
import type { LandingPageOutput } from '../../types/features.js';
import { PHASE_7_EMIT, PHASE_7_CRM_EMIT, XROGA_TAGLINE } from './prompts.js';
import { PHASE_7_GAME_EMIT } from './gamePrompts.js';
import { normalizeBuildFiles } from '../../lib/normalizeBuildSource.js';
import { looksLikeGenericFallbackSite } from '../../lib/blogSiteTemplate.js';
import {
  generatePromptMatchedSite,
  heroPlaceholderForPrompt,
} from '../../lib/promptSiteScaffold.js';
import { mergeLiveAiIntoJs, needsLiveAiRuntime } from '../../lib/liveAiRuntime.js';
import {
  parseAssembledProject,
  type ParsedSiteCode,
} from '../../lib/parseAssembledSite.js';
import {
  isSubstantialSiteHtml,
  looksLikePromptScaffold,
} from '../../lib/siteQualityGate.js';
import {
  emitRealSiteWithDeepSeek,
  patchMissingSiteFeatures,
} from '../../lib/deepseekRealSiteEmit.js';
import type { BuildUsageTracker } from '../../lib/buildUsageTracker.js';

export { parseAssembledProject } from '../../lib/parseAssembledSite.js';

function withLiveAi(out: LandingPageOutput, prompt: string): LandingPageOutput {
  if (!needsLiveAiRuntime(prompt) || out.type !== 'landing_page') return out;
  if (/XrogaLiveAi|text\.pollinations\.ai/i.test(out.js || '')) return out;
  return {
    ...out,
    js: mergeLiveAiIntoJs(out.js || '', prompt),
  };
}

function ensureFullHtml(html: string, css: string, js: string): string {
  const body = html.trim();
  if (/<!DOCTYPE/i.test(body)) return body;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>XROGA Build</title>
<link rel="stylesheet" href="styles.css">
<!-- ${XROGA_TAGLINE} -->
</head>
<body>
${body}
<script src="script.js"></script>
</body>
</html>`;
}

function isUsableModelSite(site: ParsedSiteCode | null | undefined): boolean {
  if (!site?.html?.trim()) return false;
  if (looksLikePromptScaffold(site.html, site.css, site.js)) return false;
  if (looksLikeGenericFallbackSite(site.html, site.css ?? '')) return false;
  return isSubstantialSiteHtml(site.html) || site.html.trim().length > 1200;
}

function toLanding(
  site: { html: string; css: string; js: string },
  heroImageUrl: string,
  prompt: string
): LandingPageOutput {
  const html = ensureFullHtml(site.html, site.css, site.js);
  const css = site.css?.trim().length > 40 ? site.css.trim() : '';
  const js = site.js?.trim() || '';
  const normalized = normalizeBuildFiles(
    html,
    css ||
      'body{font-family:system-ui,sans-serif;margin:0;padding:0;line-height:1.5}',
    js
  );
  return withLiveAi(
    {
      type: 'landing_page',
      html: normalized.html,
      css: normalized.css,
      js: normalized.js,
      heroImageUrl,
      deployUrl: '',
      summary: 'AI-generated preview (DeepSeek)',
    },
    prompt
  );
}

async function tryRealDeepSeekSite(
  userPrompt: string,
  clarifiedBrief: string,
  approvedPlan: string,
  heroImageUrl: string,
  opts?: { tracker?: BuildUsageTracker; userId?: string }
): Promise<LandingPageOutput | null> {
  console.info('[assembleLanding] requesting real DeepSeek site emit (not scaffold)');
  const real = await emitRealSiteWithDeepSeek(userPrompt, {
    brief: clarifiedBrief,
    plan: approvedPlan,
    tracker: opts?.tracker,
    userId: opts?.userId,
    maxTokens: 12288,
  });
  if (!real) return null;
  const patched = await patchMissingSiteFeatures(userPrompt, real, {
    tracker: opts?.tracker,
    userId: opts?.userId,
  });
  if (looksLikePromptScaffold(patched.html, patched.css, patched.js)) return null;
  return toLanding(patched, heroImageUrl, userPrompt);
}

async function consolidateWithDeepSeek(
  assembledCode: string,
  userPrompt: string,
  approvedPlan: string,
  clarifiedBrief: string,
  kind: 'website' | 'game' = 'website'
): Promise<string> {
  const user = `Brief:\n${clarifiedBrief}\n\nOriginal request:\n${userPrompt}\n\nApproved plan:\n${approvedPlan}\n\nVerified step code:\n${assembledCode}

CRITICAL: Emit the product the user asked for. Crypto/dashboard → dashboard UI. SaaS → SaaS. Blog ONLY if they asked for a blog. Never rewrite a dashboard into a blog.
NEVER put the raw user prompt in an H1. NEVER output "Custom site ·" or "Layout seed" scaffolds.`;
  const isCrm = /\b(crm|contacts|deals pipeline|sales pipeline|sales dashboard)\b/i.test(userPrompt);
  const systemPrompt =
    kind === 'game' ? PHASE_7_GAME_EMIT : isCrm ? PHASE_7_CRM_EMIT : PHASE_7_EMIT;
  const maxTokens = 16384;

  if (resolveApiKey('deepseek', 'code')) {
    return deepseekCode(`${XROGA_USER_IDENTITY}\n\n${systemPrompt}`, user, {
      maxTokens,
      timeoutMs: 90_000,
    });
  }
  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${systemPrompt}` },
        { role: 'user', content: user },
      ],
      { model: 'deepseek-chat', maxTokens, timeoutMs: 90_000 }
    );
  }
  return deepseekGenerate(user);
}

/**
 * Prefer real DeepSeek HTML. Local promptSiteScaffold is LAST RESORT only.
 */
export async function buildLandingFromSwarmAssembly(
  assembledCode: string,
  userPrompt: string,
  approvedPlan: string,
  clarifiedBrief: string,
  kind: 'website' | 'game' = 'website',
  opts?: {
    skipConsolidate?: boolean;
    allowScaffoldFallback?: boolean;
    tracker?: BuildUsageTracker;
    userId?: string;
  }
): Promise<LandingPageOutput> {
  let site = parseAssembledProject(assembledCode);
  const promptForScaffold = userPrompt || clarifiedBrief;
  const heroImageUrl = heroPlaceholderForPrompt(promptForScaffold);
  const allowScaffold = opts?.allowScaffoldFallback !== false;

  // Path A: skip long consolidate — still try real DeepSeek if assembly is bad/scaffold
  if (opts?.skipConsolidate) {
    if (isUsableModelSite(site)) {
      const patched = await patchMissingSiteFeatures(
        promptForScaffold,
        { html: site!.html, css: site!.css || '', js: site!.js || '' },
        { tracker: opts.tracker, userId: opts.userId }
      );
      return toLanding(patched, heroImageUrl, promptForScaffold);
    }

    const real = await tryRealDeepSeekSite(
      userPrompt,
      clarifiedBrief,
      approvedPlan,
      heroImageUrl,
      { tracker: opts.tracker, userId: opts.userId }
    );
    if (real) return real;

    if (!allowScaffold) {
      return {
        type: 'landing_page',
        html: site?.html?.trim() || '',
        css: site?.css?.trim() || '',
        js: site?.js?.trim() || '',
        heroImageUrl,
        deployUrl: '',
      };
    }

    console.warn('[assembleLanding] DeepSeek emit failed — last-resort scaffold');
    const matched = generatePromptMatchedSite(promptForScaffold);
    const normalized = normalizeBuildFiles(matched.html, matched.css, matched.js);
    return withLiveAi(
      {
        type: 'landing_page',
        html: normalized.html,
        css: normalized.css,
        js: normalized.js,
        heroImageUrl,
        deployUrl: '',
        summary: 'Fallback scaffold (AI emit unavailable)',
      },
      promptForScaffold
    );
  }

  // Path B: consolidate with DeepSeek, then quality gate
  try {
    const consolidated = await consolidateWithDeepSeek(
      assembledCode,
      userPrompt,
      approvedPlan,
      clarifiedBrief,
      kind
    );
    const consolidatedSite = parseAssembledProject(consolidated);
    if (isUsableModelSite(consolidatedSite)) {
      site = consolidatedSite;
    }
  } catch (err) {
    console.warn('[assembleLanding] DeepSeek consolidate:', (err as Error).message);
  }

  if (isUsableModelSite(site)) {
    const patched = await patchMissingSiteFeatures(
      promptForScaffold,
      { html: site!.html, css: site!.css || '', js: site!.js || '' },
      { tracker: opts?.tracker, userId: opts?.userId }
    );
    return toLanding(patched, heroImageUrl, promptForScaffold);
  }

  const real = await tryRealDeepSeekSite(
    userPrompt,
    clarifiedBrief,
    approvedPlan,
    heroImageUrl,
    { tracker: opts?.tracker, userId: opts?.userId }
  );
  if (real) return real;

  try {
    const enriched = `${userPrompt}\n\nBrief:\n${clarifiedBrief}\n\nPlan:\n${approvedPlan}`;
    const built = await buildLandingPage(enriched);
    if (
      built.html?.trim() &&
      !looksLikePromptScaffold(built.html, built.css, built.js || '') &&
      !looksLikeGenericFallbackSite(built.html, built.css)
    ) {
      return withLiveAi(built, promptForScaffold);
    }
  } catch {
    /* fall through */
  }

  console.warn('[assembleLanding] all AI paths failed — scaffold last resort');
  const matched = generatePromptMatchedSite(promptForScaffold);
  const normalizedMatched = normalizeBuildFiles(matched.html, matched.css, matched.js);
  return withLiveAi(
    {
      type: 'landing_page',
      html: normalizedMatched.html,
      css: normalizedMatched.css,
      js: normalizedMatched.js,
      heroImageUrl,
      deployUrl: '',
      summary: 'Fallback scaffold (AI emit unavailable)',
    },
    promptForScaffold
  );
}
