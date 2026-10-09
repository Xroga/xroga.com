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
| `npm run test:frontend` | 905 passed, 0 failed. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npx playwright test e2e/os-preview.spec.ts` | 5 passed, 0 failed after fixing a test-only ambiguous locator. Covers guest demo, alternate controls, 390px mobile nav, signed-out founder denial, all public destinations, 390/768/1440px overflow, and forbidden API request absence. |
| `npx tsc --noEmit --project frontend/tsconfig.json` | Nonzero due pre-existing test-file errors in `projectContextWiring.test.ts`, `semanticExecution.test.ts`, `seoExpansionContent.test.ts`, `streamStallGuard.test.ts`, `terminal/agentV2Resume.test.ts`, `terminal/durableStop.test.ts` and `terminal/freshProductIsolation.test.ts`. No Command 1 file appears in the error list. Next production build type validation passes. These unrelated files were not altered. |
| `GET http://127.0.0.1:3100/os-preview/founder` without cookies | HTTP 307 redirect to `/auth/login`, no founder HTML. |

Visual captures from the built local frontend are in `screenshots/` at desktop 1440px, tablet 768px and mobile 390px, plus a full mobile journey capture. They show the preview, not real execution evidence.

## Deployment state

Review branch and PR: pending creation. Git-linked Vercel preview URL and production URL: **not yet verified**. This section will be updated with actual deployment ID, tested URL and release decision before final handoff. Production `main` is intentionally unchanged until review and security gates permit promotion.

## Remaining before any real founder feed

Establish a separately authorized founder-exclusive backend read policy and redacted data contract; test every endpoint for guest, normal, non-target admin, target email without role and target owner with MFA. Command 1 does not claim that future worker, browser, Drive, analytics or diagnostics systems are live.
