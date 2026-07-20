export type ScaffoldKind = 'static' | 'nextjs' | 'expo' | 'chrome' | 'electron';

export type ScaffoldFeatures = {
  crypto: boolean;
  agent: boolean;
};

const MOBILE_RE =
  /\b(android|ios|iphone|ipad|react\s*native|expo|mobile\s*app|native\s*app|app\s*store|play\s*store|capacitor)\b/i;

const CHROME_RE =
  /\b(chrome\s*extension|browser\s*extension|mv3|manifest\s*v3|edge\s*extension|firefox\s*add[- ]?on)\b/i;

const ELECTRON_RE =
  /\b(electron|tauri|desktop\s*app|native\s*desktop|windows\s*app|mac\s*app|linux\s*desktop)\b/i;

const NEXT_RE =
  /\b(next\.?js|full[- ]?stack|saas|dashboard|auth|login|signup|supabase|database|postgres|api\s*route|server\s*action|stripe|billing|lemon\s*squeezy)\b/i;

const WEB_APP_RE =
  /\b(web\s*app|website|landing|portfolio|blog|store|ecommerce|marketplace)\b/i;

const CRYPTO_RE =
  /\b(crypto|web3|defi|wallet|token|nft|blockchain|solana|ethereum|bitcoin|btc|eth|on[- ]?chain|dex|swap)\b/i;

const AGENT_RE =
  /\b(agent|agents|automation|autonomous|cron\s*job|scheduled\s*task|workflow|orchestrat|always[- ]?on|background\s*job)\b/i;

/** Feature packs layered on Next.js when the prompt asks for crypto or agents. */
export function detectScaffoldFeatures(prompt: string): ScaffoldFeatures {
  const t = prompt.trim();
  return {
    crypto: CRYPTO_RE.test(t),
    agent: AGENT_RE.test(t),
  };
}

/** Pick a deterministic scaffold so builds ship with real structure, not empty hope. */
export function detectScaffoldKind(prompt: string): ScaffoldKind {
  const t = prompt.trim();

  // Extension / desktop before generic "app" keywords
  if (CHROME_RE.test(t)) return 'chrome';
  if (ELECTRON_RE.test(t) && !MOBILE_RE.test(t)) return 'electron';

  if (MOBILE_RE.test(t) && !/\b(landing|marketing\s*site|website\s*only)\b/i.test(t)) {
    return 'expo';
  }
  const features = detectScaffoldFeatures(t);
  // Crypto dashboards + automation agents need API routes + env — use Next.js
  if (features.crypto || features.agent) {
    return 'nextjs';
  }
  if (NEXT_RE.test(t) || (WEB_APP_RE.test(t) && /\b(auth|api|db|database|backend|login)\b/i.test(t))) {
    return 'nextjs';
  }
  // Default: static ships fastest on Vercel file-upload without a Git link
  return 'static';
}

export function isMobileBuildPrompt(prompt: string): boolean {
  return detectScaffoldKind(prompt) === 'expo';
}

export function needsBackendScaffold(prompt: string): boolean {
  return detectScaffoldKind(prompt) === 'nextjs';
}

/** Products that should not pretend to be a Next.js Vercel framework build. */
export function isNonWebFrameworkScaffold(kind: ScaffoldKind): boolean {
  return kind === 'expo' || kind === 'chrome' || kind === 'electron';
}
