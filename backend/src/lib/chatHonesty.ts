/**
 * Post-process chat responses — reduce fake facts and excessive Xroga self-promotion.
 */

const XROGA_SPAM =
  /\b(black hole v∞|xroga ai swarm|our ai platform|we at xroga|xroga really understood|xroga can build anything|powered by black hole)\b/gi;

const INVENTED_PRODUCT_CLAIMS =
  /\b(xroga (already|currently|now) (offers|provides|ships|has built-in)|we automatically deploy to your vercel|our omniscient|guaranteed to work every time)\b/gi;

/** Trim hype and repeated brand mentions in general/business chat. */
export function sanitizeChatHonesty(
  text: string,
  opts?: { hadLiveResearch?: boolean; thirdPartyProduct?: string }
): string {
  let out = text.trim();
  if (!out) return out;

  if (opts?.thirdPartyProduct) {
    out = out.replace(/\b(XROGA AI|Xroga AI|Black Hole V∞)\b/gi, opts.thirdPartyProduct);
    out = out.replace(/\bthis platform\b/gi, opts.thirdPartyProduct);
    out = out.replace(
      new RegExp(`${opts.thirdPartyProduct} ${opts.thirdPartyProduct}`, 'gi'),
      opts.thirdPartyProduct
    );
  } else {
    let brandCount = 0;
    out = out.replace(/\b(XROGA AI|Xroga AI|Black Hole V∞)\b/g, (match) => {
      brandCount += 1;
      return brandCount <= 1 ? match : 'the service';
    });
  }

  out = out.replace(XROGA_SPAM, '');
  out = out.replace(INVENTED_PRODUCT_CLAIMS, '');

  // Strip fabricated URLs/domains that insert "xroga" into third-party names
  out = out.replace(/https?:\/\/[^\s)\]"']*xroga[^\s)\]"']*/gi, '');
  out = out.replace(/api-docs\.Xroga\s*AI\.com/gi, 'api-docs.deepseek.com');
  out = out.replace(/api-docs\.DeepSeek\.com/gi, 'api-docs.deepseek.com');
  out = out.replace(/r\/Xroga\s*AI/gi, 'r/deepseek');

  if (!opts?.hadLiveResearch) {
    out = out.replace(
      /\b(according to (the )?latest (2026 )?(data|reports|statistics|market research))\b/gi,
      'based on general industry knowledge (not live-verified)'
    );
    out = out.replace(
      /\b(A Reddit thread from (June |July )?2026)\b/gi,
      'Some users report (verify on official forums)'
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
- Answer the user's question directly. Do NOT pitch XROGA unless they explicitly asked about Xroga.
- If the user asks about another product (DeepSeek, OpenAI, Vercel, etc.), answer ONLY about that product — never rebrand their question as Xroga.
- Never invent Reddit threads, FAQ URLs, support emails, or statistics. No fabricated links.
- If live research is NOT provided below, say when information may be outdated and avoid precise current numbers.
- Mention "XROGA AI" or "Black Hole V∞" at most once — only if the user asked about Xroga.
- Do not claim features that are not live (Xroga AI video generation, mobile apps, games builder) unless labeled "coming soon". For video requests, offer prompts for external video AIs — Xroga video gen is not live yet.
- Never say "wow" meta-phrases about yourself. Be a professional advisor, not a salesperson.
- If unsure, say "I don't have verified data on that — check the official docs" instead of guessing.
`;
