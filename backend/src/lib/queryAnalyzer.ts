/**
 * Pre-response query analysis — understand intent before answering.
 * Surfaces thinking steps in UI; asks clarifying questions when the prompt is too vague.
 */

import { routingPrompt } from './promptRouting.js';
import { isCapabilitiesQuery } from './xrogaCapabilities.js';
import { isMathQuery } from './mathQuery.js';
import { isTrivialPrompt } from './promptClassifier.js';

export type QueryRouteHint =
  | 'capabilities'
  | 'math'
  | 'greeting'
  | 'image'
  | 'video'
  | 'build'
  | 'coding'
  | 'decision'
  | 'chat';

export interface QueryAnalysis {
  intentLabel: string;
  routeHint: QueryRouteHint;
  thinkingSteps: string[];
  needsClarification: boolean;
  clarificationText?: string;
}

export function isSpecificBuildRequest(t: string): boolean {
  return (
    /\b(build|create|make|design|develop)\b[\s\S]{0,80}\b(website|web\s*page|landing|site|store|shop|restaurant|bakery|salon|gym|clinic|dental|lawyer|portfolio|hotel|saas|ecommerce|nonprofit|church|school|agency|startup|barber|spa|fitness|yoga|real estate|construction|wedding|pet|vet)\b/i.test(
      t
    ) ||
    /\b(build|create|make)\b[\s\S]{0,50}\b(game|software|app|api|pygame|phaser)\b/i.test(t)
  );
}

function buildTopicFromPrompt(t: string): string | undefined {
  if (/\b(website|web\s*page|site|landing)\b/.test(t)) return 'website';
  if (/\b(game)\b/.test(t)) return 'game';
  if (/\b(app|mobile)\b/.test(t)) return 'app';
  if (/\b(video|movie|clip)\b/.test(t)) return 'video';
  return undefined;
}

function isVagueBuild(input: string): { vague: boolean; topic?: string } {
  const t = input.toLowerCase().trim();
  if (isCapabilitiesQuery(input)) return { vague: false };
  if (isSpecificBuildRequest(t)) return { vague: false };
  if (/\b(build|create|make)\s+(something|anything|stuff|it|one)\b/.test(t)) {
    return { vague: true, topic: 'project' };
  }
  if (/^(help|help me|assist me|i need help)\b/.test(t) && t.length < 80) {
    return { vague: true, topic: 'help' };
  }
  if (/^(build|create|make)\s+(an?\s+)?(app|website|game|video|software)\s*$/i.test(t)) {
    const topic = t.match(/(app|website|game|video|software)/i)?.[1]?.toLowerCase();
    return { vague: true, topic: topic ?? 'project' };
  }
  if (t.length < 28 && /\b(build|create|make)\b/.test(t) && !/\b(for|that|with|using)\b/.test(t)) {
    const topic = buildTopicFromPrompt(t) ?? 'project';
    return { vague: true, topic };
  }
  return { vague: false };
}

function buildClarification(topic: string): string {
  if (topic === 'help') {
    return `Let me understand what you need

I am ready to help — chat, images, math, code, planning, and more are live on XROGA today.

Quick questions
What are you trying to accomplish right now?
Do you want an answer, an image, or to start building something?

Reply with a sentence or two and I will take it from there.`;
  }
  if (topic === 'app') {
    return `Let me understand your app idea

Before we build, I want to get the scope right.

Quick questions
Mobile, web, or desktop — which platform do you want?
What is the one main thing the app should do for users?

Share those details and we can start immediately.`;
  }
  if (topic === 'website') {
    return `XROGA Visionary — Phase 1 Discovery

Tell me your niche in one message — any industry works (restaurant, gym, dental, law firm, portfolio, SaaS, hotel, etc.):

1. Business name & type?
2. Key features? (menu, booking, shop, gallery, contact)
3. Colors / design vibe?
4. Online ordering or payments? (yes/no)

Reply once — XROGA will plan, build, push to GitHub, and deploy a live preview.`;
  }
  if (topic === 'game') {
    return `🎮 **DeepSeek Game Alchemist**

Games are built **step by step** — each phase is playable before we continue.

Quick questions:
1. Favorite games & what you loved about them?
2. Genre vibe — action, puzzle, RPG, arcade, strategy, sandbox?
3. 2D or 3D? Browser (HTML5) or Python (Pygame)?
4. Coding comfort — beginner or experienced?

Reply with your answers — I'll pitch your Dream Game, then we build Phase 1 together. Reply **NEXT** after each phase for more.`;
  }
  if (topic === 'video') {
    return `Let me understand your video

Video generation is rolling out soon — I can still plan your shot list now.

Quick questions
How long should the clip be — a few seconds or longer?
What should happen on screen — subject, mood, and camera feel?

Reply with your scene and I will shape the production plan.`;
  }
  return `Let me understand what you want to build

Your idea is broad — that is fine. I just need a bit more direction.

Quick questions
What should the end result be — website, app, image, video, or software?
Who is it for, and what is the main goal?

Answer in plain words and XROGA will take the first concrete step with you.`;
}

function detectRouteHint(input: string): { hint: QueryRouteHint; label: string } {
  const t = routingPrompt(input).toLowerCase().trim();

  if (isCapabilitiesQuery(input)) {
    return { hint: 'capabilities', label: 'XROGA capabilities overview' };
  }
  if (isMathQuery(input)) {
    return { hint: 'math', label: 'Math or STEM problem' };
  }
  if (isTrivialPrompt(input) || /^(hi|hello|hey|good\s+(morning|afternoon|evening))\b/.test(t)) {
    return { hint: 'greeting', label: 'Greeting or short reply' };
  }
  if (/\b(generate|create|make|draw|design)\b[\s\S]{0,40}\b(image|picture|photo|logo|icon|poster)\b/.test(t)) {
    return { hint: 'image', label: 'Image generation' };
  }
  if (/\b(video|animate|animation|clip|movie|gif)\b/.test(t)) {
    return { hint: 'video', label: 'Video request' };
  }
  if (/\b(code|debug|typescript|python|javascript|function|api|bug|sql)\b/.test(t) || input.includes('```')) {
    return { hint: 'coding', label: 'Code or technical task' };
  }
  if (/\b(should i|decide|pros and cons|which option|help me choose)\b/.test(t)) {
    return { hint: 'decision', label: 'Decision or comparison' };
  }
  if (/\b(build|create|make|deploy|scrape|automate)\b/.test(t)) {
    return { hint: 'build', label: 'Build or create request' };
  }
  return { hint: 'chat', label: 'General question' };
}

export function analyzeUserQuery(rawInput: string): QueryAnalysis {
  const input = routingPrompt(rawInput).trim();
  const { hint, label } = detectRouteHint(input);
  const vague = isVagueBuild(input);

  const thinkingSteps = [
    'Reading your question',
    'Analyzing what you are asking for',
    `Identified: ${label}`,
  ];

  if (vague.vague) {
    thinkingSteps.push('Need a little more detail before building');
    return {
      intentLabel: label,
      routeHint: hint,
      thinkingSteps,
      needsClarification: true,
      clarificationText: buildClarification(vague.topic ?? 'project'),
    };
  }

  thinkingSteps.push('Preparing your answer');

  return {
    intentLabel: label,
    routeHint: hint,
    thinkingSteps,
    needsClarification: false,
  };
}
