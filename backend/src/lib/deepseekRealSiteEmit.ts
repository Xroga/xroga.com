/**
 * One DeepSeek Flash pass that MUST produce real product HTML — not a local scaffold.
 * Used when swarm assembly is empty, essay-like, or fell back to promptSiteScaffold.
 */

import { buildModelCall } from '../swarm/negotiation/buildModelRouter.js';
import type { BuildUsageTracker } from './buildUsageTracker.js';
import { parseAssembledProject } from './parseAssembledSite.js';
import { looksLikePromptScaffold, missingPromptFeatures } from './siteQualityGate.js';

const REAL_SITE_SYSTEM = `You are XROGA Architect using DeepSeek. Build the EXACT product the user asked for as a COMPLETE, polished static web app.

Output ONLY three fenced blocks:
\`\`\`html
...full index.html with DOCTYPE...
\`\`\`
\`\`\`css
...complete styles.css...
\`\`\`
\`\`\`javascript
...complete script.js...
\`\`\`

PRODUCT MATCH (mandatory):
- chatbot / AI assistant → chat UI (#messages, #chat-form), user/assistant bubbles, typing indicator, Enter-to-send, localStorage history, working theme toggle if asked, wire window.XrogaLiveAi.chat OR natural mock streaming replies — NOT a blog
- crypto / DeFi / swap / web3 → KPI cards, markets table, wallet UI, swap form, CoinGecko fetch on load (try/catch) — NOT a blog
- SaaS / marketplace / dashboard / CRM → that product shell — NOT a blog
- blog / journal ONLY if the user asked for a blog

HARD RULES:
- Real product UI — modern typography, CSS variables, flex/grid, hover states, mobile @media.
- EVERY control the user asked for must work (send, theme toggle, swap preview, nav) — no dead buttons.
- NEVER put the raw user prompt into an H1. Invent a short brand headline.
- NEVER output scaffold markers like "Custom site ·", "Layout seed", "Offer 1 tailored to", "OrbitSwap demo wallet".
- NEVER output essays, SEO tips, or "here is how to build".
- NEVER use emoji characters in HTML/CSS/JS. Use Lucide icons only:
  <script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js"></script>
  <i data-lucide="sun"></i> and lucide.createIcons() in script.js.
- NEVER set CTA href to https://xroga.com — use #contact, #pricing, or button handlers.
- Dark/light / night/day → id="theme-toggle" + data-theme + localStorage persist.
- Pricing / AI plans → #pricing with 3 real plan cards.
- Complete working JS — no "// TODO", no "...", no truncated blocks.`;

export async function emitRealSiteWithDeepSeek(
  userPrompt: string,
  opts?: {
    brief?: string;
    plan?: string;
    tracker?: BuildUsageTracker;
    userId?: string;
    maxTokens?: number;
    fixMissing?: string[];
  }
): Promise<{ html: string; css: string; js: string } | null> {
  const fixNote = opts?.fixMissing?.length
    ? `\n\nMISSING FEATURES TO ADD NOW: ${opts.fixMissing.join(', ')}. Keep the rest of the site.`
    : '';

  const user = `User request:\n${userPrompt.slice(0, 2000)}

Brief:\n${(opts?.brief || userPrompt).slice(0, 1500)}

Plan:\n${(opts?.plan || 'One-shot complete site').slice(0, 1200)}
${fixNote}

Build the FULL site now as three fenced blocks (html, css, javascript).`;

  try {
    const { text } = await buildModelCall(
      'flash',
      REAL_SITE_SYSTEM,
      user,
      opts?.maxTokens ?? 12288,
      opts?.tracker,
      { userId: opts?.userId }
    );
    const site = parseAssembledProject(text || '');
    if (!site?.html?.trim() || site.html.trim().length < 600) {
      console.warn('[deepseekRealSiteEmit] parse failed or too short', site?.html?.length ?? 0);
      return null;
    }
    if (looksLikePromptScaffold(site.html, site.css, site.js)) {
      console.warn('[deepseekRealSiteEmit] model returned scaffold-like HTML — rejecting');
      return null;
    }
    return { html: site.html, css: site.css || '', js: site.js || '' };
  } catch (err) {
    console.warn('[deepseekRealSiteEmit]', (err as Error).message?.slice(0, 160));
    return null;
  }
}

/** If site is missing features the prompt asked for, one Flash patch pass. */
export async function patchMissingSiteFeatures(
  prompt: string,
  site: { html: string; css: string; js: string },
  opts?: { tracker?: BuildUsageTracker; userId?: string }
): Promise<{ html: string; css: string; js: string }> {
  const missing = missingPromptFeatures(prompt, site.html, site.css, site.js);
  if (!missing.length) return site;

  const patched = await emitRealSiteWithDeepSeek(prompt, {
    brief: `Improve this site. Keep brand and layout. Add: ${missing.join(', ')}.`,
    plan: `Current HTML (truncate ok):\n${site.html.slice(0, 12000)}\n\nCSS:\n${site.css.slice(0, 6000)}\n\nJS:\n${site.js.slice(0, 6000)}`,
    tracker: opts?.tracker,
    userId: opts?.userId,
    maxTokens: 12288,
    fixMissing: missing,
  });
  return patched ?? site;
}
