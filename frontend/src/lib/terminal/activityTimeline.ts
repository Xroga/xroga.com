import type { XrogaActivityKind, XrogaActivityPresentation } from './activityPresentation';
import type { TerminalEvent } from './terminalEvent';

/**
 * View model for the Xroga activity timeline.
 *
 * Input is the already-sanitised, already-coalesced `XrogaActivityPresentation[]` that comes from the
 * canonical event adapters. This module only decides how those real rows are summarised and which one is
 * "current". It never creates a row, a label, a count or a percentage that the rows do not support.
 */

export type TimelineFamily =
  | 'command' | 'verify' | 'read' | 'research' | 'write' | 'browser' | 'data' | 'connected'
  | 'automation' | 'transfer' | 'deploy' | 'attention' | 'issue' | 'other';

export type TimelineTone = 'done' | 'failed' | 'warning' | 'stopped';

export type TimelineState = 'idle' | 'working' | 'waiting' | 'failed' | 'stopped' | 'done';

export interface TimelineItem {
  id: string;
  family: TimelineFamily;
  /** One line, past tense for finished work. */
  label: string;
  tone: TimelineTone;
  /** How many finished rows this item summarises. */
  count: number;
  failed: number;
  rows: readonly XrogaActivityPresentation[];
  durationMs?: number;
}

export interface ActivityTimelineModel {
  state: TimelineState;
  settled: TimelineItem[];
  /** The one step shown as live. Null when nothing is running. */
  active: XrogaActivityPresentation | null;
  /** Other steps that are genuinely running in parallel with `active`. */
  otherActive: number;
  /** Total rows the model was built from. */
  total: number;
}

const FAMILY_BY_KIND: Record<XrogaActivityKind, TimelineFamily> = {
  command: 'command', test: 'verify', verify: 'verify',
  'read-file': 'read', 'read-source': 'read', 'open-source': 'read',
  search: 'research', compare: 'research', summarize: 'research',
  'write-file': 'write', code: 'write',
  browser: 'browser', database: 'data',
  'connected-app-read': 'connected', 'connected-app-write': 'connected',
  automation: 'automation', upload: 'transfer', download: 'transfer', deploy: 'deploy',
  approval: 'attention', connection: 'attention', waiting: 'attention',
  warning: 'issue', error: 'issue',
  understand: 'other', respond: 'other', complete: 'other',
};

export function familyOf(kind: XrogaActivityKind): TimelineFamily {
  return FAMILY_BY_KIND[kind] ?? 'other';
}

const isFinished = (row: XrogaActivityPresentation) => row.status !== 'active' && row.status !== 'waiting';
const isFailure = (row: XrogaActivityPresentation) => row.status === 'error';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function groupLabel(family: TimelineFamily, rows: readonly XrogaActivityPresentation[]): string {
  const n = rows.length;
  if (n === 1) return rows[0].label;
  const allKind = (kind: XrogaActivityKind) => rows.every(row => row.kind === kind);
  switch (family) {
    case 'command': return `Ran ${plural(n, 'command')}`;
    case 'verify': return `Ran ${plural(n, 'check')}`;
    case 'read':
      if (allKind('read-file')) return `Read ${plural(n, 'file')}`;
      if (allKind('read-source') || allKind('open-source')) return `Read ${plural(n, 'source')}`;
      return `Read ${plural(n, 'item')}`;
    case 'research': return allKind('search') ? `Searched the web ${n} times` : `Researched in ${plural(n, 'step')}`;
    case 'write': return allKind('write-file') ? `Edited ${plural(n, 'file')}` : `Implemented changes in ${plural(n, 'step')}`;
    case 'browser': return `Checked the preview ${n} times`;
    case 'data': return `Queried data ${n} times`;
    case 'connected': return `Used connected apps ${n} times`;
    case 'transfer': return `Handled ${plural(n, 'transfer')}`;
    default: return `Completed ${plural(n, 'step')}`;
  }
}

function toneOf(rows: readonly XrogaActivityPresentation[]): TimelineTone {
  if (rows.some(isFailure)) return 'failed';
  if (rows.some(row => row.status === 'cancelled' || row.status === 'interrupted')) return 'stopped';
  if (rows.some(row => row.status === 'warning')) return 'warning';
  return 'done';
}

function durationOf(rows: readonly XrogaActivityPresentation[]): number | undefined {
  const known = rows.map(row => row.durationMs).filter((value): value is number => typeof value === 'number');
  return known.length === rows.length && known.length ? known.reduce((sum, value) => sum + value, 0) : undefined;
}

function toItem(family: TimelineFamily, rows: XrogaActivityPresentation[]): TimelineItem {
  const failed = rows.filter(isFailure).length;
  const base = groupLabel(family, rows);
  // A failure is never folded into a plain success line: it stays in the label.
  const label = failed && rows.length > 1 ? `${base} (${failed} failed)` : base;
  return { id: rows[0].id, family, label, tone: toneOf(rows), count: rows.length, failed, rows, durationMs: durationOf(rows) };
}

/** Summarise finished rows. Only consecutive rows of one family merge, so the order of events is kept. */
export function summariseSettled(rows: readonly XrogaActivityPresentation[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let run: XrogaActivityPresentation[] = [];
  let runFamily: TimelineFamily | null = null;
  const flush = () => { if (run.length && runFamily) items.push(toItem(runFamily, run)); run = []; runFamily = null; };
  for (const row of rows) {
    const family = familyOf(row.kind);
    // An error that is a row of its own (kind "error") is never merged away: it must stay readable.
    const standalone = row.kind === 'error' || row.kind === 'warning' || row.status === 'warning' || family === 'other' || family === 'attention';
    if (standalone || family !== runFamily) flush();
    if (standalone) { items.push(toItem(family, [row])); continue; }
    runFamily = family;
    run.push(row);
  }
  flush();
  return items;
}

export interface BuildTimelineOptions {
  /** True while the run is still open on the client. */
  runActive?: boolean;
  /** Terminal outcome of the run, when known. */
  outcome?: 'success' | 'failure' | 'interrupted' | null;
  /** Row the UI is already showing as live, used to avoid flicker between parallel steps. */
  displayedActiveId?: string | null;
  /** Epoch ms when `displayedActiveId` began to be shown. */
  displayedSince?: number;
  now?: number;
  minDwellMs?: number;
}

export function buildActivityTimeline(rows: readonly XrogaActivityPresentation[], options: BuildTimelineOptions = {}): ActivityTimelineModel {
  const { runActive, outcome = null, displayedActiveId = null, displayedSince = 0, now = 0, minDwellMs = 650 } = options;
  const live = outcome || runActive === false ? [] : rows.filter(row => !isFinished(row));
  const attention = live.findLast(row => row.status === 'waiting' || row.kind === 'approval');
  let active: XrogaActivityPresentation | null = attention ?? live.at(-1) ?? null;
  // Two steps really are running at once. Do not swap the headline faster than a person can read it.
  const shown = displayedActiveId ? live.find(row => row.id === displayedActiveId) : undefined;
  if (!attention && shown && active && shown.id !== active.id && now - displayedSince < minDwellMs) active = shown;

  const settled = summariseSettled(rows.flatMap(row => {
    if (isFinished(row)) return [row];
    if (outcome || runActive === false) return [{
      ...row, status: 'warning' as const, label: `${row.label} · No completion update`,
    }];
    return [];
  }));
  const otherActive = Math.max(0, live.length - (active ? 1 : 0));

  let state: TimelineState = 'idle';
  if (active?.status === 'waiting' || active?.kind === 'approval') state = 'waiting';
  else if (active || runActive) state = 'working';
  else if (outcome === 'failure' || rows.at(-1)?.status === 'error') state = 'failed';
  else if (outcome === 'interrupted' || rows.some(row => row.status === 'cancelled' || row.status === 'interrupted')) state = 'stopped';
  else if (rows.length) state = 'done';
  return { state, settled, active, otherActive, total: rows.length };
}

/** A request can wait without an operation running. Writing requires an actual text delta. */
export function pendingWorkLabel(events: readonly TerminalEvent[], hasWork: boolean): string {
  const latest = events.findLast(event => event.kind !== 'session');
  if (latest?.kind === 'output' && latest.rawEvent === 'delta' && latest.text.trim()) return 'Writing response';
  if (hasWork || events.length > 0) return 'Waiting for the next update';
  return 'Starting request';
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return '';
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60), seconds = total % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** The label the live line shows. Generic words are used only until the row supplies its own description. */
export function liveLabel(row: XrogaActivityPresentation, otherActive: number): string {
  return otherActive > 0 ? `${row.label} +${otherActive} more` : row.label;
}
