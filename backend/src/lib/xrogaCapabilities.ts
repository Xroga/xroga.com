/** "What can you build?" — must always fast-path, never swarm/DAG */

export function isCapabilitiesQuery(input: string): boolean {
  const lower = input.toLowerCase().trim().replace(/[?!.]+$/g, '');
  return (
    /\bwhat (can|do) you (build|create|make|do)( for me)?\b/.test(lower) ||
    /\bwhat you can build\b/.test(lower) ||
    /\bwhat (can|do) xroga\b/.test(lower) ||
    /\bwhat are you capable\b/.test(lower) ||
    /\bwhat do you offer\b/.test(lower) ||
    /\bshow me what you can\b/.test(lower) ||
    /\bwhat can i (build|create|make) (with|on) xroga\b/.test(lower) ||
    /\btell me what you can build\b/.test(lower)
  );
}

export function getXrogaCapabilitiesResponse(): string {
  return `✨ What Xroga ships today

**#1 coding agent — prompt → your GitHub → live**

Live product loops
🌐 **Web apps & sites** — Converter briefs → swarm builds → sticky GitHub repo → your Vercel (optional Supabase keys in vault)
📱 **Mobile (Expo)** — Android/iOS scaffold → push GitHub → Expo Go / one-click EAS on **your** Expo account (you pay Apple/Google/EAS)
🧩 **Chrome extension (MV3)** — scaffold → sticky GitHub → \`extension.zip\` on Releases (sideload free; CWS ~$5 on your account)
🖥️ **Desktop (Electron)** — scaffold → sticky GitHub → Actions release zip (unsigned free path; you pay signing/stores if needed)
📊 **Crypto market dashboards** — prices UI + wallet-connect demo — **not** an exchange, custody, or trading system
⚙️ **Agent runner scaffolds** — cron/LLM stubs on your stack — not a managed always-on bot farm

Research
🔍 Live web + X research when keys are set — empty research is skipped (never faked)

Not part of the product
❌ Image / video studios, browser-automation farms, or paying App Store fees for you

What do you want to ship first?`;
}
