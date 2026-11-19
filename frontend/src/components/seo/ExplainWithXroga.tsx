'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';

type ExplainData = { quick: string; simple: string; steps: string[] };
type Mode = 'quick' | 'simple' | 'steps';

export function ExplainWithXroga({ title, path, explanation }: { title: string; path: string; explanation: ExplainData }) {
  const [mode, setMode] = useState<Mode>('quick');
  const [copied, setCopied] = useState(false);
  const setChatPrefill = useAppStore((state) => state.setChatPrefill);
  const router = useRouter();
  const prompt = [
    'Please explain this Xroga guide in simple, concise American English:',
    'Article: ' + title,
    'Canonical URL: https://xroga.com' + path,
    'Verified editorial summary: ' + explanation.quick,
    'Do not assume access to the entire article unless you have fetched it. If you have not, state that limitation. Give a simple answer first, then practical numbered steps, explain confusing words, and ask what I want to do next. Separate sourced information from assumptions.',
  ].join('\n');

  const openWorkspace = () => {
    setChatPrefill(prompt);
    router.push('/workspace');
  };
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="xv-explain" aria-labelledby="xv-explain-title">
      <div className="xv-explain-top">
        <div><span className="xv-explain-kicker">✦ Explain with Xroga</span><h2 id="xv-explain-title">Don&apos;t want to read the whole guide?</h2><p>Get the idea in seconds, or continue with Xroga&apos;s AI assistant.</p></div>
        <div className="xv-explain-modes" role="group" aria-label="Explanation length">
          {(['quick','simple','steps'] as const).map((option) => <button type="button" key={option} aria-pressed={mode===option} onClick={() => setMode(option)}>{option === 'quick' ? 'Quick answer' : option === 'simple' ? 'Explain simply' : 'Steps'}</button>)}
        </div>
      </div>
      <div className="xv-explain-response" aria-live="polite">
        {mode === 'quick' ? <p>{explanation.quick}</p> : mode === 'simple' ? <p>{explanation.simple}</p> : <ol>{explanation.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
      </div>
      <div className="xv-explain-actions">
        <button type="button" onClick={openWorkspace}>Continue in Xroga AI <span aria-hidden="true">↗</span></button>
        <button type="button" className="xv-explain-copy" onClick={copyPrompt}>{copied ? 'Prompt copied' : 'Copy prompt'}</button>
      </div>
      <p className="xv-explain-disclaimer">The quick answers above are reviewed article summaries. The AI follow-up opens your Xroga workspace with a prepared prompt; it is not an automatic diagnosis or a background AI response.</p>
    </section>
  );
}
