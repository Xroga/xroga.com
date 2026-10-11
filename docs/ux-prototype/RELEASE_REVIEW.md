# Command 3 release review

## Review artifact and deployment boundary

- Branch: `feat/xroga-os-command-3`, based on actual merged Command 1/1.5/2 work on `origin/main` (`ef65b267` at branch creation).
- Pull request: [#798](https://github.com/Xroga/xroga.com/pull/798). Tested implementation commits: `686801bc09aac0cfe28c4cc45013360bf9733320` and `fc1c6c4c` (full SHA in PR). The static-contract/report commit is `d7d754f2` (full SHA in PR); it does not modify the frontend runtime.
- Vercel PR preview: `https://xrogaaicom-git-feat-xroga-os-command-3-xrogas-projects.vercel.app`. It is protected by Vercel SSO. The code commit `fc1c6c4c` deployment completed, then authenticated Vercel fetches returned **200** for `/os-preview` and `/os-preview/browser` with the expected Xroga OS content and new replay control. An unauthenticated `/os-preview/founder` request reached sign-in with no founder fixture text. Vercel marked `d7d754f2` successful via its **Ignored Build Step** because it only changes a backend static test and docs; the alias was re-probed and still served the verified runtime. A building/protection page is not product verification.
- Production: **not promoted or merged**. Existing `xroga.com` deployment is not claimed to contain this Command 3 work. The preview is a review artifact, not a release approval.

## Actual local commands and outcomes

| Command/check | Result |
| --- | --- |
| `npm run build --workspace=frontend` | Passed twice, including after Browser recovery changes. Next.js 15.5.21 produced all 195 static routes; existing unrelated lint and duplicate-lockfile warnings remain. |
| `npm run build --workspace=backend` | Passed after the narrow readiness policy change. |
| `npm run test:frontend` | 971 passed, 0 failed on final frontend code. |
| `npm run test --workspace=backend` | 2704 passed, 13 skipped, 0 failed, including the rerun after the CI static assertion was corrected. |
| `npm run lint --workspace=frontend` | Exit 0 after final Browser changes; existing unrelated warnings, no new lint failure. |
| `npx playwright test -c frontend/playwright.config.ts frontend/e2e/os-preview.spec.ts frontend/e2e/os-command2.spec.ts frontend/e2e/os-command3.spec.ts frontend/e2e/os-command3-a11y.spec.ts frontend/e2e/os-command3-visual.spec.ts` | 22 passed, 0 failed against a locally served production build. Includes guest HTML/RSC founder denial, public-loaded-bundle isolation, deterministic clinic result/evidence, Browser fallback/denial, mobile focus, axe and visual widths/themes. |
| `git diff --check`, YAML parser for both changed workflows, `npx tsx --test backend/src/growth/growthSchema.test.ts` | Passed; 5 focused contract tests pass. CRLF normalization warnings only. |
| Direct `npx tsc --noEmit --project frontend/tsconfig.json` | **Failed pre-existing** test-file diagnostics (TS1501, TS2353, TS2339). The supported Next build type gate passed. Not suppressed or rewritten. |

The first post-push GitHub CI run (commit `686801bc`) passed API/Frontend builds, unit, growth/static, authority and authenticated-browser jobs, and Vercel. **Its authenticated-browser pass is not an acceptable release gate**: the old workflow explicitly used the production Supabase project, created temporary fixture users/projects, and could conditionally PATCH production auth configuration. The log cannot establish whether that conditional PATCH ran. The follow-up commit `fc1c6c4c` removes that configuration mutation and requires a dedicated TEST project. Its new authenticated-browser job failed safely at preflight in 10 seconds with `missing_required_variable=NEXT_PUBLIC_SUPABASE_URL`; no fixture setup ran. Its API/frontend builds, growth/static, authority and Vercel checks passed. Its unit job failed because a pre-existing static contract test still expected production secret names. Commit `d7d754f2` corrected that assertion: the final API/frontend builds, growth/static, authority and unit checks all passed; authenticated-browser again failed safely at preflight because the isolated TEST variables are not configured. Vercel skipped rebuilding unchanged runtime files. The authenticated TEST job remains intentionally blocked until safe configuration exists.

## Status by product truth

- **Existing production-working systems, unchanged here:** the canonical chat/SSE/output renderer, real workspace, account/billing, existing admin routes and backend execution. This PR does not claim a fresh production regression pass against actual users.
- **Interactive preview, locally tested:** outcome draft and deterministic receipt with sample acceptance checks; shared project selection; Browser Operator explicit failure recovery/denial; Command 2's existing demo routes as listed in `ROUTE_ACTION_MATRIX.md`; founder-only fictional Scenario Lab is unit-tested but not browser-tested as a genuine AAL2 owner.
- **Coming soon / partial:** real Browser/Workflow workers, Drive durable storage and quota, real employee execution, market intelligence, actual model/usage telemetry and many advanced Command 2 interactions. The matrix and `UX_DEFECTS.md` do not mark mere route rendering as complete.
- **Founder backend pending:** no `/api/admin/errors` or `/api/operations/readiness` feed is connected to Founder Operations. Their existing admin/owner policy is broader than the target founder policy; `/api/admin/errors` is not a redacted founder API. Founder-authenticated route and direct API E2E require a dedicated isolated TEST project with an AAL2 owner fixture.

## Stop-ship decisions and rollback

Do not merge/promote while the authenticated-browser gate lacks an isolated TEST project, the first CI run's production side effects have not been reviewed, or the founder-only live diagnostic API lacks independent server authorization/redaction. No bypass, test skip or production fixture user should be introduced to force a green badge. Configure `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY` secrets and `E2E_ISOLATED_PROJECT_REF` variable for an approved TEST Supabase project, then rerun CI; review the old run's auth settings and fixture cleanup separately. A true founder AAL2 route check still needs a deliberately provisioned isolated identity; the current fixture spec does not prove that persona.

The change is isolated to a review branch and PR preview. If a future release regresses, disable the `/os-preview` entry point or revert this PR and promote the last known-good Vercel deployment under existing release controls. The readiness route's newly restricted admin/owner policy should be reviewed before any rollback because reverting it would restore ordinary-user access to operational evidence. No schema migration, DNS change or production promotion is part of this PR.
