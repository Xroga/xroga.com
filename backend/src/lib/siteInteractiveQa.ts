/**
 * Single DeepSeek Flash pass: fix broken buttons / dead JS before ship.
 * One model — avoids parallel Gemini/Mistral duplication.
 * Results cached by code hash so identical retries do not re-burn API.
 */

import { deepSeekChat } from './deepseek.js';
import type { BuildUsageTracker } from './buildUsageTracker.js';
import { cachedPromptResult } from './promptResponseCache.js';

const QA_SYSTEM = `You are XROGA Interactive QA (DeepSeek).
Inspect HTML/CSS/JS for:
- Buttons/links that do nothing (missing href/onclick/handlers)
- Forms that do not submit or have no feedback
- Nav items that do not scroll/navigate
- JS syntax errors or undefined references
- Placeholder-only CTAs

If everything works: reply with exactly PASS
If issues: return COMPLETE corrected fenced blocks only:
\`\`\`html
...\`\`\`
\`\`\`css
...\`\`\`
\`\`\`javascript
...\`\`\`
No essays. Prefer minimal surgical fixes.`;

function isPass(text: string): boolean {
  const t = text.trim();
  return /^pass\b/i.test(t) || /\bPASS\b/.test(t.slice(0, 80));
}

export async function deepseekInteractiveQaFix(
  assembledCode: string,
  userPrompt: string,
  usageTracker?: BuildUsageTracker
): Promise<{ code: string; fixed: boolean }> {
  const user = `User ask:\n${userPrompt.slice(0, 600)}\n\nCode:\n${assembledCode.slice(0, 48000)}`;
  let billed = false;
  const text = await cachedPromptResult(
    'deepseek-interactive-qa',
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
  if (!text?.trim() || isPass(text)) {
    return { code: assembledCode, fixed: false };
  }
  if (!/```/.test(text)) {
    return { code: assembledCode, fixed: false };
  }
  return {
    code: `${assembledCode}\n\n// --- DeepSeek interactive QA fixes ---\n${text}`,
    fixed: true,
  };
}
