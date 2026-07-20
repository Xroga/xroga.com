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
🌐 **Web apps & sites** — build → sticky GitHub → your Vercel (optional Supabase). “Shipped” only when live URL checks out.
📱 **Mobile (Expo)** — scaffold → GitHub (Expo Go). EAS / stores need Publish → your Expo token (you pay fees).
🧩 **Chrome MV3** — scaffold → GitHub → \`extension.zip\` on Releases (required for “shipped”).
🖥️ **Desktop (Electron)** — scaffold → GitHub → Actions release **started** (download zip when Actions is green).
📊 **Crypto dashboards** — UI demos — not an exchange or custody.
⚙️ **Agent scaffolds** — cron/LLM stubs — not a managed bot farm.

Research
🔍 Live web + X research when keys are set — empty research is skipped (never faked)

Not part of the product
❌ Image / video studios, browser-automation farms, paying App Store fees, or claiming “710+ live OAuths”

What do you want to ship first?`;
}
