# Response experience, bounded live acceptance plan

Prepared November 4, 2026 by Claude. NOT APPROVED, BUILT OR DEPLOYED. No production action in this document has been run.

Pin (to be re-recorded at approval time): branch `claude/response-presentation-20261104`, head `23f85dc192e3bf207550070032cbe5214ca3a1c6`. Live now: frontend `4830b424` (Vercel production), API and canonical Job on digest `sha256:b060ee406046…` (`xroga-api-zurelay-3bed89-serving-1103`, 100% traffic, minimum instances 0). Only that revision has a running instance (checked read-only).

## What this tests, and what it does not prove

Offline evidence so far: backend 1,426 AI tests pass (7 skipped), frontend 1,447 of 1,448 plus the runner-based table test, both type checks, the pacing migration and its rollback on real PostgreSQL. New since the failed acceptance: output budget scaled to the planned sections (the captured answer was truncated at 4,096 tokens), extra accuracy guards (client-trusted billing and tenant claims), calculator and branching-workflow selection, role-coloured diagrams, durable per-key request pacing.

Not proven offline: that Zurelay honours `reasoning_effort: none`, accepts the strict JSON schema, that real DeepSeek output fills every planned section, any real-model answer quality, Share and Copy fidelity on a stored answer, mobile on a real phone. Passing CI is not acceptance.

## Preconditions (all must hold before any paid or production step)

1. Exact-source CI green for backend and frontend on the pinned SHAs, on Node 22, including the strict caller audit and source-register checks. The register files taken from the live line during integration are regenerated first.
2. Codex has stopped editing this feature and has committed or discarded its pacing work. Nobody else is deploying.
3. Ledger re-read: last documented remaining allowance was 496,448 micro-USD of the original $0.50 on November 2. The later Zurelay request and the 429 attempt are not reconciled in my view. The live ledger is read again immediately before each prompt.
4. The healthy serving revision and Job image are confirmed as the paired recovery target.

## Production actions requested (approve each separately)

A. SQL, exact files only: `provider-request-pacing.sql` (sha256 `7f08256276d8c943…`) and its rollback `provider-request-pacing.rollback.sql` (sha256 `e45c75ed43a3bf3c…`) in Supabase project `nzenxdfumxrnsmybazmo`. Adds two nullable fence columns and one small capacity table plus two functions. No customer, financial or permission data changes. Rollback is tested and repeatable.

B. Backend: one build of the pinned source in the existing Google repository, one zero-traffic readiness candidate, then the paired `xroga-api` and `xroga-canonical-production` Job cutover using the existing runbook scripts (`submit-build.py`, `verify-image.py`, `candidate.py`, `private-ready.py`, `cutover.py`) and fence SQL. Maintenance at most 60 minutes. New revisions use minimum instances 0 and request-based billing, with no new service, VM, IAM, DNS or tag left behind. Expected Google cost: one build of about three minutes, within the earlier $0.50 once and $0.10 per month image ceiling, credits first.

C. Frontend: Preview first, checked while signed in. Production promotion needs the Vercel owner email code, which only you can enter. The V2 renderer stays founder-only for this test. Removing the gate for all users is a separate decision after acceptance.

D. Model spend, inside the existing $0.50 combined ceiling: at most $0.05 for this run. Observed DeepSeek answers cost $0.0004 to $0.002 each. At most 12 provider requests (six prompts, at most two requests each), sent one at a time and spaced by the durable pacing (about 11 seconds, 6 requests per minute maximum). No retry, no formatting-only second call, no paid search beyond the one research prompt, which is withheld if its retrieval cost is not already approved.

## Test matrix (new authenticated empty conversation, no repository or attachments, verified in the UI)

Pass and fail criteria are fixed now and are not edited after seeing a result.

1. SaaS: "Explain a small multi-tenant SaaS architecture using Next.js, Supabase and Stripe. Include a useful architecture diagram and describe tenant isolation and the role of each component. This is an explanation only, do not build or execute anything." Pass: connected diagram with correct directed edges (browser to Next.js; Next.js to Supabase and Stripe; Stripe webhook to Next.js to Supabase), linked logos for the three products, tenant comparison cards, a scoped schema table, billing flow. Tenant guidance must use current membership, and must say the browser never holds a service-role key and that service-role bypasses RLS. Billing must rely on a verified webhook, not the success page. The review guard must not trigger.
2. Automation: "Show me a lead-capture automation workflow for a marketing agency: form submission, qualification, CRM update, follow-up email, and what happens if the CRM is down. This is an explanation only." Pass: one connected diagram with a failure branch and correct labels, no invented tool permissions.
3. Calculation: "If I invest $5,000 at 7% a year for 10 years with $200 added every month, what do I end up with? Let me change the numbers." Pass: working inputs and sliders, a deterministic result matching an independent formula to the cent, reset, no new request when inputs change.
4. Research (only if retrieval cost is approved): "What does the official Supabase documentation say about RLS and the service role key?" Pass: every citation URL was actually retrieved, at least two distinct domains, publisher favicons, no invented quotes.
5. Simple: "What is the capital of Australia, and why isn't it Sydney?" Pass: short plain prose, no cards, tables or graphs.
6. Code: a short TypeScript snippet with a missing `await` on `response.json()`. Pass: names the bug, shows a corrected snippet, no brand chips inside code.

Every response is also checked for: completeness against the plan (no truncation, `finish_reason: stop`), zero reasoning tokens, correct block order, no empty components, desktop 1440 and mobile 390 without horizontal page overflow, light and dark themes, keyboard use of controls, save and reopen, Copy text, one private Share opened then revoked (no public link), and `finish_reason` and cost recorded per request.

## Stop conditions

Stop and report, with no retry, if: any request returns 429 or a provider error; reasoning tokens are above zero (the setting is not honoured); the strict schema is rejected; a request would exceed the remaining allowance; accounting is uncertain; an answer is truncated; or any security or tenant check fails. A failed case blocks declaring success.

## Verification and cleanup after the test

Within one hour: instance count per revision (only the new serving revision running), no new traffic tags, no minimum instance above 0 beyond the serving revision's existing setting, Job and queue healthy, fence open, voice route unchanged. Billing read by SKU and usage date, because it posts late. Temporary readiness tasks and candidate tags removed. Report actual provider spend and every unresolved hold.

## Rollback

Recovery pair is the current serving revision and Job image. Use the existing pause, drain, recover-job, recover-traffic, verify, resume sequence; apply the tested rollback SQL only after no revision calls the pacing functions. Frontend: promote the previous production deployment or use Instant Rollback. Do not retry a failed rollout; find the cause, fix it offline and produce new evidence first.

## What the founder must do

Approve A, B, C and D individually. Sign in to Workspace in the browser pane for the test. Enter the Vercel email code for promotion. Nothing proceeds on a general approval.
