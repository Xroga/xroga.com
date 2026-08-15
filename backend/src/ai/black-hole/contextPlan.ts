/**
 * Black Hole ∞ context planner.
 *
 * §9's closing line is the design brief: *large-context models exist to handle genuinely large
 * tasks, not to justify waste*. A million-token window is a capability, not a budget, and the
 * cheapest token is the one never sent. So this planner fills a budget in the priority order
 * §9 gives and stops, rather than assembling everything available and hoping the window holds.
 *
 * ## Dropping is reported, never silent
 *
 * Every segment that does not fit appears in `dropped` with the reason. A planner that quietly
 * discards the file the user was asking about produces a model reply that is confidently about
 * the wrong thing, and nothing downstream can tell that from a model that simply reasoned
 * badly. The distinction has to be visible at the point it happens.
 *
 * ## The current request is never dropped
 *
 * It is the one segment with no fallback: a plan that trimmed it would be answering a question
 * nobody asked. If it alone exceeds the budget the planner fails loudly instead, because that
 * is a caller error — a budget too small for the request — and silently truncating it converts
 * a clear failure into a plausible wrong answer.
 *
 * ## No model call happens here
 *
 * §4 forbids spending a model call on obvious classification, and the same logic applies with
 * more force to context assembly, which runs on every single request. Where §9 asks for
 * "summarized older history", a caller-supplied summary is used when one exists; otherwise the
 * planner emits a deterministic transcript digest and labels it as a digest. Calling a
 * mechanical truncation a "summary" would misrepresent what the model is being handed.
 */

import { estimateTokens } from '../openaiCompat.js';

/** §9's priority order, highest first. The array order is the priority. */
export const CONTEXT_PRIORITY = [
  'current_request',
  'target_project_state',
  'relevant_files',
  'recent_conversation',
  'project_memory',
  'summarized_history',
] as const;

export type ContextSegmentKind = (typeof CONTEXT_PRIORITY)[number];

export interface ContextFile {
  readonly path: string;
  readonly content: string;
  /** 0..1. Files are admitted in descending relevance until the budget is spent. */
  readonly relevance: number;
  /** Why this file was considered relevant — symbol hit, import edge, test, manifest. */
  readonly reason?: string;
}

export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly at?: string;
}

export interface MemoryItem {
  readonly label: string;
  readonly content: string;
  readonly relevance?: number;
}

export interface ContextPlanInput {
  readonly request: string;
  /** Maximum input tokens this plan may occupy. */
  readonly budgetTokens: number;
  /** Manifest, architecture notes, dependency summary — the target project's shape. */
  readonly projectState?: string | null;
  readonly files?: readonly ContextFile[];
  readonly conversation?: readonly ConversationTurn[];
  readonly memory?: readonly MemoryItem[];
  /** §9 names previous failure logs explicitly; they ride with the project state. */
  readonly previousFailures?: readonly string[];
  /** A real summary of older history, when the caller already has one. */
  readonly historySummary?: string | null;
  /** How many recent turns count as "recent" rather than "older". */
  readonly recentTurnCount?: number;
}

export interface ContextSegment {
  readonly kind: ContextSegmentKind;
  readonly label: string;
  readonly content: string;
  readonly estimatedTokens: number;
}

export interface DroppedSegment {
  readonly kind: ContextSegmentKind;
  readonly label: string;
  readonly reason: string;
}

export interface ContextPlan {
  readonly segments: readonly ContextSegment[];
  readonly dropped: readonly DroppedSegment[];
  readonly usedTokens: number;
  readonly budgetTokens: number;
  /** Rendered system-side context, priority-ordered. Empty when only the request fits. */
  readonly contextText: string;
}

export class ContextBudgetError extends Error {
  readonly code = 'CONTEXT_BUDGET_TOO_SMALL' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ContextBudgetError';
  }
}

const DEFAULT_RECENT_TURNS = 6;

/** A compact, deterministic digest of turns that will not fit in full. */
function digestTurns(turns: readonly ConversationTurn[]): string {
  return turns
    .map((turn) => {
      const flattened = turn.content.replace(/\s+/g, ' ').trim();
      const clipped = flattened.length > 180 ? `${flattened.slice(0, 180)}…` : flattened;
      return `${turn.role}: ${clipped}`;
    })
    .join('\n');
}

function renderFiles(files: readonly ContextFile[]): string {
  return files
    .map((file) => {
      const why = file.reason ? ` (${file.reason})` : '';
      return `--- ${file.path}${why}\n${file.content}`;
    })
    .join('\n\n');
}

/**
 * Builds the context for one request.
 *
 * Segments are admitted strictly in §9's priority order. Within `relevant_files` the admission
 * is by descending relevance, and a file that does not fit is dropped by name rather than
 * truncated: half a source file is frequently worse than none, because a model shown the first
 * forty lines of a module will infer the rest and state the inference as fact.
 */
export function planContext(input: ContextPlanInput): ContextPlan {
  const budget = Math.max(0, Math.floor(input.budgetTokens));
  const segments: ContextSegment[] = [];
  const dropped: DroppedSegment[] = [];
  let used = 0;

  const requestTokens = estimateTokens(input.request);
  if (requestTokens > budget) {
    throw new ContextBudgetError(
      `The request alone needs ${requestTokens} tokens and the budget is ${budget}. ` +
        'Truncating the user request would answer a different question than the one asked.',
    );
  }
  segments.push({
    kind: 'current_request',
    label: 'current user request',
    content: input.request,
    estimatedTokens: requestTokens,
  });
  used += requestTokens;

  const remaining = () => budget - used;

  const admit = (
    kind: ContextSegmentKind,
    label: string,
    content: string,
  ): boolean => {
    const trimmed = content.trim();
    if (!trimmed) return false;
    const tokens = estimateTokens(trimmed);
    if (tokens > remaining()) {
      dropped.push({
        kind,
        label,
        reason: `needs ${tokens} tokens, ${remaining()} remained in the budget`,
      });
      return false;
    }
    segments.push({ kind, label, content: trimmed, estimatedTokens: tokens });
    used += tokens;
    return true;
  };

  // 2. Target project state, carrying the previous failure logs §9 names.
  const stateParts: string[] = [];
  if (input.projectState?.trim()) stateParts.push(input.projectState.trim());
  if (input.previousFailures?.length) {
    stateParts.push(`Previous failures:\n${input.previousFailures.map((line) => `- ${line}`).join('\n')}`);
  }
  if (stateParts.length) admit('target_project_state', 'project state', stateParts.join('\n\n'));

  // 3. Relevant files, most relevant first.
  const candidates = [...(input.files ?? [])].sort((a, b) => b.relevance - a.relevance);
  const admitted: ContextFile[] = [];
  for (const file of candidates) {
    const tokens = estimateTokens(file.content);
    // The +8 covers the path header this file will carry once rendered.
    if (tokens + 8 > remaining()) {
      dropped.push({
        kind: 'relevant_files',
        label: file.path,
        reason: `needs ${tokens} tokens, ${remaining()} remained in the budget`,
      });
      continue;
    }
    admitted.push(file);
    used += tokens + 8;
  }
  if (admitted.length) {
    const content = renderFiles(admitted);
    segments.push({
      kind: 'relevant_files',
      label: `${admitted.length} relevant file(s)`,
      content,
      estimatedTokens: estimateTokens(content),
    });
  }

  // 4. Recent conversation, then 6. older history — split before either is admitted so the
  //    recent turns keep their priority over a summary of everything before them.
  const turns = input.conversation ?? [];
  const recentCount = input.recentTurnCount ?? DEFAULT_RECENT_TURNS;
  const recent = turns.slice(-recentCount);
  const older = turns.slice(0, Math.max(0, turns.length - recentCount));

  if (recent.length) {
    admit(
      'recent_conversation',
      `${recent.length} recent turn(s)`,
      recent.map((turn) => `${turn.role}: ${turn.content}`).join('\n\n'),
    );
  }

  // 5. Retrieved project memory.
  const memory = [...(input.memory ?? [])].sort(
    (a, b) => (b.relevance ?? 0) - (a.relevance ?? 0),
  );
  for (const item of memory) {
    admit('project_memory', item.label, `${item.label}: ${item.content}`);
  }

  // 6. Older history — a real summary when the caller has one, otherwise a labelled digest.
  if (input.historySummary?.trim()) {
    admit('summarized_history', 'summary of older history', input.historySummary);
  } else if (older.length) {
    admit(
      'summarized_history',
      `digest of ${older.length} earlier turn(s)`,
      `Condensed transcript digest (mechanically shortened, not model-summarized):\n${digestTurns(older)}`,
    );
  }

  const contextText = segments
    .filter((segment) => segment.kind !== 'current_request')
    .map((segment) => `# ${segment.label}\n${segment.content}`)
    .join('\n\n');

  return {
    segments,
    dropped,
    usedTokens: used,
    budgetTokens: budget,
    contextText,
  };
}
