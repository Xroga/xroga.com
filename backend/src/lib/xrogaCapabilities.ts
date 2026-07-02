/** "What can you build?" — plain professional capabilities (no markdown symbols) */

export function isCapabilitiesQuery(input: string): boolean {
  const lower = input.toLowerCase().trim();
  return (
    /\bwhat (can|do) you (build|create|make|do)( for me)?\b/.test(lower) ||
    /\bwhat (can|do) xroga\b/.test(lower) ||
    /\bwhat are you capable\b/.test(lower) ||
    /\bwhat do you offer\b/.test(lower) ||
    /\bshow me what you can\b/.test(lower) ||
    /\bwhat can i (build|create|make) (with|on) xroga\b/.test(lower)
  );
}

export function getXrogaCapabilitiesResponse(): string {
  return `XROGA AI — Black Hole V∞

Here is what I can do for you today, and what arrives in the next few days.

Ask me anything
History, science, LLMs, AI, APIs, logic, math, culture, geopolitics, and decisions — from a quick answer to a full deep dive.

Images
Four modern image variants from one prompt. Generate, edit, upscale, or remove backgrounds.

Code and systems
Production-ready APIs, scripts, automation, debugging, and STEM walkthroughs with clear steps and working code.

Arriving in the next few days
Video generation, websites, mobile apps, games, desktop software, and browser automation.

Try asking
Explain how transformers work
Generate 4 cyberpunk city images at night
Write a FastAPI health-check endpoint

What should we build or explore first?`;
}
