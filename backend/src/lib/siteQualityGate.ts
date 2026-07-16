/**
 * Detect local Xroga scaffolds vs real model HTML, and missing prompt features.
 */

/** Deterministic promptSiteScaffold / Escape Pod fingerprints users screenshot as "fake". */
export function looksLikePromptScaffold(html: string, css = '', js = ''): boolean {
  const blob = `${html}\n${css}\n${js}`;
  if (/Custom site\s*·/i.test(blob)) return true;
  if (/Layout seed keeps each build visually distinct/i.test(blob)) return true;
  if (/Offer \d+ tailored to/i.test(blob)) return true;
  if (/This page was generated to match your description — not a generic blog/i.test(blob)) return true;
  if (/Message stored locally — connect email later/i.test(blob)) return true;
  // Hero is basically the raw build prompt
  if (/<h1[^>]*>\s*Modern Landing Page called/i.test(html)) return true;
  if (/<h1[^>]*>\s*Build a (modern |simple )?(landing|website|blog)/i.test(html)) return true;
  // Crypto / swap template fingerprints (promptSiteScaffold)
  if (/OrbitSwap|XrogaSwap|Connect wallet \(demo\)|Fake wallet|0xA1b2.*demo/i.test(blob)) return true;
  if (/local swap preview|swap math is local-only|demo wallet only/i.test(blob)) return true;
  // Chatbot template fingerprints
  if (/AI assistant shell|Live replies use free open AI \(Pollinations\)/i.test(blob) && /chat-form/i.test(blob)) {
    // Only treat as scaffold when the whole site is the thin template (tiny HTML)
    if (html.trim().length < 3500) return true;
  }
  if (/Fallback scaffold|Escape Pod sandbox/i.test(blob)) return true;
  return false;
}

/** Substantial model HTML worth shipping (not an empty or tiny stub). */
export function isSubstantialSiteHtml(html: string): boolean {
  const t = html.trim();
  if (t.length < 900) return false;
  if (!/<html[\s>]|<!DOCTYPE/i.test(t) && !/<section|<main|<header/i.test(t)) return false;
  return true;
}

export function missingPromptFeatures(prompt: string, html: string, css = '', js = ''): string[] {
  const p = prompt.toLowerCase();
  const blob = `${html}\n${css}\n${js}`;
  const missing: string[] = [];

  if (
    /\b(night.?day|dark.?mode|theme toggle|light.?dark|day.?night)\b/i.test(p) &&
    !/\b(data-theme|theme-toggle|dark-mode|prefers-color-scheme|classList\.(add|toggle).*dark|id=["']theme)/i.test(
      blob
    )
  ) {
    missing.push('night/day (theme) toggle');
  }

  if (
    /\b(pric(e|ing)|pricing plan|plan of ai|subscription|tier)\b/i.test(p) &&
    !/\b(id=["']pricing|pricing|plan-card|\bprice\b|\$\d+|\/mo|per month)\b/i.test(blob)
  ) {
    missing.push('AI pricing section');
  }

  if (
    /\b(chatbot|chat bot|ai assistant|message bubbles|typing indicator)\b/i.test(p) &&
    !/\b(chat-form|id=["']messages|message-bubble|XrogaLiveAi\.chat|chat-log|id=["']chat)/i.test(blob)
  ) {
    missing.push('working chatbot UI + live chat wiring');
  }

  if (
    /\b(crypto|coingecko|token price|sparkline|defi|web3)\b/i.test(p) &&
    !(
      /\b(coingecko|cryptoPrices|data-live-price)\b/i.test(blob) &&
      /\b(wallet|swap|markets|token|kpi)\b/i.test(blob)
    )
  ) {
    missing.push('live crypto prices + dashboard/swap UI');
  }

  if (
    /\b(swap|bridge|exchange)\b/i.test(p) &&
    !/\b(swap|from-token|to-token|bridge|exchange)\b/i.test(blob)
  ) {
    missing.push('swap / bridge UI');
  }

  return missing;
}
