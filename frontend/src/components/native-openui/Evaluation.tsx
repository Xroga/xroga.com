'use client';

import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, Moon, Send, Square, Sun } from 'lucide-react';
import { API_URL, fetchApiResponse, getAccessToken } from '@/lib/api';
import type { NativeAnswer } from './NativeSurface';
import { MarkdownBlocks } from './upstream/components/markdown';
import './upstream/components/theme.css';
import './upstream/components/components.css';
import './evaluation.css';

const NativeSurface = lazy(() => import('./NativeSurface').then(module => ({ default: module.NativeSurface })));

type Slot = { id: string; label: string; prompt: string };
type Receipt = { providerRequestId: string; modelId: string; provider: string; inputTokens: number; outputTokens: number; costMicroUsd: number; elapsedMs: number };
type EvaluationResult = NativeAnswer & { receipt: Receipt; fallbackReason?: string; finishReason?: string | null };
type Phase = 'idle' | 'authorizing' | 'generating';

async function readResult(response: Response, onProgress: () => void): Promise<EvaluationResult> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : 'Evaluation failed.');
  }
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('Invalid evaluation response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 240_000) throw new Error('The evaluation response exceeded its limit.');
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const match = /^event: (status|answer|error)\ndata: (.+)$/.exec(frame);
        if (!match) throw new Error('Invalid evaluation response.');
        const payload = JSON.parse(match[2]);
        if (match[1] === 'status') { onProgress(); continue; }
        if (match[1] === 'error') throw new Error(typeof payload.error === 'string' ? payload.error : 'Evaluation failed.');
        if (payload.format !== 'xroga-openui-v1' || payload.library !== 'xroga-native-v1' ||
            typeof payload.text !== 'string' || !payload.receipt?.providerRequestId) throw new Error('Invalid evaluation response.');
        return payload;
      }
    }
    throw new Error('The evaluation ended without a verified answer.');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export default function Evaluation({ slots }: { slots: Slot[] }) {
  const [selection, setSelection] = useState(slots[0]?.id ?? '');
  const [turn, setTurn] = useState<{ prompt: string; answer?: EvaluationResult }>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [dark, setDark] = useState(false);
  const active = useRef<AbortController>();
  useEffect(() => () => active.current?.abort(), []);
  const selected = slots.find(slot => slot.id === selection);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !selected) return;
    const controller = new AbortController();
    active.current = controller;
    setPhase('authorizing');
    setCopied(false);
    setNotice('');
    setTurn({ prompt: selected.prompt });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in to run an evaluation.');
      const response = await fetchApiResponse(API_URL + '/api/native-openui/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ prompt: selected.prompt, attempt: selected.id }),
        signal: controller.signal,
      });
      const answer = await readResult(response, () => setPhase('generating'));
      if (!controller.signal.aborted) setTurn({ prompt: selected.prompt, answer });
    } catch (error) {
      setNotice(controller.signal.aborted ? 'Evaluation cancelled. Check the ledger if the request had started.' : error instanceof Error ? error.message : 'Evaluation failed.');
    } finally {
      if (active.current === controller) active.current = undefined;
      setPhase('idle');
    }
  }

  async function copyAnswer() {
    if (!turn?.answer) return;
    try {
      await navigator.clipboard.writeText(turn.answer.text);
      setCopied(true);
    } catch {
      setNotice('The answer could not be copied.');
    }
  }

  return (
    <main className="native-evaluation" data-theme={dark ? 'dark' : 'light'}>
      <header className="native-evaluation-bar">
        <div><p>Xroga Workspace</p><h1>Answer evaluation</h1></div>
        <button type="button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(!dark)}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <div className="native-evaluation-thread">
        {turn && <article aria-label="Evaluation conversation">
          <p className="native-evaluation-user">{turn.prompt}</p>
          {turn.answer && <>
            <div className="native-evaluation-answer-label">Xroga</div>
            {turn.answer.fallbackReason === 'data_review' && <p className="native-evaluation-status" role="status">The chart was withheld because its data disagreed with the written trend.</p>}
            {turn.answer.fallbackReason === 'authorization_review' && <p className="native-evaluation-status" role="status">Review the authorization guidance before using it.</p>}
            {turn.answer.fallbackReason === 'factual_review' && <p className="native-evaluation-status" role="status">Review the technical claim before using this answer.</p>}
            <Suspense fallback={<section className="xroga-native-openui"><MarkdownBlocks text={turn.answer.text} /></section>}>
              {turn.answer.program ? <NativeSurface answer={turn.answer} />
                : <section className="xroga-native-openui" aria-label="Answer" dir="auto"><MarkdownBlocks text={turn.answer.text} /></section>}
            </Suspense>
            <div className="native-evaluation-actions">
              <button type="button" onClick={copyAnswer}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy answer'}</button>
              <details><summary>Model receipt</summary><pre>{JSON.stringify(turn.answer.receipt, null, 2)}</pre>
                {turn.answer.finishReason !== 'stop' && <p>The provider did not report a complete answer.</p>}
                {turn.answer.fallbackReason && <p>Text fallback: {turn.answer.fallbackReason}</p>}
              </details>
            </div>
          </>}
        </article>}
        {phase !== 'idle' && <p role="status" className="native-evaluation-status">
          {phase === 'authorizing' ? 'Checking evaluation access…' : 'DeepSeek is generating your answer…'}
        </p>}
        {notice && <p role="alert">{notice}</p>}
      </div>
      <form className="native-evaluation-composer" onSubmit={submit}>
        <label htmlFor="native-slot">Approved benchmark prompt</label>
        <select id="native-slot" value={selection} onChange={event => setSelection(event.target.value)} disabled={phase !== 'idle'}>
          {slots.map(slot => <option value={slot.id} key={slot.id}>{slot.label}</option>)}
        </select>
        {selected && <p>{selected.prompt}</p>}
        <div className="native-evaluation-composer-actions">
          {phase === 'idle'
            ? <button type="submit" disabled={!selected}><Send size={16} />Run prompt</button>
            : <button type="button" onClick={() => active.current?.abort()}><Square size={16} />Stop</button>}
        </div>
      </form>
    </main>
  );
}
