/**
 * Field-specific free APIs auto-integrated into user builds.
 * Crypto, weather, news, maps, etc. — no key when possible so preview is live.
 */

export type FieldDomain =
  | 'crypto'
  | 'ai_chat'
  | 'image'
  | 'weather'
  | 'news'
  | 'maps'
  | 'finance'
  | 'ecommerce'
  | 'general';

export interface FieldEndpoint {
  id: string;
  domain: FieldDomain;
  name: string;
  endpoint: string;
  freeTier: boolean;
  requiresApiKey: boolean;
  /** Short code hint for build models */
  wireHint: string;
  signupUrl?: string;
}

/** Curated free endpoints by product field — searched & wired automatically. */
export const FIELD_ENDPOINT_CATALOG: FieldEndpoint[] = [
  // ── Crypto / DeFi (no key) ──────────────────────────────────────────
  {
    id: 'coingecko-simple-price',
    domain: 'crypto',
    name: 'CoinGecko simple price',
    endpoint: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
    freeTier: true,
    requiresApiKey: false,
    wireHint:
      'fetch CoinGecko simple/price for BTC/ETH/SOL USD + 24h change; refresh markets table and KPI cards live. No API key.',
    signupUrl: 'https://www.coingecko.com/en/api',
  },
  {
    id: 'coingecko-markets',
    domain: 'crypto',
    name: 'CoinGecko markets list',
    endpoint: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'Optional: coins/markets for top-10 table with market cap + volume.',
  },
  {
    id: 'binance-ticker',
    domain: 'crypto',
    name: 'Binance public ticker',
    endpoint: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'Fallback public ticker if CoinGecko rate-limits (CORS may vary — prefer CoinGecko).',
  },
  {
    id: 'ethereum-rpc-public',
    domain: 'crypto',
    name: 'Public Ethereum RPC (read-only)',
    endpoint: 'https://cloudflare-eth.com',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'Wallet connect uses window.ethereum when present; optional eth_blockNumber via public RPC for “live network” badge.',
  },

  // ── AI (cross-field) ────────────────────────────────────────────────
  {
    id: 'pollinations-text',
    domain: 'ai_chat',
    name: 'Pollinations text (no key)',
    endpoint: 'https://text.pollinations.ai/{prompt}',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'Use window.XrogaLiveAi.chat for assistant replies — no key.',
    signupUrl: 'https://pollinations.ai',
  },
  {
    id: 'pollinations-image',
    domain: 'image',
    name: 'Pollinations image (no key)',
    endpoint: 'https://image.pollinations.ai/prompt/{prompt}',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'Use window.XrogaLiveAi.imageUrl(prompt) for live hero/product images.',
  },

  // ── Weather ─────────────────────────────────────────────────────────
  {
    id: 'open-meteo',
    domain: 'weather',
    name: 'Open-Meteo (no key)',
    endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current_weather=true',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'fetch Open-Meteo current_weather; show temp + wind. No API key.',
    signupUrl: 'https://open-meteo.com',
  },

  // ── News / research ─────────────────────────────────────────────────
  {
    id: 'searxng-platform',
    domain: 'news',
    name: 'SearXNG via Xroga',
    endpoint: '/api/integrations/live-ai/search',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'On xroga.com use XrogaLiveAi.search(q); elsewhere DuckDuckGo Instant Answer fallback.',
  },

  // ── Maps ────────────────────────────────────────────────────────────
  {
    id: 'openstreetmap-embed',
    domain: 'maps',
    name: 'OpenStreetMap embed',
    endpoint: 'https://www.openstreetmap.org/export/embed.html',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'Embed OSM iframe for contact/location — no Google Maps key required.',
  },

  // ── Finance (non-crypto) ────────────────────────────────────────────
  {
    id: 'frankfurter-fx',
    domain: 'finance',
    name: 'Frankfurter FX rates',
    endpoint: 'https://api.frankfurter.app/latest?from=USD',
    freeTier: true,
    requiresApiKey: false,
    wireHint: 'fetch Frankfurter latest FX for USD→EUR/GBP widgets — no key.',
  },
];

export function detectFieldDomains(prompt: string): FieldDomain[] {
  const t = prompt.toLowerCase();
  const domains: FieldDomain[] = [];
  if (/\b(crypto|blockchain|web3|defi|nft|token|wallet|dao|dapp|swap|staking|bitcoin|ethereum|solana)\b/.test(t)) {
    domains.push('crypto');
  }
  if (/\b(chatbot|ai assistant|llm|gpt|agent|claude|deepseek)\b/.test(t)) domains.push('ai_chat');
  if (/\b(image gen|generate image|ai image|dall.?e|midjourney)\b/.test(t)) domains.push('image');
  if (/\b(weather|forecast|temperature|climate)\b/.test(t)) domains.push('weather');
  if (/\b(news|headlines|articles|blog research)\b/.test(t)) domains.push('news');
  if (/\b(map|location|directions|store locator|address)\b/.test(t)) domains.push('maps');
  if (/\b(fx|exchange rate|currency|forex|stocks?)\b/.test(t) && !domains.includes('crypto')) {
    domains.push('finance');
  }
  if (/\b(ecommerce|shop|cart|checkout|product)\b/.test(t)) domains.push('ecommerce');
  if (!domains.length) domains.push('general');
  return domains;
}

/** Endpoints to auto-wire for this prompt (free-first). */
export function detectFieldEndpoints(prompt: string): FieldEndpoint[] {
  const domains = detectFieldDomains(prompt);
  const picks = FIELD_ENDPOINT_CATALOG.filter((e) => domains.includes(e.domain));
  // Always offer SearXNG research for product builds
  if (!picks.some((p) => p.id === 'searxng-platform') && domains.some((d) => d !== 'general')) {
    const searx = FIELD_ENDPOINT_CATALOG.find((e) => e.id === 'searxng-platform');
    if (searx) picks.push(searx);
  }
  return [...new Map(picks.map((p) => [p.id, p])).values()];
}

/** Injected into build brief so models wire live free field APIs automatically. */
export function formatFieldEndpointContext(prompt: string): string {
  const endpoints = detectFieldEndpoints(prompt);
  if (!endpoints.length) return '';

  const domains = detectFieldDomains(prompt);
  const lines = [
    `AUTO-INTEGRATE live free APIs for fields: ${domains.join(', ')}.`,
    'Wire these into the generated HTML/JS so the preview shows REAL live data — not placeholders:',
  ];
  for (const e of endpoints) {
    lines.push(
      `- [${e.domain}] ${e.name} (${e.freeTier ? 'FREE' : 'PAID'}${e.requiresApiKey ? ', needs key in Xroga vault' : ', no key'}): ${e.endpoint}`,
      `  → ${e.wireHint}`
    );
  }
  lines.push(
    'CRITICAL: Call these APIs from client JS on load (try/catch + graceful fallback).',
    'Never invent fake prices when a free live endpoint is listed — fetch them.',
    'User API keys (if any) are pasted encrypted in Xroga Integrations — do not hardcode secrets.'
  );
  return lines.join('\n');
}

export function fieldEndpointSummaryForPrompt(prompt: string): Array<{
  id: string;
  name: string;
  domain: FieldDomain;
  freeTier: boolean;
  requiresApiKey: boolean;
  endpoint: string;
  wireHint: string;
}> {
  return detectFieldEndpoints(prompt).map((e) => ({
    id: e.id,
    name: e.name,
    domain: e.domain,
    freeTier: e.freeTier,
    requiresApiKey: e.requiresApiKey,
    endpoint: e.endpoint,
    wireHint: e.wireHint,
  }));
}
