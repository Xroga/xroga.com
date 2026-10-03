import type { TerminalEvent } from './terminalEvent';

export type XrogaActivityKind =
  | 'respond' | 'understand' | 'search' | 'open-source' | 'read-source' | 'compare' | 'summarize'
  | 'read-file' | 'write-file' | 'code' | 'command' | 'test' | 'browser' | 'database'
  | 'connected-app-read' | 'connected-app-write' | 'automation' | 'upload' | 'download'
  | 'deploy' | 'verify' | 'approval' | 'connection' | 'waiting' | 'complete' | 'warning' | 'error';

export type XrogaActivityStatus = 'active' | 'complete' | 'waiting' | 'warning' | 'error';

export interface XrogaActivityPresentation {
  id: string;
  kind: XrogaActivityKind;
  label: string;
  detail?: string;
  status: XrogaActivityStatus;
}

const INTERNAL_MARKERS = /\b(?:business\.(?:read|action)|research\.(?:public-web|x)|software\.implement|repository\.(?:read|write)|validation\.run|attachment\.analyze|requiredAuthorities|selectedModel|fallbackModels|toolCallId|runtimeSessionId|provider route|sandbox:execute|model:execute)\b/gi;

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

function kindFor(event: TerminalEvent): XrogaActivityKind {
  const type = event.canonical?.type ?? '';
  const value = `${type} ${event.text}`.toLowerCase();
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
  if (/\bsearch(?:ing)?(?: the)? web|web search\b/.test(value)) return 'search';
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
  if (event.level === 'error' || status === 'failed') return 'error';
  if (event.level === 'warn') return 'warning';
  if (status === 'completed' || event.level === 'success') return 'complete';
  if (status === 'waiting') return 'waiting';
  return 'active';
}

function fallbackLabel(kind: XrogaActivityKind): string {
  const labels: Record<XrogaActivityKind, string> = {
    respond: 'Responding', understand: 'Understanding your request', search: 'Searching the web',
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

export function presentTerminalEvent(event: TerminalEvent): XrogaActivityPresentation {
  const kind = kindFor(event);
  const safe = publicActivityText(event.text);
  return {
    id: event.canonical?.activityId ?? event.canonical?.eventId ?? String(event.seq),
    kind,
    label: safe || fallbackLabel(kind),
    status: statusFor(event),
  };
}

export function coalesceActivity(events: readonly TerminalEvent[]): XrogaActivityPresentation[] {
  const rows: XrogaActivityPresentation[] = [];
  const positions = new Map<string, number>();
  for (const event of events) {
    if (event.kind === 'output' || event.kind === 'result') continue;
    const row = presentTerminalEvent(event);
    const key = event.canonical?.activityId || `${row.kind}:${row.label.toLowerCase()}`;
    const previous = positions.get(key);
    if (previous == null) {
      positions.set(key, rows.length);
      rows.push(row);
    } else {
      rows[previous] = { ...rows[previous], ...row, id: rows[previous].id };
    }
  }
  return rows;
}
