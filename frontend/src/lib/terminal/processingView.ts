import type { SwarmTodoItem } from '../swarm';
import type { XrogaActivityKind, XrogaActivityPresentation } from './activityPresentation';
import { publicActivityText } from './activityPresentation';
import { familyOf, type TimelineFamily } from './activityTimeline';
import { redactTerminalText } from './terminalRedaction';

/**
 * Live processing view model (the compact surface shown above an answer while it is being produced).
 *
 * Provider independent by construction: the only input is `XrogaActivityPresentation` rows, which are already
 * normalised from the canonical Xroga events (swarm SSE and Software Agent V2). A provider that streams no
 * reasoning summary therefore behaves exactly like one that does: the surface is driven by real execution events.
 *
 * Nothing here calls a model, waits, or invents progress. Heading and paragraph are deterministic templates over
 * the label/detail of a real row. Raw provider reasoning, prompts and credentials never reach this module; text is
 * passed through the existing public-text and redaction filters again as a backstop.
 */

export type ProcessingTone = 'brand' | 'model' | 'success' | 'warning' | 'error' | 'idle';

export type ProcessingStepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface ProcessingChecklistItem {
  id: string;
  label: string;
  status: ProcessingStepStatus;
}

export interface ProcessingView {
  /** Short dynamic heading, e.g. "Searching the web". */
  heading: string;
  /** One or two natural sentences describing what is really happening now. */
  paragraph: string;
  family: TimelineFamily | 'start';
  tone: ProcessingTone;
  /** Present only for genuinely multi-stage requests with a backend-supplied plan. */
  checklist: ProcessingChecklistItem[] | null;
  /** Finished real steps so far (no denominator, no percentage). */
  finishedSteps: number;
  failedSteps: number;
}

const HEADING_BY_KIND: Partial<Record<XrogaActivityKind, string>> = {
  understand: 'Understanding your request',
  search: 'Searching the web',
  'open-source': 'Reading sources',
  'read-source': 'Reading sources',
  compare: 'Comparing what it found',
  summarize: 'Putting findings together',
  'read-file': 'Reading project files',
  'write-file': 'Editing files',
  code: 'Writing code',
  command: 'Running commands',
  test: 'Running checks',
  verify: 'Verifying the result',
  browser: 'Checking the preview',
  database: 'Working with data',
  'connected-app-read': 'Reading connected apps',
  'connected-app-write': 'Updating connected apps',
  automation: 'Running a workflow',
  upload: 'Uploading',
  download: 'Preparing a download',
  deploy: 'Preparing the deployment',
  approval: 'Waiting for your approval',
  connection: 'A connection is needed',
  waiting: 'Waiting',
  respond: 'Writing the answer',
  warning: 'Needs attention',
  error: 'Hit a problem',
};

const MODEL_KINDS: ReadonlySet<XrogaActivityKind> = new Set(['understand', 'respond', 'summarize', 'compare']);

function toneFor(row: XrogaActivityPresentation | null): ProcessingTone {
  if (!row) return 'brand';
  if (row.status === 'error') return 'error';
  if (row.status === 'warning' || row.status === 'waiting' || row.kind === 'approval' || row.kind === 'connection') return 'warning';
  if (MODEL_KINDS.has(row.kind)) return 'model';
  return 'brand';
}

const clean = (value: string | undefined, max: number): string => {
  if (!value) return '';
  const text = publicActivityText(redactTerminalText(value)).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const sentence = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`);

function progressClause(finished: number, failed: number): string {
  if (finished <= 0 && failed <= 0) return '';
  const done = finished - failed;
  const parts: string[] = [];
  if (done > 0) parts.push(`${done} ${done === 1 ? 'step' : 'steps'} finished`);
  if (failed > 0) parts.push(`${failed} ${failed === 1 ? 'step' : 'steps'} failed`);
  return `${parts.join(', ')} so far.`;
}

/** Backend plan entries only. A status the backend did not send is never promoted. */
export function checklistFromTodos(
  todos: readonly Pick<SwarmTodoItem, 'id' | 'label' | 'status'>[] | undefined,
  outcome: 'success' | 'failure' | 'interrupted' | null = null,
): ProcessingChecklistItem[] | null {
  if (!todos || todos.length < 3) return null;
  const items = todos.slice(0, 12).map((todo): ProcessingChecklistItem => {
    const label = clean(todo.label.replace(/^\[Phase \d+\]\s*/i, ''), 90);
    let status: ProcessingStepStatus =
      todo.status === 'done' ? 'done' : todo.status === 'active' ? 'active' : todo.status === 'skipped' ? 'skipped' : 'pending';
    // A run that ended in failure leaves its running step failed, never silently done.
    if (status === 'active' && outcome === 'failure') status = 'failed';
    if (status === 'active' && outcome === 'interrupted') status = 'pending';
    return { id: todo.id, label, status };
  }).filter(item => item.label);
  return items.length >= 3 ? items : null;
}

export interface BuildProcessingViewOptions {
  /** Active row chosen by the timeline model; null before any event or between steps. */
  active: XrogaActivityPresentation | null;
  otherActive?: number;
  rows: readonly XrogaActivityPresentation[];
  /** Fallback wording while no event has arrived yet. */
  pendingLabel?: string;
  todos?: readonly Pick<SwarmTodoItem, 'id' | 'label' | 'status'>[];
  outcome?: 'success' | 'failure' | 'interrupted' | null;
}

export function buildProcessingView(options: BuildProcessingViewOptions): ProcessingView {
  const { active, otherActive = 0, rows, pendingLabel = 'Starting request', todos, outcome = null } = options;
  const finishedRows = rows.filter(row => row.status !== 'active' && row.status !== 'waiting');
  const failedSteps = rows.filter(row => row.status === 'error').length;
  const finishedSteps = finishedRows.length;

  if (!active) {
    return {
      heading: finishedSteps > 0 ? 'Working through your request' : 'Getting started',
      paragraph: sentence(clean(pendingLabel, 120) || 'Starting request'),
      family: 'start',
      tone: 'brand',
      checklist: checklistFromTodos(todos, outcome),
      finishedSteps,
      failedSteps,
    };
  }

  const family = familyOf(active.kind);
  const heading = HEADING_BY_KIND[active.kind] ?? 'Working on your request';
  const label = clean(active.label, 140);
  const detail = clean(active.detail, 120);
  const lead = detail && !label.toLowerCase().includes(detail.toLowerCase()) ? `${label}: ${detail}` : label;
  const parallel = otherActive > 0 ? `${otherActive} more ${otherActive === 1 ? 'step is' : 'steps are'} running alongside.` : '';
  const paragraph = [sentence(lead || heading), parallel, progressClause(finishedSteps, failedSteps)].filter(Boolean).join(' ');

  return {
    heading,
    paragraph,
    family,
    tone: toneFor(active),
    checklist: checklistFromTodos(todos, outcome),
    finishedSteps,
    failedSteps,
  };
}
