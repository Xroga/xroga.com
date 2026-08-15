/**
 * §18 — when the converter stage is worth a model call.
 *
 * `convertUserRequest` currently runs on every build: a DeepSeek Flash call that rewrites the
 * user's request into a builder instruction before the specialist model has seen anything. For
 * a request like "add a dark mode toggle to the settings page" that call spends latency and
 * money to produce a longer restatement of a sentence that was already unambiguous.
 *
 * §18's rule: a clear request gets deterministic normalization and goes straight to the
 * specialist; an ambiguous or large one gets the planning/conversion call it actually needs.
 *
 * ## Why the default is *not* to convert
 *
 * The costs are asymmetric. Skipping conversion on a request that needed it costs one weaker
 * first attempt, which the repair and escalation stages already exist to catch. Converting a
 * request that did not need it costs a model call on every single build forever, and — more
 * quietly — inserts a paraphrase between the user's words and the model that acts on them.
 * A paraphrase is a lossy channel: "use the existing Button component" survives it far less
 * reliably than a specific instruction deserves.
 *
 * So conversion is opt-in on evidence of ambiguity, not opt-out on evidence of clarity.
 */

import type { ComplexityAssessment } from './complexity.js';
import type { TaskAnalysis } from './taskClass.js';

export interface ConverterDecision {
  /** True when a planning/conversion model call is justified. */
  readonly convert: boolean;
  readonly reason: string;
  /**
   * The instruction to use when `convert` is false.
   *
   * Deterministically derived from the user's own words. Empty when `convert` is true, because
   * the conversion call produces the instruction in that branch.
   */
  readonly normalizedInstruction: string;
}

export interface ConverterPolicyInput {
  readonly prompt: string;
  readonly analysis: TaskAnalysis;
  readonly complexity: ComplexityAssessment;
  readonly researchBlock?: string;
}

/**
 * Hedging and vagueness — the honest signals that the user has not decided yet.
 *
 * These are the phrasings where a planning pass genuinely adds information, because the request
 * under-determines the result and something has to choose.
 */
const AMBIGUITY_RE =
  /\b(?:something\s+like|some\s+kind\s+of|not\s+sure|i\s+guess|maybe|or\s+whatever|etc\.?|and\s+so\s+on|you\s+decide|up\s+to\s+you|surprise\s+me|make\s+it\s+(?:nice|good|better|cool)|whatever\s+you\s+think)\b/i;

/**
 * A request so short it names a product category and nothing else.
 *
 * "Build me a SaaS" is not a specification; every meaningful decision is still open. This is
 * the one *short* case that needs conversion, which is why length alone cannot be the test.
 */
const BARE_CATEGORY_RE =
  /^\s*(?:build|create|make|write|generate)\s+(?:me\s+)?(?:an?\s+)?(?:app|application|site|website|saas|platform|tool|game|bot|dashboard|store|shop|blog|clone)\s*\.?\s*$/i;

/** Long enough that the request is likely a brief rather than an instruction. */
const LARGE_PROMPT_CHARS = 2_400;

const ZERO_WIDTH_RE = /[​-‍﻿]/g;

/**
 * Deterministic normalization.
 *
 * Whitespace and invisible characters only. It deliberately does not rewrite, expand or
 * "improve" the request: the entire value of skipping the converter is that the specialist
 * sees what the user actually wrote.
 */
export function normalizeRequest(prompt: string, researchBlock?: string): string {
  const cleaned = prompt
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return researchBlock?.trim() ? `${cleaned}\n\n${researchBlock.trim()}` : cleaned;
}

export function decideConversion(input: ConverterPolicyInput): ConverterDecision {
  const prompt = input.prompt ?? '';
  const normalized = normalizeRequest(prompt, input.researchBlock);

  const converting = (reason: string): ConverterDecision => ({
    convert: true,
    reason,
    normalizedInstruction: '',
  });
  const direct = (reason: string): ConverterDecision => ({
    convert: false,
    reason,
    normalizedInstruction: normalized,
  });

  if (BARE_CATEGORY_RE.test(prompt)) {
    return converting('the request names a product category and leaves every decision open');
  }

  if (AMBIGUITY_RE.test(prompt)) {
    return converting('the request contains hedging that under-determines the result');
  }

  if (prompt.length > LARGE_PROMPT_CHARS) {
    return converting(
      `the request is ${prompt.length} characters and reads as a brief rather than an instruction`,
    );
  }

  if (input.complexity.level === 'critical' || input.complexity.level === 'high') {
    return converting(`complexity is ${input.complexity.level}: planning earns its call here`);
  }

  // A request whose classification never found a strong signal is one this policy should not
  // claim to understand either.
  if (!input.analysis.confident && input.analysis.primary === 'simple_chat') {
    return converting('no deterministic signal identified what this request is');
  }

  return direct(
    `the request is specific and ${input.complexity.level} complexity: normalization is enough`,
  );
}
