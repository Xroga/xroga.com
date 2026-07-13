/**
 * Post-process chat responses — reduce fake facts and excessive Xroga self-promotion.
 */

const XROGA_SPAM =
  /\b(black hole v∞|xroga ai swarm|our ai platform|we at xroga|xroga really understood|xroga can build anything|powered by black hole)\b/gi;

const INVENTED_PRODUCT_CLAIMS =
  /\b(xroga (already|currently|now) (offers|provides|ships|has built-in)|we automatically deploy to your vercel|our omniscient|guaranteed to work every time)\b/gi;

/** Trim hype and repeated brand mentions in general/business chat. */
export function sanitizeChatHonesty(text: string, opts?: { hadLiveResearch?: boolean }): string {
  let out = text.trim();
  if (!out) return out;

  // Collapse 3+ brand mentions to at most 1
  let brandCount = 0;
  out = out.replace(/\b(XROGA AI|Xroga AI|Black Hole V∞)\b/g, (match) => {
    brandCount += 1;
    return brandCount <= 1 ? match : 'this platform';
  });

  out = out.replace(XROGA_SPAM, '');
  out = out.replace(INVENTED_PRODUCT_CLAIMS, '');

  if (!opts?.hadLiveResearch) {
    out = out.replace(
      /\b(according to (the )?latest (2026 )?(data|reports|statistics|market research))\b/gi,
      'based on general industry knowledge (not live-verified)'
    );
  }

  // Remove empty sections left after stripping
  out = out.replace(/\n##[^\n]*\n\s*\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}

/** System prompt block — factual, minimal self-promotion. */
export const CHAT_HONESTY_RULES = `
Honesty & tone (mandatory):
- Answer the user's question directly. Do NOT pitch XROGA unless they asked about the product.
- Never invent statistics, revenue figures, market sizes, or "facts" you cannot verify from provided research.
- If live research is NOT provided below, say when information may be outdated and avoid precise current numbers.
- Mention "XROGA AI" or "Black Hole V∞" at most once — only if naturally relevant.
- Do not claim features that are not live (video gen, mobile apps, games builder) unless labeled "coming soon".
- Never say "wow" meta-phrases about yourself. Be a professional advisor, not a salesperson.
- If unsure, say "I don't have verified data on that" instead of guessing.
`;
