/**
 * Detect when the user is asking about an external product (DeepSeek, OpenAI, etc.)
 * — not about Xroga. Answers must stay on that product; never rebrand to Xroga.
 */

export interface ThirdPartyProduct {
  name: string;
  docsUrl?: string;
  supportHint?: string;
}

const PRODUCTS: Array<{ match: RegExp; product: ThirdPartyProduct }> = [
  {
    match: /\bdeep\s*seek\b/i,
    product: {
      name: 'DeepSeek',
      docsUrl: 'https://api-docs.deepseek.com',
      supportHint: 'DeepSeek billing support via their official site / Discord',
    },
  },
  {
    match: /\b(openai|chatgpt|gpt-?4)\b/i,
    product: {
      name: 'OpenAI',
      docsUrl: 'https://platform.openai.com/docs',
    },
  },
  {
    match: /\b(anthropic|claude)\b/i,
    product: { name: 'Anthropic', docsUrl: 'https://docs.anthropic.com' },
  },
  {
    match: /\b(x\.ai|grok)\b/i,
    product: { name: 'xAI (Grok)', docsUrl: 'https://docs.x.ai' },
  },
  {
    match: /\b(vercel)\b/i,
    product: { name: 'Vercel', docsUrl: 'https://vercel.com/docs' },
  },
  {
    match: /\b(github)\b/i,
    product: { name: 'GitHub', docsUrl: 'https://docs.github.com' },
  },
  {
    match: /\b(stripe)\b/i,
    product: { name: 'Stripe', docsUrl: 'https://stripe.com/docs' },
  },
];

const BILLING_SUPPORT =
  /\b(top\s*up|topup|credit|billing|payment|declined|rejected|risk control|subscribe|invoice|card|charge|refund|pricing plan)\b/i;

/** User is asking about another company's product — especially billing/support. */
export function detectThirdPartyProductQuestion(message: string): ThirdPartyProduct | null {
  const text = message.trim();
  if (!text) return null;

  const asksXroga = /\bxroga\b/i.test(text);
  const asksBilling = BILLING_SUPPORT.test(text);

  for (const { match, product } of PRODUCTS) {
    if (!match.test(text)) continue;
    // "DeepSeek" in a build prompt while on Xroga is still third-party if billing/support
    if (asksXroga && !asksBilling) continue;
    if (product.name === 'GitHub' && /\b(build|deploy|push|repo)\b/i.test(text) && !asksBilling) {
      continue;
    }
    return product;
  }
  return null;
}

export function thirdPartySupportSystemBlock(product: ThirdPartyProduct): string {
  return `
THIRD-PARTY SUPPORT (mandatory):
The user is asking about **${product.name}** — NOT Xroga AI.
- Answer ONLY about ${product.name}. Do NOT say "Xroga AI" unless comparing in one short line at the end.
- Never claim ${product.name}'s errors are caused by Xroga.
- Never invent Reddit threads, FAQ URLs, or support channels. Only cite URLs from live research below, or say "check ${product.name}'s official docs".
- Official docs: ${product.docsUrl ?? 'search their official website'}.
- Do not fabricate subreddits like r/Xroga AI or domains like api-docs.Xroga AI.com.
`;
}
