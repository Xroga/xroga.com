/** "What can you build?" — headline + section plain format */

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
  return `What XROGA can build for you

Here is what works today and what arrives in the next few days.

Ask me anything
History, science, LLMs, AI, APIs, logic, math, culture, and decisions. Short answers or deep dives.

Images
Four modern variants from one prompt. Generate, edit, upscale, or remove backgrounds.

Code and systems
Production APIs, scripts, automation, debugging, and STEM with clear steps.

Arriving soon
Video generation, websites, mobile apps, games, desktop software, and browser automation.

Try asking
Explain how transformers work
Generate 4 cyberpunk city images at night
Write a FastAPI health-check endpoint

What should we build first?`;
}
