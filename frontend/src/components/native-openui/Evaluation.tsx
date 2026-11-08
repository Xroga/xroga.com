'use client';

import { lazy, Suspense, useState, type FormEvent } from 'react';
import { API_URL, fetchApiResponse, getAccessToken } from '@/lib/api';
import type { NativeAnswer } from './NativeSurface';
import { MarkdownBlocks } from './upstream/components/markdown';
import './upstream/components/theme.css';
import './upstream/components/components.css';
import './evaluation.css';
const NativeSurface = lazy(() => import('./NativeSurface').then(module => ({ default: module.NativeSurface })));

type Receipt = { providerRequestId: string | null; modelId: string; inputTokens: number; outputTokens: number; costMicroUsd: number; elapsedMs: number };
type EvaluationResult = NativeAnswer & { receipt: Receipt; fallbackReason?: string };

export default function Evaluation() {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState<EvaluationResult>();
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState('');
  const [dark, setDark] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waiting || !prompt.trim()) return;
    setWaiting(true);
    setNotice('');
    setAnswer(undefined);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in to run an evaluation.');
      const response = await fetchApiResponse(API_URL + '/api/native-openui/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ prompt: prompt.trim(), attempt: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Evaluation failed.');
      if (data.format !== 'xroga-openui-v1' || typeof data.text !== 'string' || !data.receipt) throw new Error('Invalid evaluation response.');
      setAnswer(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Evaluation failed.');
    } finally {
      setWaiting(false);
    }
  }
  return <main className="native-evaluation" data-theme={dark ? 'dark' : 'light'}>
    <header><div><p>Internal evaluation</p><h1>Native answers</h1></div><button type="button" onClick={() => setDark(!dark)}>{dark ? 'Light theme' : 'Dark theme'}</button></header>
    <form onSubmit={submit}>
      <label htmlFor="native-prompt">Ask DeepSeek</label>
      <textarea id="native-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={6000} rows={4} required />
      <button type="submit" disabled={waiting || !prompt.trim()}>Run evaluation</button>
    </form>
    {waiting && <p role="status">Waiting for the provider receipt and answer.</p>}
    {notice && <p role="alert">{notice}</p>}
    {answer && <>
      <Suspense fallback={<MarkdownBlocks text={answer.text} />}>{answer.program ? <NativeSurface answer={answer} /> : <MarkdownBlocks text={answer.text} />}</Suspense>
      <footer>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(answer.text); }}>Copy answer</button>
        <details><summary>Model receipt</summary><pre>{JSON.stringify(answer.receipt, null, 2)}</pre>{answer.fallbackReason && <p>Text fallback: {answer.fallbackReason}</p>}</details>
      </footer>
    </>}
  </main>;
}
