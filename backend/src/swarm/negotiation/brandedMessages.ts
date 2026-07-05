/** XROGA — beginner-friendly branded status messages */

export const BRAND = {
  phase0: {
    scanning: (label = 'website') => `🚀 [Phase 1] Starting your ${label}...`,
    briefCondensed: '[Phase 1] Brief condensed.',
    clarifying: (label = 'website') => `🚀 [Phase 1] Starting your ${label}...`,
    briefReady: '[Phase 1] Build plan ready.',
  },
  phase1: {
    planning: '📝 [Phase 1] Planning your build steps...',
    planReady: (steps: number) => `📝 [Phase 1] ${steps} steps planned — starting build`,
  },
  phase2: {
    reviewing: '[Phase 3] XROGA Architect reviews the plan.',
    negotiating: '[Phase 3] Plan cross-verification...',
    approved: '[Phase 3] Plan approved.',
  },
  phase3: {
    buildStart: (steps: number) => `⚙️ [Phase 1] XROGA AI Black Hole — building ${steps} steps`,
    updateStart: (steps: number) => `⚙️ [Phase 6] Updating your project — ${steps} steps`,
    execute: (step: number, total: number, label: string) =>
      `⚙️ [Phase 1] Building... Step ${step}/${total} ${label}`,
  },
  phase4: {
    verifying: '🔍 [Phase 2] Verifying...',
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
    success: '🎉 YOUR PROJECT IS LIVE!',
  },
  phase8: {
    githubPush: '🚀 [Phase 4] Creating GitHub repo & pushing files...',
    liveDeploy: '🚀 [Phase 4] Deploying to Vercel...',
    liveReady: '🚀 [Phase 4] Deploying... ✅ Live!',
    deployFailed: '[Phase 4] Deploy issue — code saved on GitHub.',
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
