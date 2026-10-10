# Command 1.5 release report

Branch: `feat/xroga-rich-response-cards`, stacked on the Command 1 preview branch. Production promotion depends on Command 1 merging and all relevant CI/security gates passing.

The public testing gallery is `/os-preview/rich-results` and is noindex. Its fixture data never enters real chat. Ordinary messages can render validated `rich-results` blocks and conservative sourced web-result cards through the established pipeline. The founder route and backend diagnostics authorization are unchanged.

## Local verification

- `npm run build --workspace=frontend`: passed; Next.js 15.5.21 compiled and generated `/os-preview/rich-results`. Existing lint warnings remain in unrelated files.
- `npm run test:frontend`: 912 passed, 0 failed.
- `npm run test --workspace=backend`: 2,702 passed, 13 skipped, 0 failed.
- `npm run lint --workspace=frontend`: exit 0, existing warnings only.
- `npm run growth:technical:validate`: 0 errors.
- `npx playwright test -c frontend/playwright.config.ts frontend/e2e/rich-results.spec.ts frontend/e2e/os-preview.spec.ts`: 8 passed, 0 failed against local production server. Covers sample labels, no diagnostic API calls, comparison, keyboard, narrow viewport, dark/light, reduced motion, image-free fallback, coupon details and the existing founder guest gate.
- `npx tsc --noEmit -p frontend/tsconfig.json`: fails on pre-existing test-file issues (`projectContextWiring.test.ts`, `semanticExecution.test.ts`, `seoExpansionContent.test.ts`, `streamStallGuard.test.ts`, `agentV2Resume.test.ts`, `durableStop.test.ts`, `freshProductIsolation.test.ts`). No new rich-results file appeared in its diagnostics. The production Next build type check passes.

Screenshots: `screenshots/gallery-desktop.png`, `screenshots/gallery-mobile.png` and `screenshots/gallery-cards-desktop.png`. They are local browser captures, not reference imagery.

## Deployment boundary

PR: https://github.com/Xroga/xroga.com/pull/792 (base: `feat/xroga-os-command-1-preview`, head: `feat/xroga-rich-response-cards`). The existing Vercel Git preview pipeline deployed code commit `6eb13996` as deployment `dpl_5crzARornmnvNmfEJM3VV4iE7L7E` (READY). The exact route `https://xrogaai-6let72n8x-xrogas-projects.vercel.app/os-preview/rich-results` returned HTTP 200 through authorized Vercel preview access, with the gallery title, demo notice and `noindex` metadata. `airplane-window.webp` returned HTTP 200. A signed-out request for `/os-preview/founder` resolved to the sign-in page, with no diagnostics payload. The public `/os-preview` returned HTTP 200.

PR #792's Vercel, unit and static-contract checks passed; production-discovery was skipped by its existing workflow. The preview may require Vercel reviewer authentication. This is a preview deployment, **not** a production release. The prerequisite Command 1 PR #791 is still open and its `authenticated-browser` check is failing, so production promotion is intentionally stopped. No `xroga.com` live route is claimed. Unsupported live commerce, reservations and authorized provider photography remain backend-pending.
