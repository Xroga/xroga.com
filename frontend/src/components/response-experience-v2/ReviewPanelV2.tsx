'use client';
import { useState } from 'react';
import ResponseCanvasV2 from './ResponseCanvasV2';
import { adaptResponseV2 } from './document';
import { specimensV2 } from './specimens';
import styles from './response-v2.module.css';
/** Read-only review, never writes conversation state or sends a prompt. */
export default function ReviewPanelV2() {
  const [sample, setSample] = useState('greeting');
  const response = adaptResponseV2(specimensV2[sample], sample === 'streaming');
  return <details className={styles.review}><summary>Founder V2 presentation review</summary><p>Synthetic, read-only examples. No model calls or saved messages.</p><label>Example <select value={sample} onChange={e => setSample(e.target.value)}>{Object.keys(specimensV2).map(name => <option key={name}>{name}</option>)}</select></label><div className={styles.reviewCanvas}>{response.supported ? <ResponseCanvasV2 key={sample} document={response.document} /> : <><p role="status">This shape uses the original renderer in a real conversation.</p><p>{specimensV2[sample].content}</p></>}</div></details>;
}
