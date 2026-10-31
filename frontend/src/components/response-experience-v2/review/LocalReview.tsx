import { useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import ResponseCanvasV2 from '../ResponseCanvasV2';
import { adaptResponseV2 } from '../document';
import { specimensV2 } from '../specimens';
import './review.css';

function Review() {
  const [sample, setSample] = useState('greeting');
  const [dark, setDark] = useState(true);
  const [length, setLength] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const message = specimensV2[sample];
  const streaming = length != null && length < message.content.length;
  useEffect(() => {
    if (!streaming) return;
    const timer = setTimeout(() => setLength(n => Math.min(message.content.length, (n ?? 0) + 24)), 70);
    return () => clearTimeout(timer);
  }, [length, streaming, message.content.length]);
  const input = saved ? JSON.parse(JSON.stringify(message)) : message;
  const response = adaptResponseV2({ ...input, content: length == null ? input.content : input.content.slice(0, length), featureOutput: streaming ? undefined : input.featureOutput }, streaming);
  return <div className="review-page" data-theme={dark ? 'dark' : 'light'} style={{ colorScheme: dark ? 'dark' : 'light' } as CSSProperties}>
    <header className="review-toolbar"><span>Xroga · local visual review</span><label>Example <select value={sample} onChange={e => { setSample(e.target.value); setLength(null); setSaved(false); }}>{Object.keys(specimensV2).map(k => <option key={k}>{k}</option>)}</select></label><button onClick={() => setDark(!dark)}>Use {dark ? 'light' : 'dark'} theme</button><button onClick={() => setLength(0)}>Replay stream</button><button onClick={() => { setLength(null); setSaved(true); }}>Reopen serialized response</button></header>
    <p className="review-disclaimer">Synthetic fixtures · actual V2 renderer · no account, model calls or saved customer messages</p>
    <main className="review-conversation"><div className="review-prompt">{sample === 'calculator' ? 'Help me explore a hypothetical position risk budget.' : sample === 'chart' ? 'Compare these supplied measurements and explain the difference.' : sample === 'sources' ? 'Explain how a browser represents and updates a document.' : 'Help me understand this clearly.'}</div><div className="review-answer" data-restored={saved}>{response.supported ? <ResponseCanvasV2 key={sample} document={response.document} /> : <p>{message.content}</p>}</div></main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Review />);
