# Command 3 accessibility and visual audit

Target: WCAG 2.2 AA where practical. Automated checks are a partial audit, not an accessibility certification. Tests used the production-built local Next.js app at `http://127.0.0.1:3000`, Chromium, Playwright 1.62.0 and `@axe-core/playwright` 4.13.0. Animations were reduced/disabled for deterministic captures.

| Check | Actual result |
| --- | --- |
| Axe tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` | Four representative states passed with **zero serious or critical** violations: overview at 1440px, journey at 390px, workflow at 768px, Coming soon at 320px. The first pass found a serious contrast failure on the Available now badge; the badge color was darkened and the final pass cleared it. Lower-severity results were not used as a blanket pass claim. |
| Responsive overflow and painted surfaces | `/os-preview/workspace` passed at 320, 390, 768, 1024 and 1440px across the existing white, beige, gray and black themes (20 combinations), with no document-level horizontal overflow. |
| 200% zoom | Journey at a 640px viewport with CSS zoom 2 passed the automated reflow/heading/overflow assertion. This is not a substitute for a browser zoom and screen-reader session. |
| Keyboard/focus | Mobile preview drawer can be opened by keyboard and Escape returns focus to its opener. Existing navigation and preview controls were exercised with role/label-based Playwright locators. A complete manual keyboard traversal of every module was **not** performed. |
| Visual inspection | Captured and inspected [desktop light](screenshots/command3-workspace-desktop-light.png) and [mobile dark](screenshots/command3-workspace-mobile-dark.png). Labels, status, primary controls and footer remain legible; cards stack without clipping at 390px. These are review artifacts, not pixel-perfect goldens. |
| Reduced motion | Test uses `prefers-reduced-motion: reduce` for the width/theme pass. Animated transitions in every legacy route were not individually audited. |

The built-app suite command was `npx playwright test -c frontend/playwright.config.ts frontend/e2e/os-preview.spec.ts frontend/e2e/os-command2.spec.ts frontend/e2e/os-command3.spec.ts frontend/e2e/os-command3-a11y.spec.ts frontend/e2e/os-command3-visual.spec.ts` from repository root: **20 passed, 0 failed**. A subsequent focused public-bundle isolation assertion passed **1/1**. The screenshots are small, deterministic local artifacts. No image from the user's design-reference set was published as a production asset.

Residual limits: Firefox/WebKit and assistive-technology sessions were not run; 400% actual browser zoom, authenticated founder UI/dialog scan, and all rich-result variants remain unverified. The route/action matrix marks partial UX areas; this audit does not upgrade them to complete.
