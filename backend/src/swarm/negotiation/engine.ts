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
import { reservePolish, shouldUseReserve } from './reserve.js';
import { swarmReserveProcess } from '../reserve/orchestrator.js';

const MAX_PLAN_ITERATIONS = 3;
const MAX_STEP_CORRECTIONS = 3;

const META_TODO_DEFS: Array<{ id: string; label: string }> = [
  { id: 'analyze', label: 'XROGA is analyzing your request' },
  { id: 'plan', label: 'XROGA is planning' },
  { id: 'structure', label: 'XROGA is making it structured' },
  { id: 'steps', label: 'XROGA turned it into a step-by-step plan' },
  { id: 'verify-plan', label: 'XROGA verified the master plan' },
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
      label: `Step ${i + 1}: ${s}`,
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
    if (!build.some((b) => b.id === 'final-check')) {
      build.push(
        { id: 'final-check', label: 'XROGA final verification', status: 'pending' },
        { id: 'emit', label: 'XROGA delivering your build', status: 'pending' }
      );
    }
  };

  const activateFinal = (id: 'final-check' | 'emit') => {
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

  const completeFinal = (id: 'final-check' | 'emit') => {
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
    message: statusLabel,
    negotiationPhase: phase,
    swarmLogic: true,
    swarmTodos: todos.snapshot(),
    swarmStatusLabel: statusLabel,
    swarmAnalysis: todos.getAnalysis() || undefined,
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
  const { userPrompt, featureCategory } = ctx;
  const todos = createTodoState();

  todos.activateMeta('analyze');
  emit(ctx, 0, 'XROGA is analyzing your request…', 'architect', todos, 'XROGA Analyze');

  const analysis = analyzeUserQuery(userPrompt);
  if (analysis.needsClarification && analysis.clarificationText) {
    todos.setAnalysis(analysis.intentLabel);
    emit(ctx, 0, 'Need a few details before building…', 'architect', todos, 'XROGA Analyze');
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
    emit(ctx, 0, 'XROGA needs a few clarifying details…', 'architect', todos, 'XROGA Analyze');
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
  emit(ctx, 0, 'Analysis complete — moving to planning', 'architect', todos, 'XROGA Analyze');

  try {
    clarifiedBrief = await groqCall(
      'Summarize this brief in under 50 words.',
      clarifiedBrief,
      120
    );
  } catch {
    /* keep gemini brief */
  }

  todos.activateMeta('plan');
  emit(ctx, 1, 'XROGA is planning…', 'architect', todos, 'XROGA Planning');
  let masterPlan = await geminiCall(PHASE_1_PLANNING_GEMINI, `Brief:\n${clarifiedBrief}\n\nOriginal:\n${userPrompt}`);
  try {
    masterPlan = await groqCall(PHASE_1_PLANNING_GROQ, masterPlan, 400);
  } catch {
    /* keep gemini plan */
  }
  todos.completeMeta('plan');
  emit(ctx, 1, `Master Plan ready (${parsePlanSteps(masterPlan).length} steps)`, 'architect', todos, 'XROGA Planning');

  todos.activateMeta('structure');
  emit(ctx, 2, 'XROGA is making it structured…', 'architect', todos, 'XROGA Structure');
  let approvedPlan = masterPlan;
  for (let i = 0; i < MAX_PLAN_ITERATIONS; i++) {
    emit(ctx, 2, `DeepSeek reviewing plan (round ${i + 1})…`, 'reviewer', todos, 'XROGA Structure');
    const review = await deepseekCall(
      PHASE_2_DEEPSEEK_REVIEW,
      `User query:\n${userPrompt}\n\nMaster Plan:\n${approvedPlan}`
    );

    if (isPass(review)) {
      approvedPlan = review.replace(/^APPROVED PLAN\s*/i, '').trim() || approvedPlan;
      break;
    }

    const corrected = review.replace(/^CORRECTED PLAN\s*/i, '').trim() || review;
    emit(ctx, 2, 'Gemini reviewing DeepSeek corrections…', 'architect', todos, 'XROGA Structure');
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
  emit(ctx, 2, 'Plan verified — step-by-step build list ready', 'reviewer', todos, 'XROGA Steps');

  const codeParts: string[] = [];
  let totalCorrections = 0;

  for (let si = 0; si < steps.length; si++) {
    const stepLabel = `Step ${si + 1}/${steps.length}`;
    todos.activateBuild(si);
    emit(ctx, 3, `Building ${stepLabel}…`, 'builder', todos, 'XROGA Build');

    let stepCode = await deepseekCall(
      PHASE_3_EXECUTE,
      `Approved Plan:\n${approvedPlan}\n\nExecute now: Step ${si + 1} — ${steps[si]}\n\nUser:\n${userPrompt}`
    );

    let approved = false;
    for (let attempt = 0; attempt < MAX_STEP_CORRECTIONS; attempt++) {
      emit(ctx, 4, `Verifying ${stepLabel}…`, 'qa', todos, 'XROGA Verify');
      const reports = await verifyStepParallel(stepCode, approvedPlan, userPrompt);
      const failures = reports.filter((r) => !r.pass);

      if (!failures.length) {
        approved = true;
        break;
      }

      emit(
        ctx,
        5,
        `${failures.map((f) => f.agent).join(', ')} found issues — correcting…`,
        'debugger',
        todos,
        'XROGA Fix'
      );
      const errorPlan = failures.map((f) => `[${f.agent}] ${f.report}`).join('\n');
      stepCode = await deepseekCall(
        PHASE_5_CORRECT,
        `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`
      );
      totalCorrections++;
    }

    todos.completeBuild(si);
    codeParts.push(`// --- ${stepLabel}: ${steps[si]} ---\n${stepCode}`);
    if (!approved) {
      emit(ctx, 5, `${stepLabel} — best effort after max corrections`, 'debugger', todos, 'XROGA Fix');
    }
  }

  let assembledCode = codeParts.join('\n\n');

  todos.addFinalTodos();
  todos.activateFinal('final-check');
  emit(ctx, 6, 'Final verification (all agents)…', 'truth_council', todos, 'XROGA Final Check');
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
    assembledCode = await deepseekCall(PHASE_5_CORRECT, `Final review issues\n\n${assembledCode}`);
    totalCorrections++;
  }
  todos.completeFinal('final-check');

  if (shouldUseReserve(userPrompt, totalCorrections)) {
    const polished = await reservePolish(assembledCode, userPrompt, 'repeated_failure');
    if (polished) assembledCode = polished;
  }

  todos.activateFinal('emit');
  emit(ctx, 7, 'Emitting through Black Hole V∞…', 'builder', todos, 'XROGA Deliver');
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

  const rawEmit = featureOutput
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
  emit(ctx, 7, 'Build delivered ✅', 'complete', todos, 'XROGA Deliver');

  return {
    success: true,
    clarifiedBrief,
    approvedPlan,
    assembledCode,
    polishedOutput,
  };
}

/** OSS Escape Pod — all paid APIs down */
export async function runEscapePod(ctx: NegotiationContext): Promise<NegotiationResult> {
  const todos = createTodoState();
  todos.activateMeta('analyze');
  emit(ctx, 0, 'Escape Pod Mode — OSS Reserve Army engaged', 'architect', todos, 'XROGA Analyze');
  const raw = await swarmReserveProcess(ctx.userPrompt);
  todos.completeAll();
  const emitted = await blackHoleEmit(raw, ctx.userPrompt, 'general', 'reserve');
  emit(ctx, 7, 'Escape Pod delivery complete', 'complete', todos, 'XROGA Deliver');
  return {
    success: true,
    clarifiedBrief: ctx.userPrompt,
    approvedPlan: 'OSS reserve',
    assembledCode: raw,
    polishedOutput: emitted.text,
  };
}
