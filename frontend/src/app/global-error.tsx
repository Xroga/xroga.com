'use client';

import { useEffect } from 'react';
import { GLOBAL_ERROR_CSS } from './global-error-styles';
import { storageBootstrapScript } from '@/lib/storageBootstrapScript';

/**
 * The root error boundary.
 *
 * It previously took no props and told the reader "The problem has been recorded"
 * while recording nothing — Next hands this component the error and it was dropped
 * on the floor. So every report of this screen arrived with no name, no stack and
 * no digest, and the only way to investigate was to guess.
 *
 * The digest is the one identifier that ties a crash the reader saw to the entry in
 * the platform's own logs, so it is printed to the console *and* shown on the page:
 * someone reporting this screen can now quote a code instead of a description.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Grouped, so the name, message, digest and stack arrive together rather than as
    // four separate lines that interleave with whatever else is logging.
    console.error('[GlobalError]', {
      name: error?.name,
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
            <h1 className="xv-ge__title">Xroga could not load this page</h1>
            <p className="xv-ge__desc">
              The problem has been recorded. Reload this page or return to the public homepage; your
              account and projects are unchanged.
            </p>
            <div className="xv-ge__actions">
              <button type="button" className="xv-ge__btn xv-ge__btn--primary" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <button type="button" className="xv-ge__btn xv-ge__btn--secondary" onClick={() => window.location.assign('/')}>
                Return to homepage
              </button>
            </div>
            {error?.digest ? (
              <p className="xv-ge__digest">
                Reference <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
