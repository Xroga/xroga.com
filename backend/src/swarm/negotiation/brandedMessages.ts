/** XROGA AI Swarm Logic — compact user-facing status (Phases 1–9) */

export const BRAND = {
  phase0: {
    scanning: '[Phase 1] XROGA Visionary is scanning your request...',
    briefCondensed: '[Phase 1] Brief condensed.',
    clarifying: '[Phase 1] XROGA Visionary asks clarifying questions.',
    briefReady: '[Phase 1] Fully Clarified Project Brief ready.',
  },
  phase1: {
    planning: '[Phase 2] AI SWARM LOGIC plots step-by-step plan.',
    planReady: (steps: number) => `[Phase 2] Master Plan ready — ${steps} steps.`,
  },
  phase2: {
    reviewing: '[Phase 3] XROGA Architect reviews the plan.',
    negotiating: '[Phase 3] Plan cross-verification in progress...',
    approved: '[Phase 3] XROGA Architect approves the plan.',
  },
  phase3: {
    execute: (step: number, target: string) => `[Phase 4] Executing Step ${step}: ${target}`,
  },
  phase4: {
    verifying: '[Phase 5] Verification in progress...',
    groqFail: '[Phase 5] Pulse: syntax issue detected.',
    geminiFail: '[Phase 5] Visionary: logic drift detected.',
    mistralFail: '[Phase 5] Co-Architect: edge case flagged.',
    allPass: 'Verification: PASS',
  },
  phase5: {
    correcting: '[Phase 6] Correcting errors...',
    fixed: '[Phase 6] Corrections done — re-verifying.',
    maxReached: '[Phase 6] Max correction loops — proceeding with best effort.',
  },
  phase6: {
    final: '[Phase 7] Final holistic verification (all agents).',
    allPass: '[Phase 7] Final verification: ALL PASS.',
  },
  phase7: {
    emitting: '[Phase 8] BLACK HOLE V∞ emits the full project.',
    success: '🎉 SINGULARITY ACHIEVED!',
  },
  phase8: {
    githubPush: '[Phase 9] Deploying to GitHub + Vercel...',
    liveDeploy: '[Phase 9] Live preview deploying...',
    liveReady: '🔗 Live preview is ready.',
    deployFailed: '[Phase 9] Deploy issue — code saved; retry preview shortly.',
  },
  github: {
    required: '🔗 Connect GitHub to start building.',
    verified: 'GitHub connected — AI SWARM LOGIC engaged.',
  },
  reserve: {
    polish: '✨ XROGA Alpha Core is applying ultra-refinement...',
  },
  escape: {
    pod: '🛸 XROGA Escape Pod engaged. Quantum tunneling in progress...',
    done: '🛸 Escape Pod delivery complete.',
  },
} as const;

/** Branded agent display names (never expose raw model names to users) */
export const AGENT_DISPLAY: Record<string, string> = {
  architect: 'XROGA Architect',
  builder: 'XROGA Architect',
  reviewer: 'XROGA Visionary',
  qa: 'XROGA Pulse',
  debugger: 'XROGA Architect',
  truth_council: 'XROGA Collective',
  complete: 'BLACK HOLE V∞',
};

export function failureBrand(agent: 'groq' | 'gemini' | 'mistral'): string {
  if (agent === 'groq') return BRAND.phase4.groqFail;
  if (agent === 'gemini') return BRAND.phase4.geminiFail;
  return BRAND.phase4.mistralFail;
}
