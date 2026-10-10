# Command 2 deployment report — 2026-10-10

Status: pending final PR preview verification. This branch is a stacked review branch over Command 1.5, which itself depends on unmerged Command 1. No production promotion is authorized by passing a local build alone. The established frontend pathway is Git integration to Vercel; root `vercel.json` has an ignored-build diff guard scoped to app files. No hosting migration, DNS, backend, database, billing or account mutation was made.

Checks completed before PR: `npm run build --workspace=frontend` passed on the final app code (Next 15.5.21; existing lockfile-root and lint warnings); `npm run test --workspace=frontend` passed 917/917; `npm run lint --workspace=frontend` exited 0 with existing unrelated warnings. First local Playwright pass on the development server: 7/9 passed; one clinic selector mismatch and one 20-route sweep timeout. Both test defects were corrected; the final built-production-mode rerun passed 9/9. `git diff --check` exited 0. Backend tests were not required because backend authorization and execution code were untouched.

Founder signed-out browser check passed in the first pass. Correct founder account + owner + AAL2 was not available for a live session test; the server policy from Command 1 remains unchanged and diagnostic APIs remain disconnected. Preview fixtures make no live worker, model, repository, browser, storage or provider API calls.

Local screenshots: `screenshots/command2-workspace-desktop.png` (1440px) and `screenshots/command2-workflow-mobile.png` (390px). Final preview deployment ID, URL, HTTP response and CI status will be recorded only after verified results.
