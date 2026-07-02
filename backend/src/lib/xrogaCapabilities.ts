/** "What can you build?" — curated XROGA capabilities card (no council call) */

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
  return `## XROGA AI — Black Hole V∞

Here is what I can do for you **today**, and what is landing **in the next few days**.

### Ask me anything 📌
History, science, LLMs, AI, APIs, logic, math, culture, geopolitics, decisions — from a one-line answer to a deep dive.

### Images 🚀
**4 modern image variants** from a single prompt — generate, edit, upscale, remove background. Try: *"Generate 4 minimalist logo concepts for a fintech app"*.

### Code & systems 🚀
Production-ready APIs, scripts, automation, debug help, STEM walkthroughs — structured with clear steps and working code.

### Coming in the next few days
| Launching soon | Examples |
| :--- | :--- |
| Video generation | Text-to-video shorts, image-to-video |
| Websites | Landing pages, deploy to Vercel |
| Apps & games | Mobile, desktop, and game blueprints |
| Software suites | Full-stack tools and dashboards |
| Browser automation | Playwright scrape, cron, workflows |

---

**Pick a lane:**
- *"Explain how transformers work"*
- *"Generate 4 cyberpunk city images at night"*
- *"Write a FastAPI health-check endpoint"*

What should we build or explore first?`;
}
