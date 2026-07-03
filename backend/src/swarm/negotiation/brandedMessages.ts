/** XROGA AI Swarm Logic — user-facing branded status messages (Phase 0–7) */

export const BRAND = {
  phase0: {
    scanning: '🕳️ XROGA Visionary is scanning your request...',
    briefCondensed: 'XROGA Pulse condensed the essence.',
    clarifying: '🧠 XROGA Visionary is aligning the Event Horizon with you...',
    briefReady: 'Fully Clarified Project Brief ready.',
  },
  phase1: {
    planning: '📝 AI SWARM LOGIC is plotting the gravitational path...',
    planReady: (steps: number) => `XROGA Master Plan ready — ${steps} gravitational steps mapped.`,
  },
  phase2: {
    reviewing: '🔄 XROGA Architect is verifying the Event Horizon alignment...',
    negotiating: '⚖️ Gravitational Consensus forming between XROGA Core engines...',
    approved: 'Unanimously Approved Master Plan locked.',
  },
  phase3: {
    execute: (step: number, total: number) =>
      `⚙️ XROGA Architect is building Step ${step}/${total} at the Singularity Core...`,
  },
  phase4: {
    verifying: '🔍 AI SWARM LOGIC is scanning the Event Horizon for anomalies...',
    groqFail: '⚡ XROGA Pulse detected a quantum fluctuation (syntax issue)!',
    geminiFail: '🕳️ XROGA Visionary detected a logic drift in the Horizon!',
    mistralFail: '⚓ XROGA Co-Architect flagged an efficiency edge case!',
    allPass: 'Step verified — all swarm agents PASS.',
  },
  phase5: {
    correcting: '🔧 XROGA Architect is stabilizing the rift...',
    fixed: '✅ Quantum stability restored. Re-verifying Horizon...',
    maxReached: 'Max correction loops — proceeding with best effort.',
  },
  phase6: {
    final: '🌀 XROGA Collective is performing a final gravitational collapse test...',
    allPass: 'Fully Verified & Approved Codebase.',
  },
  phase7: {
    emitting: '🚀 BLACK HOLE V∞ is emitting the Singularity output...',
    success: '🎉 Singularity achieved! Your build is ready.',
    githubPush: '📦 XROGA is pushing code to GitHub...',
    liveDeploy: '🌐 XROGA is deploying your live preview...',
    liveReady: '🔗 Live preview is ready — open in a new tab.',
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
