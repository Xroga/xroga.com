import { useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import ResponseCanvasV2 from '../ResponseCanvasV2';
import { adaptResponseV2 } from '../document';
import { specimensV2 } from '../specimens';
import generatedSaas from '../testdata/generated-saas-database.json';
import capturedCd5541 from '../testdata/generated-saas-cd5541.json';
import { InteractionScopeV2 } from '../interactionContext';
import './review.css';
const reviewMessages = { ...specimensV2, 'generated-saas-regression': generatedSaas, 'captured-cd5541-regression': capturedCd5541 };

function Review() {
  const [sample, setSample] = useState('greeting');
  const [dark, setDark] = useState(true);
  const [length, setLength] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const message = reviewMessages[sample as keyof typeof reviewMessages];
  const streaming = length != null && length < message.content.length;
  useEffect(() => {
    if (!streaming) return;
    const timer = setTimeout(() => setLength(n => Math.min(message.content.length, (n ?? 0) + 24)), 70);
    return () => clearTimeout(timer);
  }, [length, streaming, message.content.length]);
  const input = saved ? JSON.parse(JSON.stringify(message)) : message;
  const response = adaptResponseV2({ ...input, content: length == null ? input.content : input.content.slice(0, length), featureOutput: streaming ? undefined : input.featureOutput }, streaming);
  return <div className="review-page" data-theme={dark ? 'dark' : 'light'} style={{ colorScheme: dark ? 'dark' : 'light' } as CSSProperties}>
    <header className="review-toolbar"><span>Xroga · local visual review</span><label>Example <select value={sample} onChange={e => { setSample(e.target.value); setLength(null); setSaved(false); }}>{Object.keys(reviewMessages).map(k => <option key={k}>{k}</option>)}</select></label><button onClick={() => setDark(!dark)}>Use {dark ? 'light' : 'dark'} theme</button><button onClick={() => setLength(0)}>Replay stream</button><button onClick={() => { setLength(null); setSaved(true); }}>Reopen serialized response</button></header>
    <p className="review-disclaimer">{sample === 'captured-cd5541-regression' ? 'Captured failed production acceptance · local replay, not a new generation · omitted schema and scope comparison remain absent' : sample === 'generated-saas-regression' ? 'Captured generated regression · local replay, not live acceptance · contains known webhook-advice limitations' : 'Synthetic fixtures · actual V2 renderer · no account or model calls'}</p>
    <main className="review-conversation"><div className="review-prompt">{sample === 'calculator' ? 'Help me explore a hypothetical position risk budget.' : sample === 'chart' ? 'Compare these supplied measurements and explain the difference.' : sample === 'sources' ? 'Explain how a browser represents and updates a document.' : 'Help me understand this clearly.'}</div><div className="review-answer" data-restored={saved}><InteractionScopeV2.Provider value={`synthetic-local-review:${sample}`}>{response.supported ? <ResponseCanvasV2 key={`${sample}:${saved}`} document={response.document} /> : <p>{message.content}</p>}</InteractionScopeV2.Provider></div></main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Review />);
