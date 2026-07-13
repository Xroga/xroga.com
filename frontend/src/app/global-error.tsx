'use client';

import { useEffect } from 'react';
import { GLOBAL_ERROR_CSS } from './global-error-styles';
import { storageBootstrapScript } from '@/lib/storageBootstrapScript';

const ERROR_RECOVERY_KEY = 'xroga_error_recovery_attempted';

function hardResetWorkspace() {
  try {
    localStorage.removeItem('xroga-theme');
    localStorage.removeItem('xroga_workspace_session');
    localStorage.removeItem('xroga_custom_desktop_bg');
    localStorage.removeItem('xroga_custom_mobile_bg');
    localStorage.removeItem('xroga_slideshow_enabled');
    localStorage.removeItem('xroga_slideshow_frozen_index');
    sessionStorage.removeItem('xroga_workspace_session');
    sessionStorage.removeItem(ERROR_RECOVERY_KEY);
  } catch {
    /* ignore */
  }
  window.location.href = '/workspace';
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error.message, error.stack);

    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(ERROR_RECOVERY_KEY)) return;

    sessionStorage.setItem(ERROR_RECOVERY_KEY, '1');
    try {
      localStorage.removeItem('xroga-theme');
      localStorage.removeItem('xroga_workspace_session');
      localStorage.removeItem('xroga_custom_desktop_bg');
      localStorage.removeItem('xroga_custom_mobile_bg');
      sessionStorage.removeItem('xroga_workspace_session');
    } catch {
      /* ignore */
    }

    window.setTimeout(() => window.location.replace('/workspace'), 500);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=Outfit:wght@400;600;700&family=Syne:wght@600;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_ERROR_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: storageBootstrapScript() }} />
      </head>
      <body>
        <div className="xv-ge">
          <div className="xv-ge__glow" aria-hidden />
          <div className="xv-ge__orb" aria-hidden>
            <span className="xv-ge__ring xv-ge__ring--outer" />
            <span className="xv-ge__ring xv-ge__ring--inner" />
            <span className="xv-ge__core" />
          </div>

          <div className="xv-ge__panel">
            <p className="xv-ge__code">System</p>
            <p className="xv-ge__brand">
              Black Hole <span className="xv-ge__brand-v">V∞</span>
            </p>
            <h1 className="xv-ge__title">Workspace session needs a refresh</h1>
            <p className="xv-ge__desc">
              A cached session conflict interrupted the app. Reset once to continue — your account and
              projects are safe.
            </p>
            <div className="xv-ge__actions">
              <button type="button" className="xv-ge__btn xv-ge__btn--primary" onClick={hardResetWorkspace}>
                Reset &amp; continue
              </button>
              <button type="button" className="xv-ge__btn xv-ge__btn--secondary" onClick={hardResetWorkspace}>
                Open workspace
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
