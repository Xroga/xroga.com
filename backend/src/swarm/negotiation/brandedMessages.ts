/** XROGA — beginner-friendly branded status messages */

export const BRAND = {
  phase0: {
    scanning: '🔍 [Phase 1] Let me understand what you need...',
    briefCondensed: '[Phase 1] Brief condensed.',
    clarifying: '🔍 [Phase 1] Let me understand what you need...',
    briefReady: '[Phase 1] Project brief ready.',
  },
  phase1: {
    planning: '📝 [Phase 2] XROGA is planning...',
    planReady: (steps: number) => `📝 [Phase 2] ${steps} steps planned. Let's build!`,
  },
  phase2: {
    reviewing: '[Phase 3] XROGA Architect reviews the plan.',
    negotiating: '[Phase 3] Plan cross-verification...',
    approved: '[Phase 3] Plan approved.',
  },
  phase3: {
    buildStart: (steps: number) => `⚙️ [Phase 3] Building your website — ${steps} steps`,
    updateStart: (steps: number) => `⚙️ [Phase 3] Updating your website — ${steps} steps`,
    execute: (step: number, total: number, label: string) =>
      `⚙️ [Phase 3] Building... Step ${step}/${total} ${label}`,
  },
  phase4: {
    verifying: '🔍 [Phase 4] Verifying...',
    groqFail: '[Phase 4] Syntax issue detected — fixing...',
    geminiFail: '[Phase 4] Logic issue detected — fixing...',
    mistralFail: '[Phase 4] Edge case detected — fixing...',
    allPass: '✅ All checks passed.',
  },
  phase5: {
    correcting: '[Phase 4] Fixing issues behind the scenes...',
    fixed: '[Phase 4] Fixes applied — re-verifying.',
    maxReached: '[Phase 4] Proceeding with best effort.',
  },
  phase6: {
    final: '[Phase 4] Final verification...',
    allPass: '✅ All checks passed.',
  },
  phase7: {
    emitting: '[Phase 5] Preparing your summary...',
    success: '🎉 YOUR WEBSITE IS READY!',
  },
  phase8: {
    githubPush: '🚀 [Phase 5] Creating GitHub repo...',
    liveDeploy: '🚀 [Phase 5] Deploying to Vercel...',
    liveReady: '🚀 [Phase 5] Deploying... ✅ Live!',
    deployFailed: '[Phase 5] Deploy issue — code saved on GitHub.',
  },
  github: {
    required: '🔗 [Phase 0] Connect GitHub to save your work.',
    verified: '✅ GitHub connected — your builds will be saved automatically.',
  },
  reserve: {
    polish: '✨ XROGA Alpha Core is applying final polish...',
  },
  escape: {
    pod: '🛸 XROGA Escape Pod engaged.',
    done: '🛸 Escape Pod delivery complete.',
  },
} as const;

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
