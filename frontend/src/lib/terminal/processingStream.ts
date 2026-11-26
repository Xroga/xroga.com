import type { XrogaActivityPresentation } from './activityPresentation';
import { publicActivityText } from './activityPresentation';
import { familyOf, type TimelineFamily } from './activityTimeline';
import { redactTerminalText } from './terminalRedaction';

/**
 * The inline work stream: written updates and one line per real step, in the order they happened.
 *
 * Only reported rows appear. A line reads in the past tense only when its row actually completed; the
 * newest running line is the single "live" one. An older line that never reported an end stays exactly
 * as reported, with no tick and no spinner.
 */

export type StreamLineState = 'live' | 'done' | 'failed' | 'reported' | 'waiting';

export interface StreamEvidence {
  command?: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  notes?: string;
  sources?: Array<{ title: string; url: string }>;
}

export interface StreamStep {
  type: 'step'; id: string; text: string; state: StreamLineState; family: TimelineFamily; detail?: string;
  /** Present only when the row really carries something to open. */
  evidence?: StreamEvidence;
}

export type StreamEntry = { type: 'note'; id: string; text: string } | StreamStep;

/** Consecutive finished steps folded under one summary line. */
export interface StreamGroup { type: 'group'; id: string; text: string; families: TimelineFamily[]; steps: StreamStep[] }

const PHRASE: Readonly<Record<TimelineFamily, [one: string, many: string]>> = {
  command: ['ran a command', 'ran commands'], verify: ['ran a check', 'ran checks'], read: ['read a file', 'read files'],
  research: ['searched the web', 'searched the web'], write: ['edited a file', 'edited files'],
  browser: ['used the browser', 'used the browser'], data: ['worked with data', 'worked with data'],
  connected: ['used a connected app', 'used connected apps'], automation: ['ran a workflow', 'ran workflows'],
  transfer: ['moved a file', 'moved files'], deploy: ['deployed', 'deployed'],
  attention: ['asked for attention', 'asked for attention'], issue: ['hit a problem', 'hit problems'],
  other: ['completed a step', 'completed steps'],
};

export function groupTitle(steps: readonly StreamStep[]): string {
  const counts = new Map<TimelineFamily, number>();
  for (const step of steps) counts.set(step.family, (counts.get(step.family) ?? 0) + 1);
  const text = [...counts].map(([family, count]) => PHRASE[family][count > 1 ? 1 : 0]).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Folds runs of two or more finished steps between written updates. The live, failed and waiting lines are
 * never hidden inside a closed group: they stay on their own line.
 */
export function groupStream(entries: readonly StreamEntry[]): Array<StreamEntry | StreamGroup> {
  const out: Array<StreamEntry | StreamGroup> = [];
  let run: StreamStep[] = [];
  const flush = () => {
    if (run.length > 1) {
      out.push({ type: 'group', id: `group-${run[0]!.id}`, text: groupTitle(run), families: [...new Set(run.map(s => s.family))], steps: run });
    } else out.push(...run);
    run = [];
  };
  for (const entry of entries) {
    if (entry.type === 'step' && (entry.state === 'done' || entry.state === 'reported')) { run.push(entry); continue; }
    flush();
    out.push(entry);
  }
  flush();
  return out;
}

const evidenceBlock = (value: string | undefined, max: number): string | undefined => {
  if (!value) return undefined;
  const text = redactTerminalText(value).trim();
  return text ? text.slice(-max) : undefined;
};

function evidenceFor(row: XrogaActivityPresentation): StreamEvidence | undefined {
  const isCommand = row.kind === 'command' || row.kind === 'test';
  const evidence: StreamEvidence = {
    command: isCommand ? evidenceBlock(row.detail, 1000) : undefined,
    output: isCommand ? evidenceBlock(row.body, 6000) : undefined,
    notes: isCommand ? undefined : evidenceBlock(row.body, 4000),
    exitCode: row.exitCode,
    durationMs: row.durationMs,
    sources: row.sources?.length ? row.sources : undefined,
  };
  return evidence.command || evidence.output || evidence.notes || evidence.sources || evidence.exitCode !== undefined
    ? evidence : undefined;
}

const PAST: Readonly<Record<string, string>> = {
  analyzing: 'Analyzed', analysing: 'Analysed', building: 'Built', checking: 'Checked', comparing: 'Compared',
  creating: 'Created', deploying: 'Deployed', editing: 'Edited', generating: 'Generated', implementing: 'Implemented',
  inspecting: 'Inspected', loading: 'Loaded', mapping: 'Mapped', opening: 'Opened', planning: 'Planned',
  preparing: 'Prepared', reading: 'Read', reviewing: 'Reviewed', routing: 'Routed', running: 'Ran', saving: 'Saved',
  searching: 'Searched', summarising: 'Summarised', summarizing: 'Summarized', testing: 'Tested',
  understanding: 'Understood', updating: 'Updated', uploading: 'Uploaded', validating: 'Validated',
  verifying: 'Verified', writing: 'Wrote',
};

export function pastTense(label: string): string {
  return label.replace(/^[A-Za-z]+/, word => PAST[word.toLowerCase()] ?? word);
}

const clean = (value: string | undefined, max: number): string => {
  if (!value) return '';
  const text = publicActivityText(redactTerminalText(value)).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const MAX_ENTRIES = 40;

/**
 * Two lines only matter when there is nothing better to show: the step that spans the whole chat answer,
 * and the first, mechanical reading of the request once a written approach note follows it.
 */
function tidy(entries: StreamEntry[]): StreamEntry[] {
  const otherSteps = entries.some(e => e.type === 'step' && !e.id.endsWith(WRAPPER_STEP));
  const notes = entries.filter(e => e.type === 'note');
  const superseded = notes.length > 1 ? notes[0] : undefined;
  return entries.filter(e => e.type === 'step'
    ? !(otherSteps && e.id.endsWith(WRAPPER_STEP) && e.state !== 'failed')
    : e !== superseded);
}

const WRAPPER_STEP = 'preparing-answer';

export function buildProcessingStream(rows: readonly XrogaActivityPresentation[], running: boolean): StreamEntry[] {
  const liveId = running ? rows.findLast(row => !row.note && row.status === 'active')?.id : undefined;
  const entries: StreamEntry[] = [];
  const seenNotes = new Set<string>();
  for (const row of rows) {
    if (row.note) {
      const text = clean(row.label, 400);
      if (text && !seenNotes.has(text)) { seenNotes.add(text); entries.push({ type: 'note', id: row.id, text }); }
      continue;
    }
    if (row.kind === 'respond') continue;
    const label = clean(row.label, 140);
    // "Ready" announces the connection, not a piece of work.
    if (!label || /^ready$/i.test(label)) continue;
    const state: StreamLineState =
      row.status === 'complete' ? 'done'
        : row.status === 'error' ? 'failed'
          : row.status === 'waiting' || row.status === 'warning' ? 'waiting'
            : row.id === liveId ? 'live' : 'reported';
    // A command line reads as the command itself, which says more than "Command finished".
    const command = row.kind === 'command' ? clean(row.detail, 90) : '';
    const verb = state === 'done' ? 'Ran ' : state === 'live' ? 'Running ' : state === 'failed' ? 'Failed: ' : '';
    const text = command ? `${verb}${command}` : state === 'done' ? pastTense(label) : label;
    const previous = entries.at(-1);
    // The same line reported twice in a row adds nothing.
    if (previous?.type === 'step' && previous.text === text && previous.state === state) continue;
    const detail = row.kind === 'command' || row.kind === 'test' ? '' : clean(row.detail, 120);
    entries.push({
      type: 'step', id: row.id, text, state,
      // Web pages being read belong with the search that found them, not with project files.
      family: row.kind === 'read-source' || row.kind === 'open-source' ? 'research' : familyOf(row.kind),
      detail: detail && !text.toLowerCase().includes(detail.toLowerCase()) ? detail : undefined,
      evidence: evidenceFor(row),
    });
  }
  return tidy(entries).slice(-MAX_ENTRIES);
}
