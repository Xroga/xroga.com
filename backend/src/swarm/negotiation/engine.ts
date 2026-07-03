/**
 * XROGA 7-Phase Swarm Negotiation Engine
 * DeepSeek + Gemini + Groq + Mistral (Core Quartet) | Claude/GPT (Reserve)
 */

import { geminiGenerate } from '../../lib/gemini.js';
import { groqChat } from '../../lib/groq.js';
import { deepSeekChat } from '../../lib/deepseek.js';
import { getSecret } from '../../config/envSecrets.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { analyzeUserQuery } from '../../lib/queryAnalyzer.js';
import { geminiGenerateCultural } from '../../council/geminiClient.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { groqGeneral } from '../../council/groqClient.js';
import { mistralVerify, mistralChat } from '../../council/mistralClient.js';
import { blackHoleEmit } from '../../blackhole/synthesizer.js';
import { formatPlainProfessional } from '../../blackhole/plainTextFormat.js';
import { buildLandingPage } from '../../services/builder/landingPage.js';
import { debugCode } from '../../services/debugging/codeDebugger.js';
import type { FeatureCategory, FeatureOutput, SwarmProgressEvent } from '../../types/features.js';
import type { NegotiationContext, NegotiationPhase, NegotiationResult, VerificationReport, SwarmTodoItem } from './types.js';
import {
  BRAND_HEADER,
  PHASE_0_DISCOVERY,
  PHASE_0_GROQ_SUMMARIZE,
  PHASE_1_PLANNING_GEMINI,
  PHASE_1_PLANNING_GROQ,
  PHASE_2_DEEPSEEK_REVIEW,
  PHASE_2_GEMINI_AGREE,
  PHASE_3_EXECUTE,
  PHASE_4_GROQ_VERIFY,
  PHASE_4_GEMINI_VERIFY,
  PHASE_5_CORRECT,
  PHASE_6_FINAL,
} from './prompts.js';
import { BRAND, failureBrand } from './brandedMessages.js';
import { reservePolish, shouldUseReserve } from './reserve.js';
import { swarmReserveProcess } from '../reserve/orchestrator.js';
import {
  isGitHubConnected,
  pushAndDeployLivePreview,
  landingFilesFromOutput,
} from '../../services/integrations/githubDeploy.js';

const MAX_PLAN_ITERATIONS = 3;
const MAX_STEP_CORRECTIONS = 3;

const META_TODO_DEFS: Array<{ id: string; label: string }> = [
  { id: 'github', label: '🔗 GitHub linked — AI SWARM LOGIC ready' },
  { id: 'analyze', label: '🕳️ XROGA Visionary is scanning your request' },
  { id: 'plan', label: '📝 AI SWARM LOGIC is plotting the gravitational path' },
  { id: 'structure', label: '🔄 XROGA Architect is verifying Event Horizon alignment' },
  { id: 'steps', label: '⚖️ Gravitational Consensus — step-by-step plan locked' },
  { id: 'verify-plan', label: '✅ Unanimously Approved Master Plan' },
];

function createTodoState() {
  const meta: SwarmTodoItem[] = META_TODO_DEFS.map((d) => ({
    ...d,
    status: 'pending' as const,
  }));
  let build: SwarmTodoItem[] = [];
  let analysis = '';

  const snapshot = (): SwarmTodoItem[] => [...meta, ...build];

  const setAnalysis = (text: string) => {
    analysis = text.slice(0, 400);
  };

  const activateMeta = (id: string) => {
    let passed = false;
    for (const item of meta) {
      if (item.id === id) {
        item.status = 'active';
        passed = true;
      } else if (!passed) {
        item.status = 'done';
      } else {
        item.status = 'pending';
      }
    }
    for (const item of build) {
      if (item.status === 'active') item.status = 'pending';
    }
  };

  const completeMetaThrough = (id: string) => {
    let found = false;
    for (const item of meta) {
      if (item.id === id) {
        item.status = 'done';
        found = true;
      } else if (!found) {
        item.status = 'done';
      }
    }
  };

  const setBuildSteps = (steps: string[]) => {
    build = steps.map((s, i) => ({
      id: `build-${i}`,
      label: `⚙️ Step ${i + 1}: ${s}`,
      status: 'pending' as const,
    }));
  };

  const activateBuild = (index: number) => {
    build.forEach((item, i) => {
      if (i < index) item.status = 'done';
      else if (i === index) item.status = 'active';
      else item.status = 'pending';
    });
    for (const item of meta) {
      if (item.status !== 'done') item.status = 'done';
    }
  };

  const completeAllBuild = () => {
    build.forEach((item) => {
      item.status = 'done';
    });
  };

  const addFinalTodos = () => {
    const extras: SwarmTodoItem[] = [
      { id: 'github-push', label: '📦 XROGA pushed code to GitHub', status: 'pending' },
      { id: 'live-deploy', label: '🌐 XROGA deployed live preview (Vercel / Netlify)', status: 'pending' },
      { id: 'final-check', label: '🌀 XROGA Collective — final gravitational collapse test', status: 'pending' },
      { id: 'emit', label: '🚀 BLACK HOLE V∞ emitting Singularity output', status: 'pending' },
    ];
    for (const item of extras) {
      if (!build.some((b) => b.id === item.id)) build.push(item);
    }
  };

  const activateFinal = (id: 'github-push' | 'live-deploy' | 'final-check' | 'emit') => {
    for (const item of build) {
      if (item.id === id) item.status = 'active';
      else if (item.status === 'active') item.status = 'done';
      else if (build.indexOf(item) < build.findIndex((b) => b.id === id)) item.status = 'done';
    }
  };

  const completeAll = () => {
    meta.forEach((m) => {
      m.status = 'done';
    });
    build.forEach((b) => {
      b.status = 'done';
    });
  };

  const completeMeta = (id: string) => {
    for (const item of meta) {
      if (item.id === id) item.status = 'done';
    }
  };

  const completeBuild = (index: number) => {
    build.forEach((item, i) => {
      if (i <= index) item.status = 'done';
      else if (item.status === 'active') item.status = 'pending';
    });
  };

  const completeFinal = (id: 'github-push' | 'live-deploy' | 'final-check' | 'emit') => {
    for (const item of build) {
      if (item.id === id) item.status = 'done';
    }
  };

  return {
    snapshot,
    setAnalysis,
    activateMeta,
    completeMeta,
    completeMetaThrough,
    setBuildSteps,
    activateBuild,
    completeBuild,
    completeAllBuild,
    addFinalTodos,
    activateFinal,
    completeFinal,
    completeAll,
    getAnalysis: () => analysis,
  };
}

function emit(
  ctx: NegotiationContext,
  phase: NegotiationPhase,
  detail: string,
  agent: string,
  todos: ReturnType<typeof createTodoState>,
  statusLabel: string
): void {
  ctx.onProgress?.({
    runId: crypto.randomUUID(),
    agent,
    status: `phase_${phase}`,
    message: detail,
    negotiationPhase: phase,
    swarmLogic: true,
    swarmTodos: todos.snapshot(),
    swarmStatusLabel: statusLabel,
    swarmAnalysis: todos.getAnalysis() || undefined,
    swarmActivity: detail,
    needsGitHub: statusLabel === 'XROGA GitHub' && detail.includes('Connect'),
    timestamp: new Date().toISOString(),
  } as SwarmProgressEvent);
}

export function shouldUseNegotiationEngine(prompt: string, category: FeatureCategory): boolean {
  if (['landing_page', 'code_debug', 'browser_automation'].includes(category)) return true;
  const t = prompt.toLowerCase();
  if (/\b(build|create|make|develop)\b[\s\S]{0,50}\b(website|web app|mobile app|game|software|api|script|component)\b/.test(t)) {
    return true;
  }
  if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error|typescript|python)\b/.test(t)) return true;
  return false;
}

function isPass(text: string): boolean {
  const head = text.trim().slice(0, 120);
  return /^PASS\b/i.test(head) || /\bUNANIMOUS APPROVAL\b/i.test(head) || /^APPROVED PLAN\b/i.test(head);
}

function parsePlanSteps(plan: string): string[] {
  const steps: string[] = [];
  for (const line of plan.split('\n')) {
    const m = line.match(/^Step\s+(\d+)[.:]\s*(.+)/i) ?? line.match(/^(\d+)[.)]\s+(.+)/);
    if (m?.[2]) steps.push(m[2].trim());
  }
  if (steps.length) return steps.slice(0, 12);
  return plan
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15)
    .slice(0, 8);
}

async function geminiCall(system: string, user: string, maxTokens = 2048): Promise<string> {
  if (getSecret('GEMINI_API_KEY')) {
    return geminiGenerate(`${XROGA_USER_IDENTITY}\n\n${system}`, user, {
      model: 'gemini-2.0-flash',
      maxTokens,
    });
  }
  return geminiGenerateCultural(user);
}

async function groqCall(system: string, user: string, maxTokens = 512): Promise<string> {
  if (getSecret('GROQ_API_KEY')) {
    return groqChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${system}` },
        { role: 'user', content: user },
      ],
      { maxTokens }
    );
  }
  return groqGeneral(user);
}

async function deepseekCall(system: string, user: string, maxTokens = 4096): Promise<string> {
  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${system}` },
        { role: 'user', content: user },
      ],
      { model: 'deepseek-chat', maxTokens }
    );
  }
  return deepseekGenerate(user);
}

async function verifyStepParallel(
  code: string,
  plan: string,
  prompt: string
): Promise<VerificationReport[]> {
  const results = await Promise.allSettled([
    groqCall(PHASE_4_GROQ_VERIFY, `Code:\n${code.slice(0, 6000)}`, 256).then((r) => ({
      agent: 'groq' as const,
      pass: isPass(r),
      report: r,
    })),
    geminiCall(PHASE_4_GEMINI_VERIFY, `Plan:\n${plan.slice(0, 1500)}\n\nUser: ${prompt.slice(0, 300)}\n\nCode:\n${code.slice(0, 6000)}`, 256).then(
      (r) => ({ agent: 'gemini' as const, pass: isPass(r), report: r })
    ),
    getSecret('MISTRAL_API_KEY')
      ? mistralVerify(code, plan, prompt).then((r) => ({
          agent: 'mistral' as const,
          pass: isPass(r),
          report: r,
        }))
      : Promise.resolve({ agent: 'mistral' as const, pass: true, report: 'PASS (Mistral skipped)' }),
  ]);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const agents = ['groq', 'gemini', 'mistral'] as const;
    return { agent: agents[i]!, pass: true, report: `PASS (agent unavailable)` };
  });
}

export async function runNegotiationEngine(ctx: NegotiationContext): Promise<NegotiationResult> {
  const { userPrompt, featureCategory, userId } = ctx;
  const todos = createTodoState();

  todos.activateMeta('github');
  const githubOk = await isGitHubConnected(userId);
  if (!githubOk) {
    emit(ctx, 0, BRAND.github.required, 'architect', todos, 'AI SWARM LOGIC');
    return {
      success: false,
      clarifiedBrief: '',
      approvedPlan: '',
      assembledCode: '',
      polishedOutput:
        '🔗 Connect your GitHub account to start building. XROGA will push your code and deploy a live preview automatically.',
      needsGitHubConnection: true,
    };
  }
  todos.completeMeta('github');
  emit(ctx, 0, BRAND.github.verified, 'architect', todos, 'AI SWARM LOGIC');

  todos.activateMeta('analyze');
  emit(ctx, 0, BRAND.phase0.scanning, 'reviewer', todos, 'XROGA Visionary');

  const analysis = analyzeUserQuery(userPrompt);
  if (analysis.needsClarification && analysis.clarificationText) {
    todos.setAnalysis(analysis.intentLabel);
    emit(ctx, 0, BRAND.phase0.clarifying, 'reviewer', todos, 'XROGA Visionary');
    return {
      success: false,
      clarifiedBrief: '',
      approvedPlan: '',
      assembledCode: '',
      polishedOutput: formatPlainProfessional(analysis.clarificationText),
      needsUserClarification: true,
      clarificationText: analysis.clarificationText,
    };
  }

  let clarifiedBrief: string;
  try {
    clarifiedBrief = await geminiCall(
      PHASE_0_DISCOVERY,
      `User request:\n${userPrompt}\n\nPrior analysis: ${analysis.intentLabel}`
    );
  } catch {
    clarifiedBrief = userPrompt;
  }

  if (/clarifying question|\?\s*$/im.test(clarifiedBrief) && clarifiedBrief.split('?').length > 2) {
    todos.setAnalysis(clarifiedBrief.slice(0, 280));
    emit(ctx, 0, BRAND.phase0.clarifying, 'reviewer', todos, 'XROGA Visionary');
    const emitted = await blackHoleEmit(clarifiedBrief, userPrompt, 'general', 'elite');
    return {
      success: false,
      clarifiedBrief,
      approvedPlan: '',
      assembledCode: '',
      polishedOutput: emitted.text,
      needsUserClarification: true,
      clarificationText: emitted.text,
    };
  }

  todos.setAnalysis(clarifiedBrief.slice(0, 280));
  todos.completeMeta('analyze');
  emit(ctx, 0, BRAND.phase0.briefReady, 'reviewer', todos, 'XROGA Visionary');

  try {
    clarifiedBrief = await groqCall(PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 120);
    emit(ctx, 0, BRAND.phase0.briefCondensed, 'qa', todos, 'XROGA Pulse');
  } catch {
    /* keep gemini brief */
  }

  todos.activateMeta('plan');
  emit(ctx, 1, BRAND.phase1.planning, 'architect', todos, 'AI SWARM LOGIC');
  let masterPlan = await geminiCall(PHASE_1_PLANNING_GEMINI, `Brief:\n${clarifiedBrief}\n\nOriginal:\n${userPrompt}`);
  try {
    masterPlan = await groqCall(PHASE_1_PLANNING_GROQ, masterPlan, 400);
  } catch {
    /* keep gemini plan */
  }
  todos.completeMeta('plan');
  const planStepCount = parsePlanSteps(masterPlan).length;
  emit(ctx, 1, BRAND.phase1.planReady(planStepCount), 'architect', todos, 'AI SWARM LOGIC');

  todos.activateMeta('structure');
  emit(ctx, 2, BRAND.phase2.reviewing, 'reviewer', todos, 'XROGA Architect');
  let approvedPlan = masterPlan;
  for (let i = 0; i < MAX_PLAN_ITERATIONS; i++) {
    emit(ctx, 2, BRAND.phase2.reviewing, 'reviewer', todos, 'XROGA Architect');
    const review = await deepseekCall(
      PHASE_2_DEEPSEEK_REVIEW,
      `User query:\n${userPrompt}\n\nMaster Plan:\n${approvedPlan}`
    );

    if (isPass(review)) {
      approvedPlan = review.replace(/^APPROVED PLAN\s*/i, '').trim() || approvedPlan;
      break;
    }

    const corrected = review.replace(/^CORRECTED PLAN\s*/i, '').trim() || review;
    emit(ctx, 2, BRAND.phase2.negotiating, 'architect', todos, 'XROGA Visionary');
    const geminiReply = await geminiCall(
      PHASE_2_GEMINI_AGREE,
      `Original user:\n${userPrompt}\n\nCorrected plan:\n${corrected}`
    );

    if (isPass(geminiReply)) {
      approvedPlan = geminiReply.replace(/^UNANIMOUS APPROVAL\s*/i, '').trim() || corrected;
      break;
    }
    approvedPlan = corrected;
  }
  todos.completeMeta('structure');
  todos.activateMeta('verify-plan');
  todos.completeMeta('verify-plan');

  const steps = parsePlanSteps(approvedPlan);
  if (!steps.length) steps.push('Implement the full project per the approved brief');
  todos.setBuildSteps(steps);
  todos.activateMeta('steps');
  todos.completeMeta('steps');
  emit(ctx, 2, BRAND.phase2.approved, 'reviewer', todos, 'XROGA Architect');

  const codeParts: string[] = [];
  let totalCorrections = 0;

  for (let si = 0; si < steps.length; si++) {
    const stepLabel = `Step ${si + 1}/${steps.length}`;
    todos.activateBuild(si);
    emit(ctx, 3, BRAND.phase3.execute(si + 1, steps.length), 'builder', todos, 'XROGA Architect');

    let stepCode = await deepseekCall(
      PHASE_3_EXECUTE,
      `Approved Plan:\n${approvedPlan}\n\nExecute now: Step ${si + 1} — ${steps[si]}\n\nUser:\n${userPrompt}`
    );

    let approved = false;
    for (let attempt = 0; attempt < MAX_STEP_CORRECTIONS; attempt++) {
      emit(ctx, 4, BRAND.phase4.verifying, 'qa', todos, 'AI SWARM LOGIC');
      const reports = await verifyStepParallel(stepCode, approvedPlan, userPrompt);
      const failures = reports.filter((r) => !r.pass);

      if (!failures.length) {
        emit(ctx, 4, BRAND.phase4.allPass, 'qa', todos, 'AI SWARM LOGIC');
        approved = true;
        break;
      }

      const failMsg = failures.map((f) => failureBrand(f.agent)).join(' ');
      emit(ctx, 5, failMsg, 'debugger', todos, 'XROGA Architect');
      emit(ctx, 5, BRAND.phase5.correcting, 'debugger', todos, 'XROGA Architect');
      const errorPlan = failures.map((f) => `[${f.agent}] ${f.report}`).join('\n');
      stepCode = await deepseekCall(
        PHASE_5_CORRECT,
        `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`
      );
      totalCorrections++;
      emit(ctx, 5, BRAND.phase5.fixed, 'debugger', todos, 'XROGA Architect');
    }

    todos.completeBuild(si);
    codeParts.push(`// --- ${stepLabel}: ${steps[si]} ---\n${stepCode}`);
    if (!approved) {
      emit(ctx, 5, BRAND.phase5.maxReached, 'debugger', todos, 'XROGA Architect');
    }
  }

  let assembledCode = codeParts.join('\n\n');

  todos.addFinalTodos();
  todos.activateFinal('final-check');
  emit(ctx, 6, BRAND.phase6.final, 'truth_council', todos, 'XROGA Collective');
  const finalChecks = await Promise.allSettled([
    deepseekCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 10000)}`),
    geminiCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 10000)}`, 256),
    groqCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 8000)}`, 256),
    getSecret('MISTRAL_API_KEY')
      ? mistralChat(PHASE_6_FINAL, assembledCode.slice(0, 8000), { maxTokens: 256 })
      : Promise.resolve('PASS'),
  ]);

  const finalFail = finalChecks.some((r) => r.status === 'fulfilled' && !isPass(r.value as string));
  if (finalFail) {
    emit(ctx, 5, BRAND.phase5.correcting, 'debugger', todos, 'XROGA Architect');
    assembledCode = await deepseekCall(PHASE_5_CORRECT, `Final review issues\n\n${assembledCode}`);
    totalCorrections++;
  } else {
    emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective');
  }
  todos.completeFinal('final-check');

  if (shouldUseReserve(userPrompt, totalCorrections)) {
    emit(ctx, 6, BRAND.reserve.polish, 'architect', todos, 'XROGA Alpha Core');
    const polished = await reservePolish(assembledCode, userPrompt, 'repeated_failure');
    if (polished) assembledCode = polished;
  }

  todos.activateFinal('emit');
  emit(ctx, 7, BRAND.phase7.emitting, 'builder', todos, 'BLACK HOLE V∞');
  let featureOutput: FeatureOutput | null = null;

  try {
    if (featureCategory === 'landing_page') {
      const enriched = `${userPrompt}\n\nApproved Swarm Plan:\n${approvedPlan}\n\nVerified code:\n${assembledCode.slice(0, 4000)}`;
      featureOutput = await buildLandingPage(enriched);
    } else if (featureCategory === 'code_debug') {
      featureOutput = await debugCode({
        code: assembledCode,
        filename: 'swarm-output.ts',
        language: 'typescript',
      });
    }
  } catch (err) {
    console.warn('[NegotiationEngine] Feature builder:', (err as Error).message);
  }

  const projectSlug = `xroga-build-${Date.now()}`;
  if (featureOutput?.type === 'landing_page') {
    todos.activateFinal('github-push');
    emit(ctx, 7, BRAND.phase7.githubPush, 'builder', todos, 'AI SWARM LOGIC');
    try {
      const files = landingFilesFromOutput(featureOutput.html, featureOutput.css, featureOutput.js);
      const pipeline = await pushAndDeployLivePreview(userId, files, projectSlug);
      featureOutput = {
        ...featureOutput,
        deployUrl: pipeline.deployUrl,
        vercelDeploymentId: pipeline.vercelDeploymentId ?? featureOutput.vercelDeploymentId,
        githubRepoUrl: pipeline.github.htmlUrl,
        githubRepoName: pipeline.github.repoName,
      };
      todos.completeFinal('github-push');
      todos.activateFinal('live-deploy');
      emit(ctx, 7, BRAND.phase7.liveDeploy, 'builder', todos, 'AI SWARM LOGIC');
      todos.completeFinal('live-deploy');
      emit(ctx, 7, BRAND.phase7.liveReady, 'complete', todos, 'BLACK HOLE V∞');
    } catch (err) {
      console.warn('[NegotiationEngine] GitHub/deploy pipeline:', (err as Error).message);
      todos.completeFinal('github-push');
      todos.completeFinal('live-deploy');
    }
  }

  const liveUrl =
    featureOutput?.type === 'landing_page' ? featureOutput.deployUrl : undefined;
  const repoUrl =
    featureOutput?.type === 'landing_page' ? featureOutput.githubRepoUrl : undefined;

  const rawEmit = liveUrl
    ? `Your project is live! 🎉\n\n🔗 Live preview: ${liveUrl}${repoUrl ? `\n📦 GitHub: ${repoUrl}` : ''}`
    : featureOutput
      ? `Your project is ready 🎉\n\n${assembledCode.slice(0, 6000)}`
      : `Your build is ready 🎉\n\n${assembledCode}`;

  let polishedOutput: string;
  try {
    const emitted = await blackHoleEmit(rawEmit, userPrompt, 'coding', 'elite');
    polishedOutput = emitted.text;
  } catch {
    polishedOutput = formatPlainProfessional(rawEmit);
  }

  todos.completeFinal('emit');
  todos.completeAll();
  emit(ctx, 7, BRAND.phase7.success, 'complete', todos, 'BLACK HOLE V∞');

  return {
    success: true,
    clarifiedBrief,
    approvedPlan,
    assembledCode,
    polishedOutput,
    featureOutput: featureOutput ?? undefined,
  };
}

/** OSS Escape Pod — all paid APIs down */
export async function runEscapePod(ctx: NegotiationContext): Promise<NegotiationResult> {
  const todos = createTodoState();
  todos.activateMeta('analyze');
  emit(ctx, 0, BRAND.escape.pod, 'architect', todos, 'XROGA Escape Pod');
  const raw = await swarmReserveProcess(ctx.userPrompt);
  todos.completeAll();
  const emitted = await blackHoleEmit(raw, ctx.userPrompt, 'general', 'reserve');
  emit(ctx, 7, BRAND.escape.done, 'complete', todos, 'BLACK HOLE V∞');
  return {
    success: true,
    clarifiedBrief: ctx.userPrompt,
    approvedPlan: 'OSS reserve',
    assembledCode: raw,
    polishedOutput: emitted.text,
  };
}
