import type { XrogaIntent } from '../config/apiRoles.js';

const COMING_SOON_RESPONSES: Record<
  string,
  { title: string; body: string; extra: string; eta: string }
> = {
  build_website: {
    title: '🌐 WEBSITE BUILDER — ENHANCED PIPELINE',
    body: 'XROGA already builds landing pages and sites via the Website Builder. Full drag-and-drop studio is expanding.',
    extra: 'Try: "Build a landing page for my coffee shop" — I will generate and deploy-ready HTML/CSS/JS now.',
    eta: 'Enhanced studio: Q3 2026',
  },
  build_game: {
    title: '🎮 GAME STUDIO — COMING SOON',
    body: 'Game engine compilers are training to generate Pygame, Unity C#, and Three.js loops with physics and AI.',
    extra: 'I can generate a game design document (GDD), storyboard, or mechanics spec right now.',
    eta: 'Expected Release: Q4 2026',
  },
  build_app: {
    title: '📱 APP FACTORY — COMING SOON',
    body: 'Cross-platform app generation (React Native, Flutter, Swift, Kotlin) with state management is in training.',
    extra: 'I can draft app architecture, API schema, or user flow maps immediately.',
    eta: 'Expected Release: Q3 2026',
  },
  build_software: {
    title: '💻 SOFTWARE SUITE — COMING SOON',
    body: 'Desktop software generation in Python, C#, and C++ with scalable architectures is in development.',
    extra: 'I can generate the software requirements specification (SRS) or class diagrams now.',
    eta: 'Expected Release: Q4 2026',
  },
  build_automation: {
    title: '🤖 AUTOMATION HUB — PARTIAL LIVE',
    body: 'Playwright automation scripts work today. Full Zapier-like visual workflow builder is coming.',
    extra: 'Try: "Write a Playwright script to scrape..." — DeepSeek will deliver production code now.',
    eta: 'Visual hub: Q3 2026',
  },
  build_video: {
    title: '🎬 VIDEO STUDIO — LIVE',
    body: 'Text-to-video and image-to-video are live via Omni-Reality Studio (OSS + premium).',
    extra: 'Try: GENERATE A 5 SECOND VIDEO [xroga-video-format:shorts_reels]',
    eta: 'Available now',
  },
  build_generic: {
    title: '⚡ BUILD ENGINE — EXPANDING',
    body: 'Quantum compilers are training for production-grade native builds across all domains.',
    extra: 'I can generate design documents, architecture diagrams, and spec sheets today.',
    eta: 'Q3 2026',
  },
};

const INTENT_MAP: Partial<Record<XrogaIntent, string>> = {
  build_game: 'build_game',
  build_app: 'build_app',
  build_software: 'build_software',
  automation: 'build_automation',
  video_script: 'build_video',
};

export function getComingSoonResponse(intent: XrogaIntent): string {
  const key = INTENT_MAP[intent] ?? 'build_generic';
  const response = COMING_SOON_RESPONSES[key] ?? COMING_SOON_RESPONSES.build_generic!;
  return `## ${response.title}

${response.body}

> **While you wait:** ${response.extra}

**${response.eta}**

*Your patience fuels the black hole. Want to draft the blueprint or spec sheet instead?*`;
}

export function wantsFullNativeBuild(userInput: string): boolean {
  return /\b(build me|generate a full|create a complete|compile|ship)\b/i.test(userInput);
}
