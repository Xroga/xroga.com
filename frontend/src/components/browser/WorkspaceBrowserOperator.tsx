'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Monitor } from 'lucide-react';
import { ApiError, apiFetch, getAccessToken } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { transcribeVoiceAudio } from '@/lib/voiceApi';

type Port = {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(callback: (message: BridgeMessage) => void): void };
  onDisconnect: { addListener(callback: () => void): void };
};

type BridgeMessage = {
  type: string;
  id?: string;
  op?: string;
  value?: { runId?: string; body?: unknown; goal?: string; startUrl?: string; attachmentCount?: number };
  runId?: string;
  status?: string;
  tool?: string;
  stepId?: string;
  steps?: unknown;
};

type RunResult = { status: string; remainingMs?: number; cancelRequested?: boolean; result?: { text?: string } | null };
const API = '/api/browser/local';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const EXTENSION_ID = /^[a-p]{32}$/;
const DOCUMENT = /\.(?:pdf|docx|xlsx)$/i;
const ACTIVITY_LIMIT = 40;
const TOOLS: Record<string, string> = {
  snapshot: 'Inspect page', find: 'Find a control', read: 'Read page content', screenshot: 'Capture screenshot',
  wait: 'Wait for page', click: 'Click control', set: 'Set value', type: 'Enter text', press: 'Use keyboard',
  navigate: 'Navigate', handle_dialog: 'Handle dialog', fill_form: 'Fill form', hover: 'Hover over control',
  scroll: 'Scroll page', tabs: 'Manage tabs', upload: 'Upload file', read_attachment: 'Read attachment', save_file: 'Save file',
};
const OUTCOMES: Record<string, string> = {
  done: 'Finished', dispatched: 'Sent to page', 'page-changed': 'Page changed', verified: 'Expected state observed',
  unmet: 'Expected state missing', uncertain: 'Delivery unknown', failed: 'Could not finish', skipped: 'Skipped',
};
type Activity = { stepId: string; tool: string; status: string; reobserved?: boolean };
type Operator = {
  paired: boolean; connecting: boolean; error: boolean; status: string;
  busy: boolean; runId: string; paused: boolean; activeTool: string; result: string; activity: Activity[];
  connect: () => void; disconnect: () => void;
  start: (goal: string, files: File[]) => Promise<boolean>;
  control: (action: 'pause' | 'resume' | 'cancel') => void;
};
const BrowserOperatorContext = createContext<Operator | null>(null);
export const useWorkspaceBrowserOperator = () => useContext(BrowserOperatorContext);

export function isLocalChromeRequest(text: string) {
  return /^\s*\/chrome(?:\s|$)/i.test(text) || (
    /^\s*(?:please\s+)?(?:open|go|visit|find|research|prepare|check|run|use|draft|inspect|compare|search)\b/i.test(text) &&
    /\b(?:in|using|with) my (?:local )?chrome(?: browser)?\b/i.test(text)
  );
}

function activityStep(value: unknown): Activity[] {
  if (!value || typeof value !== 'object') return [];
  const { stepId, tool, status, reobserved } = value as Partial<Activity>;
  if (typeof stepId !== 'string' || !UUID.test(stepId) || typeof tool !== 'string' || !Object.hasOwn(TOOLS, tool) ||
      typeof status !== 'string' || !Object.hasOwn(OUTCOMES, status)) return [];
  return [{ stepId, tool, status, ...(reobserved === true ? { reobserved } : {}) }];
}

async function taskFile(file: File, token: string) {
  const name = file.name.slice(0, 200);
  const data = new Uint8Array(await file.arrayBuffer());
  if (!DOCUMENT.test(name)) return { name, text: new TextDecoder('utf-8', { fatal: true }).decode(data) };
  let bytes = '';
  for (let i = 0; i < data.length; i += 32768) bytes += String.fromCharCode(...data.subarray(i, i + 32768));
  const { text } = await apiFetch<{ text: string }>(`${API}/documents`, {
    method: 'POST', body: JSON.stringify({ name, base64: btoa(bytes) }),
  }, token);
  return { name: `${name.slice(0, 196)}.txt`, text };
}

export function WorkspaceBrowserOperator({ extensionId, children }: { extensionId?: string; children?: ReactNode }) {
  const isWorkspace = usePathname() === '/workspace';
  const portRef = useRef<Port | null>(null);
  const activeRun = useRef('');
  const pairedToken = useRef('');
  const [paired, setPaired] = useState(false);
  const [pairingVisible, setPairingVisible] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [attempt, retry] = useState(0);
  const [detached, setDetached] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [runId, setRunId] = useState('');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activeTool, setActiveTool] = useState('');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('Connect from the Xroga side panel in Chrome.');

  useEffect(() => {
    setPaired(false);
    if (!isWorkspace || detached) return;
    const url = new URL(location.href);
    const requestedId = url.searchParams.get('browserExtension') ?? extensionId;
    let nonce = url.searchParams.get('browserPair');
    const initiatedByExtension = !!nonce && UUID.test(nonce) && !!requestedId && EXTENSION_ID.test(requestedId);
    if (initiatedByExtension) setPairingVisible(true);
    const runtime = (window as Window & { chrome?: { runtime?: {
      connect: (id: string, options: { name: string }) => Port;
      sendMessage: (id: string, message: unknown) => Promise<unknown>;
    } } }).chrome?.runtime;
    const failed = (reason: 'unavailable' | 'extension-id' | 'sign-in' | 'failed', message: string) => {
      setConnecting(false);
      setConnectionError(true);
      setStatus(message);
      if (nonce && requestedId && typeof runtime?.sendMessage === 'function') {
        void runtime.sendMessage(requestedId, { type: 'xroga.browser.pair-failed.v1', nonce, reason }).catch(() => {});
      }
    };
    if (!extensionId || requestedId !== extensionId || !runtime) {
      if (initiatedByExtension) {
        if (!extensionId) failed('unavailable', 'Browser Automation is unavailable in this Workspace release.');
        else if (requestedId !== extensionId) failed('extension-id', 'This Workspace release is configured for a different extension ID.');
        else failed('failed', 'Chrome could not find the Xroga extension.');
      }
      return;
    }
    setConnecting(true);
    setConnectionError(false);
    let disposed = false;
    let port: Port | undefined;
    let stopAuthListener: (() => void) | undefined;
    const requests = new Map<string, AbortController>();
    const admitted = new Set<string>();
    let rejected = false;
    const connect = async () => {
      if (!initiatedByExtension) {
        const detected = await runtime.sendMessage(extensionId, { type: 'xroga.browser.status.v1' })
          .catch(() => null) as { installed?: boolean } | null;
        if (disposed) return;
        if (detected?.installed !== true) { setConnecting(false); return; }
        setStatus('Xroga Browser Automation detected. Open its Chrome side panel to connect.');
        const reconnect = await runtime.sendMessage(extensionId, { type: 'xroga.browser.reconnect.v1' })
          .catch(() => null) as { nonce?: string } | null;
        if (disposed) return;
        if (typeof reconnect?.nonce !== 'string' || !UUID.test(reconnect.nonce)) { setConnecting(false); return; }
        nonce = reconnect.nonce;
      }
      const token = await getAccessToken();
      if (disposed) return;
      if (!token) { failed('sign-in', 'Sign in to Xroga, then connect again from the Chrome side panel.'); return; }
      const session = await apiFetch<{ account: string }>(`${API}/session`, {}, token);
      if (!UUID.test(session.account)) throw new Error('Invalid account response');
      if (disposed) return;
      const auth = createClient();
      if (!auth) throw new Error('Workspace authentication is unavailable');
      const connected = runtime.connect(extensionId, { name: 'xroga-browser-v1' });
      port = connected;
      pairedToken.current = token;
      let closed = false;
      const clearConnection = () => {
        if (closed) return;
        closed = true;
        for (const request of requests.values()) request.abort();
        if (disposed) return;
        portRef.current = null;
        pairedToken.current = '';
        activeRun.current = '';
        setPaired(false);
        setConnecting(false);
        setBusy(false);
        setPaused(false);
        setRunId('');
        setActivity([]);
        setActiveTool('');
        setResult('');
        if (!rejected) setStatus('Workspace disconnected. Connect again from the Chrome side panel.');
      };
      connected.onDisconnect.addListener(clearConnection);
      const { data: { subscription } } = auth.auth.onAuthStateChange((event, next) => {
        if (closed || disposed) return;
        if (event === 'SIGNED_OUT' || (next?.user.id && next.user.id !== session.account)) {
          clearConnection();
          connected.disconnect();
        } else if (next?.user.id === session.account) {
          pairedToken.current = next.access_token;
        }
      });
      stopAuthListener = () => subscription.unsubscribe();
      const send = (message: unknown) => { if (!disposed && !closed) { try { connected.postMessage(message); } catch { /* port closed */ } } };
      connected.onMessage.addListener(message => {
        if (disposed || closed || !message || typeof message !== 'object') return;
        if (message.type === 'pair-rejected' && message.status === 'account') {
          rejected = true;
          setConnecting(false);
          setConnectionError(true);
          setStatus('This Chrome profile is linked to another Xroga account. Use a separate Chrome profile.');
          return;
        }
        if (message.type === 'paired') {
          portRef.current = connected;
          setPaired(true);
          setConnecting(false);
          setConnectionError(false);
          setStatus('Chrome connected. Browser actions run on this device. Relevant page observations are sent to Xroga for model inference.');
          url.searchParams.delete('browserPair');
          url.searchParams.delete('browserExtension');
          history.replaceState(history.state, '', url);
          return;
        }
        if (message.type === 'run' && message.runId && admitted.has(message.runId)) {
          const changed = activeRun.current !== message.runId;
          activeRun.current = message.runId;
          setRunId(message.runId);
          setBusy(true);
          setPaused(false);
          if (changed) { setActivity([]); setActiveTool(''); setResult(''); }
          else send({ type: 'activity-history', runId: message.runId });
          setStatus('Browser task running');
          return;
        }
        if (message.type === 'checkpoint' && message.runId && UUID.test(message.runId) && !activeRun.current) {
          const checkpoint = message.runId;
          void apiFetch<RunResult>(`${API}/runs/${checkpoint}`, {}, pairedToken.current).then(data => {
            if (disposed || portRef.current !== connected || activeRun.current) return;
            activeRun.current = checkpoint;
            setRunId(checkpoint);
            send({ type: 'activity-history', runId: checkpoint });
            if (['completed', 'failed', 'cancelled'].includes(data.status)) {
              setStatus(`Browser task ${data.status}`);
              setResult(data.result?.text ?? '');
              return;
            }
            setPaused(!data.cancelRequested);
            setStatus(data.cancelRequested ? 'Browser task cancelled.' : 'Saved browser checkpoint. Resume to continue or sync a saved result.');
          }).catch(() => { /* An unverified run is never shown or controlled. */ });
          return;
        }
        if (message.type === 'activity-history' && message.runId === activeRun.current && Array.isArray(message.steps)) {
          const history = message.steps.slice(-ACTIVITY_LIMIT).flatMap(activityStep);
          setActivity(previous => [...new Map([...history, ...previous].map(step => [step.stepId, step])).values()].slice(-ACTIVITY_LIMIT));
          return;
        }
        if (message.type === 'activity' && message.runId === activeRun.current && typeof message.status === 'string') {
          if (message.status === 'approval-required') {
            setStatus('Open the Xroga side panel on the task tab to review the pending action.');
          } else if (message.status === 'running' && message.tool && Object.hasOwn(TOOLS, message.tool)) {
            setActiveTool(TOOLS[message.tool]);
          } else {
            const steps = activityStep(message);
            if (steps.length) {
              setActiveTool('');
              setActivity(previous => [...previous.filter(step => step.stepId !== message.stepId), ...steps].slice(-ACTIVITY_LIMIT));
            }
          }
          return;
        }
        if (message.type === 'finished' && message.runId === activeRun.current && message.runId) {
          const finished = message.runId;
          void apiFetch<RunResult>(`${API}/runs/${finished}`, {}, pairedToken.current).then(data => {
            if (disposed || portRef.current !== connected || activeRun.current !== finished) return;
            setStatus(`Browser task ${data.status}`);
            setResult(data.result?.text ?? '');
            setBusy(false);
            setPaused(false);
            setActiveTool('');
          }).catch(() => { if (!disposed) { setStatus('Could not load the task result.'); setBusy(false); } });
          return;
        }
        if (message.type === 'task-error' && (!message.runId || message.runId === activeRun.current)) {
          setStatus('The browser task stopped before it could report a result.');
          setBusy(false);
          setActiveTool('');
          return;
        }
        if (message.type === 'paused' && message.runId === activeRun.current) {
          setStatus('Browser task paused at a checkpoint.');
          setBusy(false);
          setPaused(true);
          setActiveTool('');
          return;
        }
        if (message.type === 'resume-unavailable' && message.runId === activeRun.current) {
          setStatus('Open the task page in Chrome and resume from the Xroga side panel.');
          return;
        }
        if (message.type === 'abort' && message.id) requests.get(message.id)?.abort();
        if (message.type !== 'request' || typeof message.id !== 'string' || !UUID.test(message.id) || !message.value) return;
        const { id, op, value } = message;
        if (requests.has(id)) return;
        const isStart = op === 'start';
        const isResume = op === 'resume' && !!value.runId && UUID.test(value.runId);
        const isDocument = op === 'document';
        const isVoice = op === 'voice';
        // Finalizing a durable outbox after a reconnect may occur on a new authenticated port. The API's
        // ownership check and fenced idempotent finish still apply. Turns remain bound to start/resume.
        const isFinish = op === 'finish' && !!value.runId && UUID.test(value.runId);
        const isBound = !!value.runId && admitted.has(value.runId);
        if (!isStart && !isResume && !isDocument && !isVoice && !isFinish && !(isBound && op === 'turn')) {
          send({ type: 'result', id, ok: false });
          return;
        }
        const controller = new AbortController();
        requests.set(id, controller);
        if (isVoice) {
          void (async () => {
            const encoded = value.body;
            if (typeof encoded !== 'string' || encoded.length < 684 ||
                encoded.length > 5_140_000 || !encoded.startsWith('UklGR')) throw new Error('Invalid recording');
            const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
            const text = await transcribeVoiceAudio(new Blob([bytes], { type: 'audio/wav' }), controller.signal,
              { freeOnly: true, preparedPcm: true, expectedToken: pairedToken.current });
            send({ type: 'result', id, ok: true, value: { text } });
          })().catch(() => send({ type: 'result', id, ok: false })).finally(() => requests.delete(id));
          return;
        }
        const path = isDocument ? `${API}/documents` : isStart ? `${API}/runs` : `${API}/runs/${value.runId}/${op}`;
        void apiFetch<{ runId?: string }>(path, {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify(isStart ? { goal: value.goal, startUrl: value.startUrl, attachmentCount: value.attachmentCount } : value.body),
        }, pairedToken.current).then(data => {
          if ((isStart || isResume) && data.runId && UUID.test(data.runId)) admitted.add(data.runId);
          if (isFinish && !activeRun.current && value.runId) {
            activeRun.current = value.runId;
            setRunId(value.runId);
          }
          send({ type: 'result', id, ok: true, value: data });
        }, () => send({ type: 'result', id, ok: false })).finally(() => requests.delete(id));
      });
      connected.postMessage({ type: 'pair', nonce, account: session.account });
    };
    void connect().catch(error => {
      if (disposed) return;
      if (error instanceof ApiError && (error.status === 404 || error.status === 503)) {
        failed('unavailable', 'Browser Automation is unavailable in this Workspace release.');
      } else if (error instanceof ApiError && error.status === 401) {
        failed('sign-in', 'Sign in to Xroga, then connect again from the Chrome side panel.');
      } else if (error instanceof ApiError && error.status === 403) {
        failed('unavailable', 'Browser Automation isn’t enabled for this Xroga account.');
      } else {
        failed('failed', 'Could not connect Chrome. Try connecting again from the side panel.');
      }
    });
    return () => {
      disposed = true;
      for (const request of requests.values()) request.abort();
      port?.disconnect();
      stopAuthListener?.();
      portRef.current = null;
      pairedToken.current = '';
    };
  }, [extensionId, isWorkspace, attempt, detached]);

  const starting = useRef(false);
  async function start(goal: string, files: File[]) {
    const port = portRef.current;
    if (!paired || !port || busy || paused || starting.current) return false;
    if (goal.length > 16_000 || files.length > 5 || files.some(file => file.size > 2 * 1024 * 1024 ||
        !/\.(?:txt|md|csv|tsv|json|pdf|docx|xlsx)$/i.test(file.name))) {
      setStatus('Use a task under 16,000 characters and up to five text, PDF, Word or Excel files, at most 2 MB each.');
      return false;
    }
    starting.current = true;
    setBusy(true);
    setStatus('Preparing the task for Chrome.');
    try {
      const attachments = [];
      for (const file of files) attachments.push(await taskFile(file, pairedToken.current));
      if (port !== portRef.current) { setBusy(false); return false; }
      if (attachments.some(file => !file.text.trim())) throw new Error('Empty attachment');
      const startUrl = goal.match(/https:\/\/[^\s<>]+/i)?.[0];
      port.postMessage({ type: 'start-task', goal, startUrl, files: attachments });
      return true;
    } catch {
      setBusy(false);
      setStatus('Could not prepare the task. For scanned or encrypted files, try a text export.');
      return false;
    } finally {
      starting.current = false;
    }
  }

  function control(action: 'pause' | 'resume' | 'cancel') {
    if (!runId || !portRef.current) return;
    portRef.current.postMessage({ type: action === 'cancel' ? 'cancel-task' : `${action}-task`, runId });
    if (action !== 'cancel') return;
    setStatus('Stopping the browser task.');
    void apiFetch(`${API}/runs/${runId}`, { method: 'DELETE' }, pairedToken.current).then(() => {
      if (activeRun.current !== runId) return;
      setPaused(false);
      setBusy(false);
      setStatus(current => current === 'Stopping the browser task.' ? 'Cancellation requested.' : current);
    }).catch(() => setStatus('Chrome received Stop. The server could not confirm cancellation.'));
  }

  const operator: Operator | null = isWorkspace && (extensionId || pairingVisible) ? {
    paired, connecting, error: connectionError, status, busy, paused, runId, activeTool, activity, result, start, control,
    connect: () => { setDetached(false); retry(value => value + 1); },
    disconnect: () => {
      portRef.current?.disconnect();
      portRef.current = null;
      pairedToken.current = '';
      activeRun.current = '';
      setPaired(false);
      setBusy(false);
      setPaused(false);
      setConnecting(false);
      setConnectionError(false);
      setActivity([]);
      setRunId('');
      setActiveTool('');
      setResult('');
      setStatus('Workspace disconnected. Open the Xroga side panel to connect again.');
      setDetached(true);
    },
  } : null;
  return <BrowserOperatorContext.Provider value={operator}>{children}</BrowserOperatorContext.Provider>;
}

export function WorkspaceBrowserConnection() {
  const operator = useWorkspaceBrowserOperator();
  if (!operator) return null;
  const state = operator.paired ? 'Chrome connected' : operator.connecting ? 'Connecting to extension' :
    operator.error ? 'Connection needs attention' : 'Connect Chrome';
  return <details className="mb-1 rounded-lg border border-[var(--card-border)] bg-[var(--surface-inset)] text-[var(--foreground)]">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-xs focus-visible:outline focus-visible:outline-2">
      <Monitor aria-hidden size={14} className="shrink-0" />
      <span className="min-w-0 flex-1"><span className="block font-medium">Browser Automation</span><span className="block truncate text-[var(--muted)]">{state}</span></span>
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${operator.paired ? 'bg-emerald-500' : operator.error ? 'bg-red-500' : operator.connecting ? 'animate-pulse bg-[var(--muted)]' : 'bg-[var(--muted)]'}`} />
    </summary>
    <div className="space-y-2 border-t border-[var(--card-border)] px-2 py-2 text-xs">

      <p role="status" className="break-words text-[var(--muted)]">{operator.paired ? 'Browser tasks run in the Xroga extension on this device.' : operator.status}</p>
      <button type="button" className="rounded border border-[var(--card-border)] px-2 py-1" disabled={operator.connecting || operator.busy}
        onClick={operator.paired ? operator.disconnect : operator.connect}>{operator.paired ? 'Disconnect Workspace' : 'Reconnect'}</button>
    </div>
  </details>;
}

export function WorkspaceBrowserProgress({ operator, prompted }: { operator: Operator | null; prompted: boolean }) {
  if (!operator) return prompted ? <p role="status" className="mb-2 text-xs text-[var(--muted)]">Browser Automation is unavailable in this Workspace. Your draft is still here.</p> : null;
  if (!prompted && !operator.busy && !operator.runId) return null;
  return <div className="mb-2 space-y-1 text-xs text-[var(--muted)]">
    <p role="status">{!operator.paired && prompted && !operator.runId ? 'Open the Xroga extension side panel to connect Chrome. Your draft is still here.' : operator.status}</p>
    {operator.activeTool && <p>{operator.activeTool} in progress</p>}
    {operator.runId && (operator.busy || operator.paused) && <div className="flex flex-wrap gap-2">
      {operator.busy && <button type="button" className="underline" onClick={() => operator.control('pause')}>Pause</button>}
      {operator.paused && <button type="button" className="underline" onClick={() => operator.control('resume')}>Resume</button>}
      <button type="button" className="underline" onClick={() => operator.control('cancel')}>Stop</button>
    </div>}
    {operator.activity.length > 0 && <details>
      <summary className="cursor-pointer">Browser activity</summary>
      <ol aria-label="Browser activity" className="max-h-32 space-y-1 overflow-auto">
        {operator.activity.map(step => <li key={step.stepId}>{TOOLS[step.tool]} · {OUTCOMES[step.status]}{step.reobserved ? ' · Rechecked the page' : ''}</li>)}
      </ol>
    </details>}
    {operator.result && <p className="max-h-44 overflow-auto whitespace-pre-wrap break-words text-[var(--foreground)]">{operator.result}</p>}
  </div>;
}
