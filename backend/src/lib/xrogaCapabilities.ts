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
  return `✨ Everything you can build with XROGA

Live right now
💬 Chat — ask anything; business advice, pricing, and current events use **live web search** automatically
🎨 **Image generation** — logos, thumbnails, art, mockups, edits, variants, upscale, background removal
🌐 **Websites & apps** — full code pushed to your GitHub, live preview, crypto dashboards, chatbots, SaaS, CRM, games, APIs
💻 **Software & code** — any stack, any project type: scripts, tools, extensions, mobile, backend, debugging

When you ask about prices, net worth, strategies, or what's happening now — I search the web and YouTube so answers stay current.

What do you want to create first?`;
}
