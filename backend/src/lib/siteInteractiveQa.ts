/**
 * Single DeepSeek Flash pass: fix broken buttons / dead JS before ship.
 * Merges fenced html/css/js into the site (never appends as comments).
 * Then runs deterministic polish (theme toggle, Lucide, dead links).
 */

import { deepSeekChat } from './deepseek.js';
import type { BuildUsageTracker } from './buildUsageTracker.js';
import { cachedPromptResult } from './promptResponseCache.js';
import { parseAssembledProject } from './parseAssembledSite.js';
import { polishShippedSite } from './siteShipPolish.js';

const QA_SYSTEM = `You are XROGA Interactive QA (DeepSeek).
Inspect HTML/CSS/JS for:
- Buttons/links that do nothing (missing href/onclick/handlers)
- Theme / night-day toggles that do not switch data-theme or .dark
- Forms that do not submit or have no feedback
- Nav items that do not scroll/navigate
- JS syntax errors or undefined references
- Placeholder CTAs and href="https://xroga.com" (replace with #contact or in-page handlers)
- Emoji used as icons (replace with Lucide: <i data-lucide="icon-name"></i> + lucide CDN)

HARD RULES:
- Never use emoji characters in the site.
- Use Lucide icons only (unpkg lucide UMD + lucide.createIcons()).
- Never link primary CTAs to xroga.com.
- Prefer minimal surgical fixes.

If everything works: reply with exactly PASS
If issues: return COMPLETE corrected fenced blocks only:
\`\`\`html
...\`\`\`
\`\`\`css
...\`\`\`
\`\`\`javascript
...\`\`\`
No essays.`;

function isPass(text: string): boolean {
  const t = text.trim();
  return /^pass\b/i.test(t) || /\bPASS\b/.test(t.slice(0, 80));
}

function siteToAssembly(site: { html: string; css: string; js: string }): string {
  return `\`\`\`html\n${site.html}\n\`\`\`\n\n\`\`\`css\n${site.css}\n\`\`\`\n\n\`\`\`javascript\n${site.js}\n\`\`\``;
}

function mergeQaIntoSite(
  base: { html: string; css: string; js: string },
  qaText: string
): { html: string; css: string; js: string; fixed: boolean } {
  const parsed = parseAssembledProject(qaText);
  if (!parsed?.html?.trim() && !parsed?.css?.trim() && !parsed?.js?.trim()) {
    return { ...base, fixed: false };
  }
  return {
    html: parsed.html?.trim().length > 200 ? parsed.html : base.html,
    css: parsed.css?.trim().length > 20 ? parsed.css : base.css,
    js: parsed.js?.trim().length > 20 ? parsed.js : base.js,
    fixed: true,
  };
}

export async function deepseekInteractiveQaFix(
  assembledCode: string,
  userPrompt: string,
  usageTracker?: BuildUsageTracker
): Promise<{ code: string; fixed: boolean }> {
  const base = parseAssembledProject(assembledCode) || {
    html: assembledCode,
    css: '',
    js: '',
  };

  const user = `User ask:\n${userPrompt.slice(0, 600)}\n\nCode:\n${assembledCode.slice(0, 48000)}`;
  let billed = false;
  let fixed = false;
  let site = { html: base.html || '', css: base.css || '', js: base.js || '' };

  try {
    const text = await cachedPromptResult(
      'deepseek-interactive-qa-v2',
      user,
      async () => {
        const out = await deepSeekChat(
          [
            { role: 'system', content: QA_SYSTEM },
            { role: 'user', content: user },
          ],
          { maxTokens: 8192 }
        );
        billed = true;
        return out;
      },
      2 * 60 * 60 * 1000
    );
    if (billed) {
      usageTracker?.add(
        'deepseek_flash',
        Math.ceil((QA_SYSTEM.length + user.length) / 4),
        Math.ceil((text?.length ?? 0) / 4)
      );
    }
    if (text?.trim() && !isPass(text) && /```/.test(text)) {
      const merged = mergeQaIntoSite(site, text);
      site = { html: merged.html, css: merged.css, js: merged.js };
      fixed = merged.fixed;
    }
  } catch (err) {
    console.warn('[siteInteractiveQa]', (err as Error).message?.slice(0, 120));
  }

  const polished = polishShippedSite(userPrompt, site);
  const changedPolish =
    polished.html !== site.html || polished.css !== site.css || polished.js !== site.js;
  return {
    code: siteToAssembly(polished),
    fixed: fixed || changedPolish,
  };
}
