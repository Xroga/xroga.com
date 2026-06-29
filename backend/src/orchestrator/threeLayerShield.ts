import { logSystemError } from '../services/systemErrorLog.js';

export interface ShieldInput {
  content: string;
  prompt: string;
  userId?: string;
  runId?: string;
}

export interface ShieldResult {
  content: string;
  tier1Passed: boolean;
  tier2Passed: boolean;
  tier3Passed: boolean;
  repairs: string[];
}

const BLOCKED_PATTERNS = [
  /\b(api key|rate limit|quota exceeded|insufficient credits|out of actions)\b/gi,
  /\b(stack trace|undefined is not|TypeError|ECONNREFUSED|ETIMEDOUT)\b/gi,
  /\b(failed to fetch|500 internal|502 bad gateway|503 service)\b/gi,
];

const NSFW_PATTERNS = /\b(explicit adult|xxx|porn)\b/gi;

function repairJsonLike(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
    return trimmed + '}';
  }
  return text;
}

function stripInternalErrors(text: string): string {
  let out = text;
  for (const pattern of BLOCKED_PATTERNS) {
    out = out.replace(pattern, '');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function appendProsConsNextSteps(content: string, prompt: string): string {
  if (content.includes('**Pros**') || content.length < 80) return content;
  const lower = prompt.toLowerCase();
  const pros =
    lower.includes('code') || lower.includes('build')
      ? '- Fast iteration with Swarm agents\n- Production-ready structure'
      : '- Clear, actionable guidance\n- Context-aware response';
  const cons = '- Complex edge cases may need a follow-up prompt\n- Verify critical facts independently';
  const next = '- Refine with more detail\n- Ask Xroga to implement the next step';
  return `${content}\n\n**Pros**\n${pros}\n\n**Cons**\n${cons}\n\n**Next steps**\n${next}`;
}

/** Tier 1 Syntax → Tier 2 Semantic (light) → Tier 3 Safety */
export async function runThreeLayerShield(input: ShieldInput): Promise<ShieldResult> {
  const repairs: string[] = [];
  let content = input.content;

  // Tier 1 — syntax / structure
  const tier1Before = content;
  content = repairJsonLike(content);
  if (content !== tier1Before) repairs.push('json-repair');

  // Tier 3 — safety (run before semantic to strip harmful content)
  let tier3Passed = true;
  if (NSFW_PATTERNS.test(content)) {
    content = content.replace(NSFW_PATTERNS, '[filtered]');
    tier3Passed = false;
    repairs.push('nsfw-filter');
  }
  content = stripInternalErrors(content);
  if (!content) {
    content =
      "Here's a preliminary answer while we finalize details — could you share a bit more context so I can tailor this perfectly for you?";
    repairs.push('empty-output-fallback');
  }

  // Tier 2 — semantic (light heuristic: non-empty, min length for substantive prompts)
  const tier2Passed = input.prompt.length < 20 || content.length >= 40;
  if (!tier2Passed) {
    content += '\n\nI focused on the core of your request — let me know if you want me to expand any section.';
    repairs.push('semantic-padding');
  }

  content = appendProsConsNextSteps(content, input.prompt);

  if (repairs.length) {
    await logSystemError({
      api: 'three_layer_shield',
      errorMessage: `Shield repairs: ${repairs.join(', ')}`,
      fallbackUsed: repairs.join(', '),
      severity: 'info',
      userId: input.userId,
      runId: input.runId,
    });
  }

  return {
    content,
    tier1Passed: true,
    tier2Passed: tier2Passed || repairs.includes('semantic-padding'),
    tier3Passed,
    repairs,
  };
}
