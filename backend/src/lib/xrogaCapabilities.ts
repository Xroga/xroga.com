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
  return `✨ Everything you can imagine — built with XROGA

XROGA builds what you imagine. Some features are live today; others are launching soon 🚀

Live right now
💬 Chat — ask anything: history, science, LLM, AI, APIs, logic, math, culture, decisions
🎨 Images — four modern variants from one prompt, edit, upscale, remove background

Coming soon
🎬 Video generation · 🌐 Websites · 📱 Apps · 🎮 Games · 💻 Software · 🤖 Browser automation

What do you want to build first? 🔥`;
}
