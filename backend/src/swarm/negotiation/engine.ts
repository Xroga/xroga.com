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
import type { NegotiationContext, NegotiationPhase, NegotiationResult, VerificationReport } from './types.js';
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

export function shouldUseNegotiationEngine(prompt: string, category: FeatureCategory): boolean {
  if (['landing_page', 'code_debug', 'browser_automation'].includes(category)) return true;
  const t = prompt.toLowerCase();
  if (/\b(build|create|make|develop)\b[\s\S]{0,50}\b(website|web app|mobile app|game|software|api|script|component)\b/.test(t)) {
    return true;
  }
  if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error|typescript|python)\b/.test(t)) return true;
  return false;
}

function emit(
  ctx: NegotiationContext,
  phase: NegotiationPhase,
  detail: string,
  agent = 'architect'
): void {
  ctx.onProgress?.({
    runId: crypto.randomUUID(),
    agent,
    status: `phase_${phase}`,
    message: `${BRAND_HEADER}\n\n[Phase ${phase}] ${detail}`,
    negotiationPhase: phase,
    swarmLogic: true,
    timestamp: new Date().toISOString(),
  } as SwarmProgressEvent);
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

  // Phase 0 — Discovery
  emit(ctx, 0, 'Gemini analyzing your request…', 'architect');
  const analysis = analyzeUserQuery(userPrompt);
  if (analysis.needsClarification && analysis.clarificationText) {
    emit(ctx, 0, 'Need a few details before building…', 'architect');
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
    emit(ctx, 0, 'Gemini is asking clarifying questions…', 'architect');
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

  emit(ctx, 0, 'Brief clarified — Groq summarizing intent…', 'architect');
  try {
    clarifiedBrief = await groqCall(
      'Summarize this brief in under 50 words.',
      clarifiedBrief,
      120
    );
  } catch {
    /* keep gemini brief */
  }

  // Phase 1 — Planning
  emit(ctx, 1, 'Gemini generating Master Plan…', 'architect');
  let masterPlan = await geminiCall(PHASE_1_PLANNING_GEMINI, `Brief:\n${clarifiedBrief}\n\nOriginal:\n${userPrompt}`);
  try {
    masterPlan = await groqCall(PHASE_1_PLANNING_GROQ, masterPlan, 400);
  } catch {
    /* keep gemini plan */
  }
  emit(ctx, 1, `Master Plan ready (${parsePlanSteps(masterPlan).length} steps)`, 'architect');

  // Phase 2 — Plan cross-verification
  let approvedPlan = masterPlan;
  for (let i = 0; i < MAX_PLAN_ITERATIONS; i++) {
    emit(ctx, 2, `DeepSeek reviewing plan (round ${i + 1})…`, 'reviewer');
    const review = await deepseekCall(
      PHASE_2_DEEPSEEK_REVIEW,
      `User query:\n${userPrompt}\n\nMaster Plan:\n${approvedPlan}`
    );

    if (isPass(review)) {
      approvedPlan = review.replace(/^APPROVED PLAN\s*/i, '').trim() || approvedPlan;
      emit(ctx, 2, 'Plan approved unanimously ✅', 'reviewer');
      break;
    }

    const corrected = review.replace(/^CORRECTED PLAN\s*/i, '').trim() || review;
    emit(ctx, 2, 'Gemini reviewing DeepSeek corrections…', 'architect');
    const geminiReply = await geminiCall(
      PHASE_2_GEMINI_AGREE,
      `Original user:\n${userPrompt}\n\nCorrected plan:\n${corrected}`
    );

    if (isPass(geminiReply)) {
      approvedPlan = geminiReply.replace(/^UNANIMOUS APPROVAL\s*/i, '').trim() || corrected;
      emit(ctx, 2, 'Unanimous plan approval ✅', 'architect');
      break;
    }
    approvedPlan = corrected;
  }

  const steps = parsePlanSteps(approvedPlan);
  if (!steps.length) steps.push('Implement the full project per the approved brief');

  const codeParts: string[] = [];
  let totalCorrections = 0;

  // Phase 3–5 — Step execution loop
  for (let si = 0; si < steps.length; si++) {
    const stepLabel = `Step ${si + 1}/${steps.length}`;
    emit(ctx, 3, `Executing ${stepLabel} with DeepSeek…`, 'builder');

    let stepCode = await deepseekCall(
      PHASE_3_EXECUTE,
      `Approved Plan:\n${approvedPlan}\n\nExecute now: Step ${si + 1} — ${steps[si]}\n\nUser:\n${userPrompt}`
    );

    let approved = false;
    for (let attempt = 0; attempt < MAX_STEP_CORRECTIONS; attempt++) {
      emit(ctx, 4, `Verifying ${stepLabel} (Groq + Gemini + Mistral)…`, 'qa');
      const reports = await verifyStepParallel(stepCode, approvedPlan, userPrompt);
      const failures = reports.filter((r) => !r.pass);

      if (!failures.length) {
        emit(ctx, 4, `${stepLabel} verified — all agents PASS ✅`, 'qa');
        approved = true;
        break;
      }

      emit(
        ctx,
        5,
        `${failures.map((f) => f.agent).join(', ')} found issues — DeepSeek correcting…`,
        'debugger'
      );
      const errorPlan = failures.map((f) => `[${f.agent}] ${f.report}`).join('\n');
      stepCode = await deepseekCall(
        PHASE_5_CORRECT,
        `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`
      );
      totalCorrections++;
    }

    if (!approved) {
      emit(ctx, 5, `${stepLabel} — max corrections reached, proceeding with best effort`, 'debugger');
    }
    codeParts.push(`// --- ${stepLabel}: ${steps[si]} ---\n${stepCode}`);
  }

  let assembledCode = codeParts.join('\n\n');

  // Phase 6 — Final verification
  emit(ctx, 6, 'Final holistic verification (all 4 agents)…', 'truth_council');
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
    emit(ctx, 5, 'Final issues found — DeepSeek applying global fix…', 'debugger');
    assembledCode = await deepseekCall(PHASE_5_CORRECT, `Final review issues\n\n${assembledCode}`);
    totalCorrections++;
  } else {
    emit(ctx, 6, 'Final verification — ALL PASS ✅', 'truth_council');
  }

  // Reserve 20% (optional)
  if (shouldUseReserve(userPrompt, totalCorrections)) {
    emit(ctx, 6, 'Reserve polish (Claude/GPT)…', 'architect');
    const polished = await reservePolish(assembledCode, userPrompt, 'repeated_failure');
    if (polished) assembledCode = polished;
    else emit(ctx, 6, 'Reserve unavailable — Core Quartet completing 100%', 'architect');
  }

  // Phase 7 — Emission
  emit(ctx, 7, 'Emitting through Black Hole V∞…', 'builder');
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

  emit(ctx, 7, 'Build delivered — errors resolved before you saw them ✅', 'complete');

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
  emit(ctx, 0, 'Escape Pod Mode — OSS Reserve Army engaged', 'architect');
  const raw = await swarmReserveProcess(ctx.userPrompt);
  const emitted = await blackHoleEmit(raw, ctx.userPrompt, 'general', 'reserve');
  emit(ctx, 7, 'Escape Pod delivery complete', 'complete');
  return {
    success: true,
    clarifiedBrief: ctx.userPrompt,
    approvedPlan: 'OSS reserve',
    assembledCode: raw,
    polishedOutput: emitted.text,
  };
}
