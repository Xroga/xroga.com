/** Compact user-facing phase progress lines (Phases 1–9) */

import type { NegotiationPhase } from './types.js';
import { userPhaseNumber } from './types.js';

export const STANDARD_BUILD_QUESTIONS = [
  'What tech stack? (React/Next.js or plain HTML/CSS/JS?)',
  'Key features? (Menu, ordering, gallery, reservations?)',
  'Design preference? (Colors, style?)',
] as const;

export function formatPhase1Questions(questions: readonly string[] = STANDARD_BUILD_QUESTIONS): string {
  const lines = questions.map((q) => `   → ${q}`);
  return `[Phase 1] XROGA Visionary asks clarifying questions.\n${lines.join('\n')}`;
}

export function phaseLine(phase: NegotiationPhase, detail: string): string {
  return `[Phase ${userPhaseNumber(phase)}] ${detail}`;
}

export const PHASE_UI = {
  discovery: () => phaseLine(0, 'XROGA Visionary asks clarifying questions.'),
  briefReady: () => phaseLine(0, 'Fully Clarified Project Brief ready.'),
  planning: () => phaseLine(1, 'AI SWARM LOGIC plots step-by-step plan.'),
  planReady: (steps: number) => phaseLine(1, `Master Plan ready — ${steps} steps.`),
  planReview: () => phaseLine(2, 'XROGA Architect reviews the plan.'),
  planApproved: () => phaseLine(2, 'XROGA Architect approves the plan.'),
  execute: (step: number, target: string) => phaseLine(3, `Executing Step ${step}: ${target}`),
  verify: (pass: boolean) => phaseLine(4, pass ? 'Verification: PASS' : 'Verification: FAIL'),
  stepApproved: (step: number) => phaseLine(4, `Verification: PASS — Step ${step} approved.`),
  correct: () => phaseLine(5, 'Correcting errors...'),
  correctDone: () => phaseLine(5, 'Corrections done — re-verifying.'),
  finalReview: () => phaseLine(6, 'Final holistic verification (all agents).'),
  finalPass: () => phaseLine(6, 'Final verification: ALL PASS.'),
  emit: () => phaseLine(7, 'BLACK HOLE V∞ emits the full project.'),
  deploy: () => phaseLine(8, 'Deploying to GitHub + Vercel...'),
  liveReady: (url: string) => phaseLine(8, `Live preview ready: ${url}`),
  githubRequired: '🔗 Connect GitHub to start building.',
  githubVerified: 'GitHub connected — AI SWARM LOGIC engaged.',
} as const;

export function formatBuildSuccess(liveUrl: string, repoUrl?: string): string {
  const lines = ['🎉 SINGULARITY ACHIEVED!', `🔗 Live Preview: ${liveUrl}`];
  if (repoUrl) lines.push(`📂 GitHub: ${repoUrl}`);
  return lines.join('\n');
}

export function stepTargetLabel(step: string, index: number): string {
  const fileMatch = step.match(/\b([\w.-]+\.(html?|css|js|tsx?))\b/i);
  if (fileMatch?.[1]) return fileMatch[1];
  if (/\bhtml\b|layout|scaffold|structure/i.test(step)) return 'index.html';
  if (/\bcss\b|style|theme/i.test(step)) return 'style.css';
  if (/\bjavascript\b|\bjs\b|interactiv|cart|order/i.test(step)) return 'app.js';
  return `step-${index + 1}`;
}

/** True when the user already answered stack / features / design in thread context. */
export function hasClarifiedBuildBrief(prompt: string): boolean {
  if (/Fully Clarified Project Brief/i.test(prompt)) return true;

  const lower = prompt.toLowerCase();
  if (/\b(use defaults|start the 9-?phase|just build|go ahead|proceed)\b/i.test(lower)) {
    return true;
  }

  const hasStack =
    /\b(html|css|js|react|next\.?js|tailwind|vanilla|plain html)\b/i.test(lower) ||
    /\bhtml\/css\/js\b/i.test(lower);
  const hasFeatures =
    /\b(menu|order|gallery|reservation|contact|payment|cart|booking)\b/i.test(lower);
  const hasDesign =
    /\b(theme|color|brown|gold|dark|light|modern|minimal|warm|palette)\b/i.test(lower);

  if (/\[Previous conversation for context/i.test(prompt)) {
    return hasStack || (hasFeatures && hasDesign) || (hasStack && hasFeatures);
  }

  return (
    hasStack &&
    hasFeatures &&
    (hasDesign || /\b(responsive|mobile)\b/i.test(lower) || prompt.length > 120)
  );
}

export function isWebsiteBuildPrompt(prompt: string, category?: string): boolean {
  if (category === 'landing_page') return true;
  return /\b(website|web\s*page|landing|site|coffee|shop|store|restaurant|bakery)\b/i.test(prompt);
}
