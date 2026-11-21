import type { TerminalEvent } from './terminalEvent';
import { redactTerminalText } from './terminalRedaction';

export type XrogaActivityKind =
  | 'respond' | 'understand' | 'search' | 'open-source' | 'read-source' | 'compare' | 'summarize'
  | 'read-file' | 'write-file' | 'code' | 'command' | 'test' | 'browser' | 'database'
  | 'connected-app-read' | 'connected-app-write' | 'automation' | 'upload' | 'download'
  | 'deploy' | 'verify' | 'approval' | 'connection' | 'waiting' | 'complete' | 'warning' | 'error';

export type XrogaActivityStatus = 'active' | 'complete' | 'waiting' | 'warning' | 'error' | 'cancelled' | 'interrupted';

export interface XrogaActivityPresentation {
  id: string;
  kind: XrogaActivityKind;
  label: string;
  detail?: string;
  status: XrogaActivityStatus;
  body?: string;
  startedAt: number;
  updatedAt: number;
  durationMs?: number;
  exitCode?: number;
  evidenceRefs?: string[];
  artifactRefs?: string[];
}

const INTERNAL_MARKERS = /\b(?:business\.(?:read|action)|research\.(?:public-web|x)|software\.implement|repository\.(?:read|write)|validation\.run|attachment\.analyze|requiredAuthorities|selectedModel|fallbackModels|toolCallId|runtimeSessionId|provider route|sandbox:execute|model:execute)\b/gi;
const GENERIC_PLACEHOLDER = /^(?:thinking|initializing|writing(?: (?:your )?response)?|creating|understanding (?:your|the) request|analyzing your (?:question|request)|composing (?:your|a|the) (?:(?:clear|structured) )?(?:answer|response|reply)|working on (?:it|(?:your )?(?:request|response)))(?:\.{3}|…)?$/i;

export function hasInternalPresentationLeak(value: string): boolean {
  INTERNAL_MARKERS.lastIndex = 0;
  return INTERNAL_MARKERS.test(value);
}

/** Presentation-boundary sanitizer. It is intentionally not applied to code or files. */
export function publicActivityText(value: string): string {
  INTERNAL_MARKERS.lastIndex = 0;
  return value
    .replace(INTERNAL_MARKERS, '')
    .replace(/\b(?:architect|builder|reviewer|security|session|routing)\s*:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[·:,-]+|[·:,-]+\s*$/g, '')
    .trim();
}

/** Generic client/legacy filler is not evidence that any operation occurred. */
export function isGenericPlaceholderActivity(value: string): boolean {
  return GENERIC_PLACEHOLDER.test(publicActivityText(value));
}

function kindFor(event: TerminalEvent): XrogaActivityKind {
  const type = event.canonical?.type ?? '';
  const operation = event.canonical?.metadata?.softwareEventType;
  const value = `${type} ${event.text}`.toLowerCase();
  if (event.canonical?.source === 'software-agent-v2') {
    if (operation === 'command.started' || operation === 'command.output' || operation === 'command.completed') return 'command';
    if (operation === 'check.started' || operation === 'check.completed') return 'test';
  }
  if (event.level === 'error' || type.endsWith('.failed')) return 'error';
  if (event.level === 'warn') return 'warning';
  if (type === 'approval.requested') return 'approval';
  if (type === 'connection.required') return 'connection';
  if (/\b(slack|gmail|notion|hubspot|google drive|calendar)\b/.test(value)) {
    return /\b(send|sent|update|updated|create|created|write|wrote)\b/.test(event.text.toLowerCase()) ? 'connected-app-write' : 'connected-app-read';
  }
  if (type.includes('file.read') || /\b(reading|opening|inspecting)\b.*\b(files?|project)\b/.test(value)) return 'read-file';
  if (type.match(/file\.(created|updated|deleted|renamed)/) || /\b(updating|writing|creating|deleting|renaming)\b.*\b(files?|project|code)\b/.test(value)) return 'write-file';
  if (type.includes('verification') || /\b(verifying|verification|checking the preview)\b/.test(value)) return 'verify';
  if (type.includes('check.') || /\b(running|checking)\b.*\btests?\b/.test(value)) return 'test';
  if (type.includes('preview') || type.includes('browser') || /\bpreview|browser\b/.test(value)) return 'browser';
  if (type.includes('deployment') || /\bdeploy(?:ing|ment)?\b/.test(value)) return 'deploy';
  if (type.includes('command') || type.includes('process') || /\bcommand|terminal\b/.test(value)) return 'command';
  if (/\b(database|sql|supabase|postgres|querying data)\b/.test(value)) return 'database';
  if (/\b(upload(?:ing|ed)?|attaching)\b/.test(value)) return 'upload';
  if (/\b(download(?:ing|ed)?|exporting)\b/.test(value)) return 'download';
  if (/\b(workflow|automation|scheduled task)\b/.test(value)) return 'automation';
  if (/\bsearch(?:ing)?(?: the)? web|web search\b/.test(value)) return 'search';
  if (/\b(opening|opened) (?:a )?source\b/.test(value)) return 'open-source';
  if (/\breading sources?\b/.test(value)) return 'read-source';
  if (/\bcomparing (?:the )?(?:results|sources|evidence)\b/.test(value)) return 'compare';
  if (/\bsummari[sz](?:e|ing)\b/.test(value)) return 'summarize';
  if (type.endsWith('.completed') || event.level === 'success') return 'complete';
  if (type.endsWith('.waiting')) return 'waiting';
  if (type.startsWith('message.')) return 'respond';
  if (type.startsWith('plan.') || /\bunderstanding|planning\b/.test(value)) return 'understand';
  if (/\bcode|implement|repair\b/.test(value)) return 'code';
  return 'understand';
}

function statusFor(event: TerminalEvent): XrogaActivityStatus {
  const status = event.canonical?.status;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'interrupted') return 'interrupted';
  if (event.level === 'error' || status === 'failed') return 'error';
  if (event.level === 'warn') return 'warning';
  if (status === 'completed' || event.level === 'success') return 'complete';
  if (status === 'waiting') return 'waiting';
  return 'active';
}

function fallbackLabel(kind: XrogaActivityKind): string {
  const labels: Record<XrogaActivityKind, string> = {
    respond: 'Response started', understand: 'Plan updated', search: 'Searching the web',
    'open-source': 'Opening a source', 'read-source': 'Reading sources', compare: 'Comparing evidence',
    summarize: 'Summarizing findings', 'read-file': 'Inspecting project files', 'write-file': 'Updating project files',
    code: 'Implementing changes', command: 'Running a command', test: 'Running tests', browser: 'Checking the preview',
    database: 'Checking data', 'connected-app-read': 'Reading connected app data',
    'connected-app-write': 'Updating a connected app', automation: 'Running the workflow', upload: 'Uploading',
    download: 'Preparing download', deploy: 'Preparing deployment', verify: 'Verifying the result',
    approval: 'Waiting for your approval', connection: 'Connection required', waiting: 'Waiting', complete: 'Complete',
    warning: 'Needs attention', error: 'Could not complete this step',
  };
  return labels[kind];
}

function metadataText(
  event: TerminalEvent,
  keys: readonly string[],
): string | undefined {
  const metadata = event.canonical?.metadata;
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      const safe = publicActivityText(value);
      if (safe) return safe;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function structuredDetail(event: TerminalEvent, kind: XrogaActivityKind): string {
  const byKind: Partial<Record<XrogaActivityKind, readonly string[]>> = {
    search: ['query', 'searchQuery', 'q', 'term', 'resultCount'],
    'open-source': ['sourceTitle', 'title', 'url', 'sourceUrl', 'domain'],
    'read-source': ['sourceTitle', 'title', 'url', 'sourceUrl', 'domain'],
    compare: ['comparison', 'query', 'sourceCount'],
    summarize: ['topic', 'sourceCount'],
    'read-file': ['filePath', 'path', 'fileName'],
    'write-file': ['filePath', 'path', 'fileName'],
    code: ['filePath', 'path', 'component', 'operation'],
    command: ['command', 'cmd', 'script'],
    test: ['testName', 'suite', 'command', 'check'],
    browser: ['url', 'route', 'page', 'target'],
    database: ['query', 'table', 'database', 'operation'],
    'connected-app-read': ['service', 'operation', 'target', 'resource'],
    'connected-app-write': ['service', 'operation', 'target', 'resource'],
    automation: ['workflow', 'automation', 'operation'],
    upload: ['filePath', 'path', 'fileName'],
    download: ['filePath', 'path', 'fileName', 'url'],
    deploy: ['deploymentUrl', 'url', 'environment', 'target'],
    verify: ['check', 'target', 'url', 'route'],
    approval: ['operation', 'target', 'service'],
    connection: ['service', 'provider'],
  };

  const direct = metadataText(event, byKind[kind] ?? []);
  if (direct) {
    const count = event.canonical?.metadata?.resultCount;
    if (
      kind === 'search' &&
      typeof count === 'number' &&
      Number.isFinite(count) &&
      !direct.includes(String(count))
    ) {
      return `${direct} · ${count} ${count === 1 ? 'result' : 'results'}`;
    }
    return direct;
  }

  const fallback = metadataText(event, [
    'filePath',
    'query',
    'url',
    'domain',
    'service',
    'operation',
    'command',
    'path',
    'target',
  ]);
  return fallback ?? event.canonical?.summary ?? '';
}

export function presentTerminalEvent(event: TerminalEvent): XrogaActivityPresentation {
  const kind = kindFor(event);
  const operation = event.canonical?.source === 'software-agent-v2' ? event.canonical.metadata?.softwareEventType : undefined;
  const safe = publicActivityText(event.text);
  const label = safe || fallbackLabel(kind);
  const canonicalAt = event.canonical?.timestamp ? Date.parse(event.canonical.timestamp) : Number.NaN;
  const at = Number.isFinite(canonicalAt) ? canonicalAt : event.at;
  const rawDetail = structuredDetail(event, kind);
  const command = operation === 'command.started' ? event.text.replace(/^Running /, '') :
    operation === 'command.completed' ? event.body : undefined;
  const detail = command ? redactTerminalText(command).trim().slice(0, 1000) :
    publicActivityText(redactTerminalText(rawDetail));
  // Output is already bounded and redacted by Agent V2. Preserve its line breaks.
  const body = operation === 'command.output' ? redactTerminalText(event.body ?? '').slice(-8000) :
    operation === 'command.completed' ? '' : publicActivityText(redactTerminalText(event.canonical?.details ?? event.body ?? ''));
  const duration = event.canonical?.metadata?.durationMs;
  const exitCode = event.canonical?.metadata?.exitCode;

  return {
    id: event.canonical?.activityId ?? event.canonical?.toolCallId ?? event.canonical?.eventId ?? String(event.seq),
    kind,
    label,
    detail: detail && detail.toLowerCase() !== label.toLowerCase() ? detail : undefined,
    status: statusFor(event),
    body: body || undefined,
    exitCode: typeof exitCode === 'number' && Number.isSafeInteger(exitCode) ? exitCode : undefined,
    startedAt: at,
    updatedAt: at,
    durationMs:
      typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
        ? duration
        : undefined,
    evidenceRefs: event.canonical?.evidenceRefs?.filter(Boolean),
    artifactRefs: event.canonical?.artifactRefs?.filter(Boolean),
  };
}

export function coalesceActivity(
  events: readonly TerminalEvent[],
  previous: readonly XrogaActivityPresentation[] = [],
): XrogaActivityPresentation[] {
  const rows = [...previous];
  const positions = new Map(previous.map((row, index) => [row.id, index]));
  const seen = new Set<string>();
  for (const event of events) {
    if (event.kind === 'output' || event.kind === 'result' || event.kind === 'session') continue;
    if (isGenericPlaceholderActivity(event.text)) continue;
    const canonical = event.canonical;
    const identity = canonical ? `${canonical.runId ?? ''}:${canonical.eventId}` : `sequence:${event.seq}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const row = presentTerminalEvent(event);
    const correlationId = canonical?.activityId ?? canonical?.toolCallId;
    const key = correlationId ? `${canonical?.runId ?? ''}:${correlationId}` : identity;
    row.id = key;
    const previous = positions.get(key);
    if (previous == null) {
      positions.set(key, rows.length);
      rows.push(row);
    } else {
      const prior = rows[previous];
      const outputUpdate = canonical?.source === 'software-agent-v2' && canonical.metadata?.softwareEventType === 'command.output';
      if (outputUpdate) {
        if (row.body && prior.status === 'active') {
          rows[previous] = { ...prior, body: [prior.body, row.body].filter(Boolean).join('\n').slice(-8000), updatedAt: Math.max(prior.updatedAt, row.updatedAt) };
        }
        continue;
      }
      // A delayed replay must not reopen an already settled step.
      if (prior.status !== 'active' && prior.status !== 'waiting') continue;
      const startedAt = Math.min(prior.startedAt, row.startedAt);
      const updatedAt = Math.max(prior.updatedAt, row.updatedAt);
      const terminal = row.status !== 'active' && row.status !== 'waiting';
      rows[previous] = {
        ...prior,
        ...row,
        id: prior.id,
        kind: row.kind === 'complete' || (terminal && row.kind === 'understand') ? prior.kind : row.kind,
        detail: row.detail ?? prior.detail,
        body: row.body ?? prior.body,
        startedAt,
        updatedAt,
        durationMs: row.durationMs ?? (terminal && updatedAt > startedAt ? updatedAt - startedAt : prior.durationMs),
        evidenceRefs: [...new Set([...(prior.evidenceRefs ?? []), ...(row.evidenceRefs ?? [])])],
        artifactRefs: [...new Set([...(prior.artifactRefs ?? []), ...(row.artifactRefs ?? [])])],
      };
    }
  }
  return rows;
}

/** A refreshed replay can overlap an already-saved snapshot. Replace matching rows, never append their logs twice. */
export function mergeActivitySnapshots(
  previous: readonly XrogaActivityPresentation[] = [],
  replay: readonly XrogaActivityPresentation[],
): XrogaActivityPresentation[] {
  const rows = new Map(previous.map(row => [row.id, row]));
  for (const row of replay) {
    const saved = rows.get(row.id);
    const reopensFinished = saved && saved.status !== 'active' && saved.status !== 'waiting' &&
      (row.status === 'active' || row.status === 'waiting');
    if (!saved || (!reopensFinished && row.updatedAt >= saved.updatedAt)) rows.set(row.id, row);
  }
  return [...rows.values()].slice(-80);
}
