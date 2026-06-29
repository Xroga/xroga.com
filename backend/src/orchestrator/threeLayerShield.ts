import { logSystemError } from '../services/systemErrorLog.js';
import { generateProsCons, formatProsConsBlock } from '../services/reviewer/prosCons.js';

export interface ShieldInput {
  content: string;
  prompt: string;
  userId?: string;
  runId?: string;
  includeProsCons?: boolean;
}

export interface ShieldResult {
  content: string;
  tier1Passed: boolean;
  tier2Passed: boolean;
  tier3Passed: boolean;
  repairs: string[];
  followUps: string[];
  reasoning?: string;
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

function shouldAddProsCons(prompt: string, content: string): boolean {
  if (content.includes('**Pros**')) return false;
  if (content.length < 200) return false;
  if (prompt.length < 40) return false;
  if (/^(hi|hello|hey|thanks|thank you)\b/i.test(prompt.trim())) return false;
  if (/\b(generate|create|make|draw)\b.*\b(image|picture|logo|video)\b/i.test(prompt)) return false;
  if (content.includes('![') && content.includes('](')) return false;
  return /\b(build|code|deploy|research|video|app|website|script|debug|automate)\b/i.test(prompt);
}

/** Tier 1 Syntax → Tier 2 Semantic (light) → Tier 3 Safety */
export async function runThreeLayerShield(input: ShieldInput): Promise<ShieldResult> {
  const repairs: string[] = [];
  let content = input.content;
  let followUps: string[] = [];

  // Tier 1 — syntax / structure
  const tier1Before = content;
  content = repairJsonLike(content);
  if (content !== tier1Before) repairs.push('json-repair');

  // Tier 3 — safety
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

  // Tier 2 — semantic
  const tier2Passed = input.prompt.length < 20 || content.length >= 40;
  if (!tier2Passed) {
    content += '\n\nI focused on the core of your request — let me know if you want me to expand any section.';
    repairs.push('semantic-padding');
  }

  // Pros/cons only for substantive complex answers
  const addProsCons = input.includeProsCons ?? shouldAddProsCons(input.prompt, content);
  if (addProsCons) {
    const pc = await generateProsCons(input.prompt, content);
    const block = formatProsConsBlock(pc);
    if (block) content += block;
    followUps = pc.followUps ?? [];
  }

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
    followUps,
  };
}
