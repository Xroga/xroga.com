'use client';

import Link from 'next/link';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function OsPreviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="os-preview" style={{ display: 'grid', placeItems: 'center', padding: 24 }}><div className="os-panel" style={{ width: 'min(100%,480px)' }}><AlertCircle size={25} aria-hidden="true" /><h1 style={{ fontSize: 27, letterSpacing: '-.04em', margin: '14px 0' }}>This preview could not load.</h1><p>No work was performed. Try again, or return to the preview home.</p><div className="os-actions"><button className="os-button os-button-primary" type="button" onClick={reset}><RotateCcw size={15} /> Try again</button><Link className="os-button" href="/os-preview">Preview home</Link></div></div></main>;
}
