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

const NEGATED_CAPABILITY_RE =
  /\b(?:not|isn['’]t|is\s+not)\s+(?:an?\s+)?(?:next\.?js|full[- ]?stack|saas|dashboard|auth(?:entication)?|login|signup|supabase|database|postgres|backend|api(?:\s+route)?|stripe|billing|lemon\s+squeezy|e-?commerce|online\s+(?:store|shop)|storefront|mobile\s+app|desktop\s+app|crypto|web3|agent|automation)\b/gi;

/**
 * Return only capability claims the user is actually asking Xroga to build.
 *
 * Routing used to scan the raw sentence. That made `not ecommerce` select the
 * ecommerce blueprint and `no backend` select Next.js. Besides wasting a model run,
 * the false capability could merge an auth/API scaffold into an explicitly static
 * site. Negative requirements are constraints, not requested product surfaces, so
 * remove them before deterministic routing while leaving the original prompt intact
 * for the model and reviewer.
 */
export function capabilityRoutingText(prompt: string): string {
  return prompt
    .replace(NEGATED_CAPABILITY_RE, ' ')
    .replace(/\b(?:no|without)\s+[^.!?;\n]+/gi, ' ')
    .replace(/\b(?:do\s+not|don['’]t|must\s+not|should\s+not)\s+[^.!?;\n]+/gi, ' ');
}

/** Feature packs layered on Next.js when the prompt asks for crypto or agents. */
export function detectScaffoldFeatures(prompt: string): ScaffoldFeatures {
  const t = capabilityRoutingText(prompt).trim();
  return {
    crypto: CRYPTO_RE.test(t),
    agent: AGENT_RE.test(t),
  };
}

/** Pick a deterministic scaffold so builds ship with real structure, not empty hope. */
export function detectScaffoldKind(prompt: string): ScaffoldKind {
  const t = capabilityRoutingText(prompt).trim();

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

/**
 * True for a presentation-only one-page product that should keep one authoritative
 * HTML/CSS/JS source for preview, GitHub, and Vercel. Descriptive words between
 * "one-page" and "website" are allowed (for example "one-page coffee shop website").
 * Requests for framework/backend capabilities are excluded by detectScaffoldKind.
 */
export function isSimpleStaticBuildPrompt(prompt: string): boolean {
  if (detectScaffoldKind(prompt) !== 'static') return false;
  return /\b(?:landing\s*page|one[ -]?page(?:\s+[\w-]+){0,5}\s+(?:web)?site|simple\s+(?:web|site|app)|static\s+site)\b/i.test(
    prompt,
  );
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
