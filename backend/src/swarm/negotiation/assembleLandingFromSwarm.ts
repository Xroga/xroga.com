import { deepSeekChat } from '../../lib/deepseek.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { getSecret } from '../../config/envSecrets.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { buildLandingPage } from '../../services/builder/landingPage.js';
import type { LandingPageOutput } from '../../types/features.js';
import { PHASE_7_EMIT, XROGA_TAGLINE } from './prompts.js';

interface ParsedSiteCode {
  html: string;
  css: string;
  js: string;
}

function extractFencedBlocks(code: string): ParsedSiteCode {
  const pick = (lang: string): string => {
    const re = new RegExp('```' + lang + '\\s*([\\s\\S]*?)```', 'i');
    const m = code.match(re);
    return m?.[1]?.trim() ?? '';
  };

  let html = pick('html') || pick('htm');
  let css = pick('css');
  let js = pick('javascript') || pick('js');

  if (!html && /<!DOCTYPE|<html[\s>]/i.test(code)) {
    const m = code.match(/<!DOCTYPE[\s\S]*?<\/html>/i);
    html = m?.[0]?.trim() ?? '';
  }

  if (!css) {
    const styleTag = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleTag?.[1]) css = styleTag[1].trim();
  }

  return { html, css, js };
}

function parseJsonSite(raw: string): ParsedSiteCode | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as ParsedSiteCode;
    if (parsed.html?.trim() && parsed.css?.trim()) return parsed;
  } catch {
    /* try other parsers */
  }
  return null;
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

export function parseAssembledProject(assembledCode: string): ParsedSiteCode | null {
  const fromJson = parseJsonSite(assembledCode);
  if (fromJson) return fromJson;

  const blocks = extractFencedBlocks(assembledCode);
  if (blocks.html.trim()) return blocks;

  return null;
}

async function consolidateWithDeepSeek(
  assembledCode: string,
  userPrompt: string,
  approvedPlan: string,
  clarifiedBrief: string
): Promise<string> {
  const user = `Brief:\n${clarifiedBrief}\n\nOriginal request:\n${userPrompt}\n\nApproved plan:\n${approvedPlan}\n\nVerified step code:\n${assembledCode.slice(0, 12000)}`;

  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${PHASE_7_EMIT}` },
        { role: 'user', content: user },
      ],
      { model: 'deepseek-chat', maxTokens: 8192 }
    );
  }
  return deepseekGenerate(user);
}

/** Build deployable landing page from swarm-verified code (Phases 3–7), not a fresh Claude regen */
export async function buildLandingFromSwarmAssembly(
  assembledCode: string,
  userPrompt: string,
  approvedPlan: string,
  clarifiedBrief: string
): Promise<LandingPageOutput> {
  let site = parseAssembledProject(assembledCode);

  if (!site?.html?.trim()) {
    const consolidated = await consolidateWithDeepSeek(
      assembledCode,
      userPrompt,
      approvedPlan,
      clarifiedBrief
    );
    site = parseAssembledProject(consolidated);
  }

  if (!site?.html?.trim()) {
    const enriched = `${userPrompt}\n\nBrief:\n${clarifiedBrief}\n\nPlan:\n${approvedPlan}\n\nVerified code:\n${assembledCode.slice(0, 5000)}`;
    return buildLandingPage(enriched);
  }

  const html = ensureFullHtml(site.html, site.css, site.js);
  const css = site.css?.trim() || 'body{font-family:system-ui,sans-serif;margin:0;padding:0;}';
  const js = site.js?.trim() || '';

  return {
    type: 'landing_page',
    html,
    css,
    js,
    heroImageUrl: 'https://placehold.co/1200x630/7c3aed/ffffff?text=XROGA+Build',
    deployUrl: '',
  };
}
