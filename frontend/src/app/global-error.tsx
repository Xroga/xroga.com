'use client';

import { GLOBAL_ERROR_CSS } from './global-error-styles';
import { storageBootstrapScript } from '@/lib/storageBootstrapScript';

export default function GlobalError() {
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
          </div>
        </div>
      </body>
    </html>
  );
}
