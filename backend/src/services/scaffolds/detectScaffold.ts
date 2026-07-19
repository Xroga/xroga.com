export type ScaffoldKind = 'static' | 'nextjs' | 'expo';

const MOBILE_RE =
  /\b(android|ios|iphone|ipad|react\s*native|expo|mobile\s*app|native\s*app|app\s*store|play\s*store|capacitor)\b/i;

const NEXT_RE =
  /\b(next\.?js|full[- ]?stack|saas|dashboard|auth|login|signup|supabase|database|postgres|api\s*route|server\s*action|stripe|billing)\b/i;

const WEB_APP_RE =
  /\b(web\s*app|website|landing|portfolio|blog|store|ecommerce|marketplace)\b/i;

/** Pick a deterministic scaffold so builds ship with real structure, not empty hope. */
export function detectScaffoldKind(prompt: string): ScaffoldKind {
  const t = prompt.trim();
  if (MOBILE_RE.test(t) && !/\b(landing|marketing\s*site|website\s*only)\b/i.test(t)) {
    return 'expo';
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
