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

function isVagueBuild(input: string): { vague: boolean; topic?: string } {
  const t = input.toLowerCase().trim();
  if (isCapabilitiesQuery(input)) return { vague: false };
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
    return { vague: true, topic: 'project' };
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
    return `Let me understand your website

A few details will help me design the right thing.

Quick questions
What is the site for — business, portfolio, store, or something else?
Any style you like — minimal, bold, dark, playful?

Tell me and we will build from there.`;
  }
  if (topic === 'game') {
    return `Let me understand your game idea

Games need a clear starting point.

Quick questions
What genre — platformer, puzzle, RPG, casual, or other?
2D or 3D, and who is it for?

Describe your vision and we will map the first build step.`;
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
