'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, getAccessToken } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

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
};

type RunResult = { status: string; result?: { text?: string } | null };
const API = '/api/browser/local';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DOCUMENT = /\.(?:pdf|docx|xlsx)$/i;

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

export function WorkspaceBrowserOperator({ extensionId }: { extensionId: string }) {
  const portRef = useRef<Port | null>(null);
  const activeRun = useRef('');
  const pairedToken = useRef('');
  const [goal, setGoal] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState('');
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('Connect from the Xroga side panel in Chrome.');

  useEffect(() => {
    const url = new URL(location.href);
    const nonce = url.searchParams.get('browserPair');
    const requestedId = url.searchParams.get('browserExtension');
    if (!nonce || !UUID.test(nonce) || requestedId !== extensionId) return;
    const runtime = (window as Window & { chrome?: { runtime?: { connect: (id: string, options: { name: string }) => Port } } }).chrome?.runtime;
    if (!runtime) { setStatus('Chrome could not find the Xroga extension.'); return; }
    let disposed = false;
    let port: Port | undefined;
    let stopAuthListener: (() => void) | undefined;
    const requests = new Map<string, AbortController>();
    const admitted = new Set<string>();
    const connect = async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in to Xroga, then connect again from the Chrome side panel.');
      const session = await apiFetch<{ account: string }>(`${API}/session`, {}, token);
      if (disposed) return;
      const connected = runtime.connect(extensionId, { name: 'xroga-browser-v1' });
      port = connected;
      pairedToken.current = token;
      const { data: { subscription } } = createClient().auth.onAuthStateChange((event, next) => {
        if (event === 'SIGNED_OUT' || (next?.user.id && next.user.id !== session.account)) connected.disconnect();
        else if (next?.user.id === session.account) pairedToken.current = next.access_token;
      });
      stopAuthListener = () => subscription.unsubscribe();
      const send = (message: unknown) => { if (!disposed) { try { connected.postMessage(message); } catch { /* port closed */ } } };
      connected.onDisconnect.addListener(() => {
        for (const request of requests.values()) request.abort();
        if (disposed) return;
        portRef.current = null;
        pairedToken.current = '';
        setPaired(false);
        setBusy(false);
        setStatus('Workspace disconnected. Connect again from the Chrome side panel.');
      });
      connected.onMessage.addListener(message => {
        if (disposed || !message || typeof message !== 'object') return;
        if (message.type === 'paired') {
          portRef.current = connected;
          setPaired(true);
          setStatus('Chrome connected. Browser actions run on this device. Relevant page observations are sent to Xroga for model inference.');
          url.searchParams.delete('browserPair');
          url.searchParams.delete('browserExtension');
          history.replaceState(history.state, '', url);
          return;
        }
        if (message.type === 'run' && message.runId && admitted.has(message.runId)) {
          activeRun.current = message.runId;
          setRunId(message.runId);
          setBusy(true);
          setActivity([]);
          setResult('');
          setStatus('Browser task running');
          return;
        }
        if (message.type === 'activity' && message.runId === activeRun.current && typeof message.status === 'string') {
          if (message.status === 'approval-required') {
            setStatus('Open the Xroga side panel on the task tab to review the pending action.');
          }
          const line = message.tool ? `${message.tool}: ${message.status}` : message.status;
          setActivity(previous => [...previous.slice(-39), line]);
          return;
        }
        if (message.type === 'finished' && message.runId === activeRun.current && message.runId) {
          const finished = message.runId;
          void apiFetch<RunResult>(`${API}/runs/${finished}`, {}, pairedToken.current).then(data => {
            if (disposed || activeRun.current !== finished) return;
            setStatus(`Browser task ${data.status}`);
            setResult(data.result?.text ?? '');
            setBusy(false);
          }).catch(() => { if (!disposed) { setStatus('Could not load the task result.'); setBusy(false); } });
          return;
        }
        if (message.type === 'task-error') {
          setStatus('The browser task stopped before it could report a result.');
          setBusy(false);
          return;
        }
        if (message.type === 'paused' && message.runId === activeRun.current) {
          setStatus('Browser task paused at a checkpoint. Continue from the Chrome side panel.');
          setBusy(false);
          return;
        }
        if (message.type === 'abort' && message.id) requests.get(message.id)?.abort();
        if (message.type !== 'request' || typeof message.id !== 'string' || !UUID.test(message.id) || !message.value) return;
        const { id, op, value } = message;
        if (requests.has(id)) return;
        const isStart = op === 'start';
        const isResume = op === 'resume' && !!value.runId && UUID.test(value.runId);
        const isDocument = op === 'document';
        const isBound = !!value.runId && admitted.has(value.runId);
        if (!isStart && !isResume && !isDocument && (!isBound || (op !== 'turn' && op !== 'finish'))) {
          send({ type: 'result', id, ok: false });
          return;
        }
        const controller = new AbortController();
        requests.set(id, controller);
        const path = isDocument ? `${API}/documents` : isStart ? `${API}/runs` : `${API}/runs/${value.runId}/${op}`;
        void apiFetch<{ runId?: string }>(path, {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify(isStart ? { goal: value.goal, startUrl: value.startUrl, attachmentCount: value.attachmentCount } : value.body),
        }, pairedToken.current).then(data => {
          if ((isStart || isResume) && data.runId && UUID.test(data.runId)) admitted.add(data.runId);
          send({ type: 'result', id, ok: true, value: data });
        }, () => send({ type: 'result', id, ok: false })).finally(() => requests.delete(id));
      });
      connected.postMessage({ type: 'pair', nonce, account: session.account });
    };
    void connect().catch(error => { if (!disposed) setStatus(error instanceof Error ? error.message : 'Could not connect Chrome.'); });
    return () => {
      disposed = true;
      for (const request of requests.values()) request.abort();
      port?.disconnect();
      stopAuthListener?.();
      portRef.current = null;
      pairedToken.current = '';
    };
  }, [extensionId]);

  return (
    <details className="fixed bottom-24 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-background p-3 text-sm text-foreground shadow-lg" open={paired || undefined}>
      <summary className="cursor-pointer font-medium">Browser Operator</summary>
      <p className="my-2 text-xs" role="status">{status}</p>
      {paired && <form className="grid gap-2" onSubmit={event => {
        event.preventDefault();
        if (!portRef.current || busy) return;
        setBusy(true);
        setStatus('Opening a task tab in Chrome.');
        const port = portRef.current;
        void (async () => {
          const attachments = [];
          // The parser admits one document at a time for this account.
          for (const file of files) attachments.push(await taskFile(file, pairedToken.current));
          if (port !== portRef.current) return;
          if (attachments.some(file => !file.text.trim())) throw new Error('Empty attachment');
          port.postMessage({ type: 'start-task', goal, startUrl: target, files: attachments });
        })().catch(() => {
          setBusy(false);
          setStatus('Could not read a task file. Scanned or encrypted files need a text export.');
        });
      }}>
        <label className="grid gap-1">Website or search<input className="rounded border bg-background p-2" value={target} onChange={event => setTarget(event.target.value)} maxLength={1800} required /></label>
        <label className="grid gap-1">What should Xroga do?<textarea className="rounded border bg-background p-2" value={goal} onChange={event => setGoal(event.target.value)} maxLength={16000} required /></label>
        <label className="grid gap-1">Task files <span className="text-xs">Up to five files, 2 MB each. PDF and Office files are sent to Xroga to extract text.</span>
          <input type="file" multiple accept=".txt,.md,.csv,.tsv,.json,.pdf,.docx,.xlsx" disabled={busy} onChange={event => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length > 5 || selected.some(file => file.size > 2 * 1024 * 1024 ||
              !/\.(?:txt|md|csv|tsv|json|pdf|docx|xlsx)$/i.test(file.name))) {
              setFiles([]);
              event.target.value = '';
              setStatus('Choose up to five supported files, at most 2 MB each.');
              return;
            }
            setFiles(selected);
          }} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded border px-3 py-1" disabled={busy}>Start in Chrome</button>
          {busy && runId && <button type="button" className="rounded border px-3 py-1" onClick={() => {
            portRef.current?.postMessage({ type: 'cancel-task', runId });
            setStatus('Stopping the browser task.');
            void apiFetch(`${API}/runs/${runId}`, { method: 'DELETE' }, pairedToken.current).catch(() => setStatus('Chrome received Stop. The server could not confirm cancellation.'));
          }}>Stop</button>}
        </div>
      </form>}
      {activity.length > 0 && <ol aria-label="Browser activity" className="mt-2 max-h-32 overflow-auto text-xs">{activity.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ol>}
      {result && <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{result}</p>}
    </details>
  );
}
