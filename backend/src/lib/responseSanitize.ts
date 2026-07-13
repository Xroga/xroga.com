/**
 * Sanitize model output — hide internal routing leaks WITHOUT rewriting
 * third-party product names the user asked about.
 */

import {
  detectThirdPartyProductQuestion,
  type ThirdPartyProduct,
} from './thirdPartyProduct.js';

/** Patterns that indicate internal model routing leaked — safe to mask. */
const INTERNAL_LEAK_PATTERNS: Array<[RegExp, string]> = [
  [/\b(powered by|routed to|using model)\s+(deepseek|grok|claude|gemini|anthropic|xai)\b/gi, 'using Xroga AI'],
  [/\b(deepseek|grok|claude|gemini)-[\w.-]+\b/gi, 'Xroga AI'],
  [/\bI am (the )?(DeepSeek|Grok|Claude|Gemini|GPT-4)\b/gi, 'I am Xroga AI'],
  [/\b(Black Hole V∞ · (Pulse Core|Architect|Reasoning|Velocity|Vision|Apex QA))\b/g, 'Xroga AI'],
];

const FABRICATED_XROGA_URL =
  /https?:\/\/[^\s)\]"']*xroga[^\s)\]"']*/gi;
const FABRICATED_XROGA_REDDIT =
  /\[([^\]]*)\]\(https?:\/\/[^\)]*reddit\.com\/r\/[^\)]*xroga[^\)]*\)/gi;
const FABRICATED_XROGA_MD_LINK =
  /\[([^\]]*Xroga[^\]]*)\]\(https?:\/\/[^\)]*\)/gi;

/** Fix responses where blanket sanitization wrongly replaced DeepSeek → Xroga AI. */
export function fixMisattributedThirdParty(
  userMessage: string,
  response: string,
  product: ThirdPartyProduct
): string {
  const name = product.name;
  let out = response;

  out = out.replace(/\bXroga AI AI\b/gi, name);
  out = out.replace(
    new RegExp(`Why your Xroga AI`, 'gi'),
    `Why your ${name}`
  );
  out = out.replace(
    new RegExp(`(about |for )Xroga AI(?= top-up| billing| payment| credit)`, 'gi'),
    `$1${name}`
  );
  out = out.replace(
    new RegExp(`Xroga AI's (automated )?risk`, 'gi'),
    `${name}'s risk`
  );
  out = out.replace(
    new RegExp(`Xroga AI (doesn't|does not|FAQ|API|support|billing)`, 'gi'),
    `${name} $1`
  );
  out = out.replace(
    new RegExp(`(known )?Xroga AI issue`, 'gi'),
    `$1${name} issue`
  );
  out = out.replace(
    new RegExp(`bypass Xroga AI's`, 'gi'),
    `use ${name}'s`
  );
  out = out.replace(
    new RegExp(`contact Xroga AI`, 'gi'),
    `contact ${name}`
  );
  out = out.replace(
    new RegExp(`Xroga AI models`, 'gi'),
    `${name} models`
  );
  out = out.replace(
    new RegExp(`purchasing Xroga AI API credits`, 'gi'),
    `purchasing ${name} API credits`
  );
  out = out.replace(
    new RegExp(`whitelist Xroga AI`, 'gi'),
    `whitelist ${name}`
  );
  out = out.replace(
    new RegExp(`(Source: )?\\[([^\\]]*Xroga[^\\]]*)\\]`, 'gi'),
    ''
  );

  out = out.replace(FABRICATED_XROGA_URL, (url) => {
    if (/api-docs|faq|reddit/i.test(url) && product.docsUrl) {
      return product.docsUrl;
    }
    return '';
  });
  out = out.replace(FABRICATED_XROGA_REDDIT, '');
  out = out.replace(FABRICATED_XROGA_MD_LINK, '');

  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/** Mask internal routing leaks only — never blanket-replace product names. */
export function sanitizeInternalModelLeaks(text: string, userMessage: string): string {
  const thirdParty = detectThirdPartyProductQuestion(userMessage);
  let out = text;

  for (const [pattern, replacement] of INTERNAL_LEAK_PATTERNS) {
    out = out.replace(pattern, replacement);
  }

  if (thirdParty) {
    out = fixMisattributedThirdParty(userMessage, out, thirdParty);
  }

  return out;
}
