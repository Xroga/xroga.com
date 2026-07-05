import { deepSeekChat } from '../../lib/deepseek.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { getSecret } from '../../config/envSecrets.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { buildLandingPage } from '../../services/builder/landingPage.js';
import { deepseekCode } from '../../services/code/codeClients.js';
import { resolveApiKey } from '../../config/apiKeyRouter.js';
import type { LandingPageOutput } from '../../types/features.js';
import { PHASE_7_EMIT, XROGA_TAGLINE } from './prompts.js';
import { PHASE_7_GAME_EMIT } from './gamePrompts.js';
import { normalizeBuildFiles } from '../../lib/normalizeBuildSource.js';

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
  clarifiedBrief: string,
  kind: 'website' | 'game' = 'website'
): Promise<string> {
  const user = `Brief:\n${clarifiedBrief}\n\nOriginal request:\n${userPrompt}\n\nApproved plan:\n${approvedPlan}\n\nVerified step code:\n${assembledCode.slice(0, 14000)}`;
  const systemPrompt = kind === 'game' ? PHASE_7_GAME_EMIT : PHASE_7_EMIT;

  if (resolveApiKey('deepseek', 'code')) {
    return deepseekCode(`${XROGA_USER_IDENTITY}\n\n${systemPrompt}`, user, { maxTokens: 8192 });
  }
  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${systemPrompt}` },
        { role: 'user', content: user },
      ],
      { model: 'deepseek-chat', maxTokens: 8192 }
    );
  }
  return deepseekGenerate(user);
}

const DEFAULT_CSS = `:root{--bg:#faf6f1;--text:#2c1810;--accent:#8b4513;--accent-light:#d4a574;--surface:#fff;--radius:12px;--shadow:0 4px 24px rgba(44,24,16,.08)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{position:sticky;top:0;z-index:50;background:var(--surface);box-shadow:var(--shadow)}
nav{max-width:1100px;margin:0 auto;padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}
nav .logo{font-weight:800;font-size:1.25rem;color:var(--accent)}
nav ul{display:flex;gap:1.5rem;list-style:none;flex-wrap:wrap}
nav a{color:var(--text);text-decoration:none;font-weight:500;transition:color .2s}
nav a:hover{color:var(--accent)}
.hero{text-align:center;padding:5rem 1.5rem;background:linear-gradient(135deg,var(--accent),var(--accent-light));color:#fff}
.hero h1{font-size:clamp(2rem,5vw,3rem);margin-bottom:1rem}
.hero p{font-size:1.125rem;opacity:.95;max-width:560px;margin:0 auto 2rem}
.btn{display:inline-block;padding:.75rem 1.75rem;background:#fff;color:var(--accent);border-radius:var(--radius);font-weight:700;text-decoration:none;transition:transform .2s,box-shadow .2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.15)}
section{max-width:1100px;margin:0 auto;padding:4rem 1.5rem}
section h2{font-size:1.75rem;margin-bottom:1.5rem;color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem}
.card{background:var(--surface);padding:1.5rem;border-radius:var(--radius);box-shadow:var(--shadow)}
footer{text-align:center;padding:2rem;background:var(--text);color:#fff;font-size:.875rem}
@media(max-width:640px){nav ul{gap:.75rem;font-size:.875rem}.hero{padding:3.5rem 1rem}}`;

/** Build deployable landing page from swarm-verified code (Phases 3–7), not a fresh Claude regen */
export async function buildLandingFromSwarmAssembly(
  assembledCode: string,
  userPrompt: string,
  approvedPlan: string,
  clarifiedBrief: string,
  kind: 'website' | 'game' = 'website'
): Promise<LandingPageOutput> {
  let site = parseAssembledProject(assembledCode);

  try {
    const consolidated = await consolidateWithDeepSeek(
      assembledCode,
      userPrompt,
      approvedPlan,
      clarifiedBrief,
      kind
    );
    const consolidatedSite = parseAssembledProject(consolidated);
    if (consolidatedSite?.html?.trim()) {
      site = consolidatedSite;
    }
  } catch (err) {
    console.warn('[assembleLanding] DeepSeek consolidate:', (err as Error).message);
  }

  if (!site?.html?.trim()) {
    const enriched = `${userPrompt}\n\nBrief:\n${clarifiedBrief}\n\nPlan:\n${approvedPlan}\n\nVerified code:\n${assembledCode.slice(0, 5000)}`;
    return buildLandingPage(enriched);
  }

  const html = ensureFullHtml(site.html, site.css, site.js);
  const css = site.css?.trim().length > 120 ? site.css.trim() : DEFAULT_CSS;
  const js =
    site.js?.trim() ||
    `document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const t=document.querySelector(a.getAttribute('href'));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'})}}));`;

  const normalized = normalizeBuildFiles(html, css, js);

  return {
    type: 'landing_page',
    html: normalized.html,
    css: normalized.css,
    js: normalized.js,
    heroImageUrl: 'https://placehold.co/1200x630/7c3aed/ffffff?text=XROGA+Build',
    deployUrl: '',
  };
}
