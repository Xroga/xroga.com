'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error.message, error.stack);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>Xroga hit a display glitch</h1>
            <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.6, marginBottom: 20 }}>
              A saved session or browser cache mismatch caused a client error. Reload to continue — your account is safe.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('xroga_workspace_session');
                    sessionStorage.removeItem('xroga_workspace_session');
                  } catch {
                    /* ignore */
                  }
                  reset();
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#006aff',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset &amp; retry
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/dashboard')}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#fafafa',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reload workspace
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
