# Golden acceptance harness

The canonical twelve-journey contracts live in `docs/xroga/golden-journey-matrix.json`; `fixtures/fixtures.mjs` is reviewed seed input and `fixtures/goals.json` is generated typed input. There is no second chat, scheduler or product runtime.

Run `node scripts/xroga/golden-journeys.mjs` after reviewed fixture changes and `node scripts/xroga/validate-golden-journeys.mjs`. Contracts alone cannot grant PASS. All current journeys are BLOCKED_KNOWN_GAP with exact missing evidence and requirement ownership; component/stub test passes are tracked separately.

Executable boundaries extend existing infrastructure:

- Backend Node/tsx: `backend/src/e2e/xrogaGoldenJourneys.test.ts` (real auth denial, SSE transport, GoalContract, business preparation/confirmation/digest/tenant/read-only/provider failure and timeout, output truth and disconnect helpers).
- Frontend Node/tsx: `frontend/src/lib/goldenJourneyRendering.test.ts` (actual canonical adapters, restored replay, partial/failure semantics and stored block union).
- Existing Playwright config: `frontend/e2e/xroga-golden/public-fixtures.spec.ts` (actual guest UI with intercepted loopback fixture response/reload; denied founder SSR/RSC). It is explicitly not real authenticated SSE proof.

PR tests refuse external browser origins and intercept external provider fetches without forwarding. Fixtures are fictional and marked DEMO. No real account, charge, message, Git mutation, deployment, durable storage or store submission occurs. Restore mocks/environment, terminate local test runs/servers and keep artifacts ignored. Authenticated/staging security tests remain mandatory and BLOCKED_PENDING_TEST_CONFIGURATION; never run production users or service-role credentials here.

Approved provider-sandbox execution and production read-only smoke are separate tiers. Production smoke uses the existing release workflow. Provider-dependent journeys cannot be converted to PASS merely because a stub returned 200. Future completion must attach independent owner-bound execution, verification, cost and durable-evidence attestations before reconciling matrix state.
