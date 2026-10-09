# Command 1 deployment and verification report

## Built scope

- Public `/os-preview` overview and twelve grouped destination pages, with honest Available now / Interactive preview / Coming soon states.
- `/os-preview/journey`: three static fixtures, one complete deterministic clinic journey, alternate outcomes, controls, event timeline, concept artifact and explicitly simulated receipt.
- `/os-preview/founder`: dynamic, no-store, noindex founder Operations shell. Live diagnostics intentionally **not connected** because existing admin endpoints admit both `admin` and `owner`.
- Navigation additions in existing public Product menu/mobile menu and workspace Explore group. Existing chat, SSE, project store, preview dock, backend auth and billing flows were not rewritten.
- No new dependency packages, environment keys, database schema or backend mutation.

## Commands and actual results (local built frontend)

| Command | Result |
| --- | --- |
| `npx tsx --tsconfig frontend/tsconfig.json --test frontend/src/lib/osPreview.test.ts frontend/src/lib/osFounderAccess.test.ts frontend/src/lib/supabase/routeAccess.test.ts frontend/src/lib/publicMarketing.test.ts` | 11 passed, 0 failed. |
| `npm run build --workspace=frontend` | Passed; Next.js 15.5.21 compiled and generated 185 pages. Existing unrelated lint warnings remain. |
| `npm run lint --workspace=frontend` | Exit 0; existing unrelated warnings remain, none in new files after cleanup. |
| `npm run test:frontend` | 906 passed, 0 failed after adding the route-inventory regression test. |
| `npm run growth:technical:validate -- --json` | Passed: 167 inventoried URLs, 97 indexable, zero errors. The first CI run found the five new routes missing from this inventory; they are now classified as nonindexable/private. |
| `npx tsx --tsconfig frontend/tsconfig.json --test frontend/src/lib/publicUrlInventory.osPreview.test.ts` | 1 passed, 0 failed; confirms preview routes cannot enter the sitemap or be classified as indexable. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npx playwright test e2e/os-preview.spec.ts` | 5 passed, 0 failed after fixing a test-only ambiguous locator. Covers guest demo, alternate controls, 390px mobile nav, signed-out founder denial, all public destinations, 390/768/1440px overflow, and forbidden API request absence. |
| `npx tsc --noEmit --project frontend/tsconfig.json` | Nonzero due pre-existing test-file errors in `projectContextWiring.test.ts`, `semanticExecution.test.ts`, `seoExpansionContent.test.ts`, `streamStallGuard.test.ts`, `terminal/agentV2Resume.test.ts`, `terminal/durableStop.test.ts` and `terminal/freshProductIsolation.test.ts`. No Command 1 file appears in the error list. Next production build type validation passes. These unrelated files were not altered. |
| `GET http://127.0.0.1:3100/os-preview/founder` without cookies | HTTP 307 redirect to `/auth/login`, no founder HTML. |

Visual captures from the built local frontend are in `screenshots/` at desktop 1440px, tablet 768px and mobile 390px, plus a full mobile journey capture. They show the preview, not real execution evidence.

## Deployment state

Review branch: `feat/xroga-os-command-1-preview`; PR: [#791](https://github.com/Xroga/xroga.com/pull/791). The corrected frontend deployment is Vercel Preview `dpl_9mtUqbz8drLwVceAzQMKiF4BpKs5`, built from `a75b117148fbf4108e979fb4ec0910834faa7601`, marked `READY` by Vercel. Its checked URL is [xrogaai-pvvd70hva-xrogas-projects.vercel.app/os-preview](https://xrogaai-pvvd70hva-xrogas-projects.vercel.app/os-preview). This Preview deployment retains Vercel sign-in protection; it is **not** public production at `xroga.com`.

The authenticated Vercel fetch returned HTTP 200 and correct noindex/public-safe HTML for `/os-preview`, `/os-preview/journey` and `/os-preview/coding`. The signed-out `/os-preview/founder` request resolved to the sign-in page without rendering founder diagnostics. The overview HTML contained neither `/api/admin/errors` nor `/api/operations/readiness` URLs. Browser interactions were tested against the built local server; a remote interactive Playwright run was not available because this checkout has no authenticated Vercel CLI/OIDC token, so the existing preview protection was not weakened.

GitHub checks on the corrected frontend commit: `build` passed, `unit` passed, `static-contracts` passed, and Vercel passed. `authenticated-browser` failed on two unrelated existing assertions: a 5.19px composer/menu spacing discrepancy (the same assertion failed in an earlier 2026-10-06 branch run) and a stale homepage `xroga-companion-hero` locator absent from the unchanged `main` source. The Command 1 Playwright suite itself passed 5/5 locally. We did not edit unrelated UX or suppress those checks. A docs-only report commit may rerun the checks without changing the tested frontend build.

Release decision: do **not** merge/promote while the repository-wide authenticated-browser security gate is red. The public preview is deployable and available to authorized Vercel preview viewers, but `https://xroga.com/os-preview` returned HTTP 404 when checked and is **not live**. Production `main` remains unchanged pending CI repair/review. Server policy has only been tested with mocked dependencies plus signed-out live behavior; a real founder AAL2 account test remains outstanding.

## Remaining before any real founder feed

Establish a separately authorized founder-exclusive backend read policy and redacted data contract; test every endpoint for guest, normal, non-target admin, target email without role and target owner with MFA. Command 1 does not claim that future worker, browser, Drive, analytics or diagnostics systems are live.
