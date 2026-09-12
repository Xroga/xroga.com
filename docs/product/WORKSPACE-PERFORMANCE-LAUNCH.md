# Workspace performance launch report

## Evidence available

- Frontend production build succeeds and prerenders 164 routes.
- The `/workspace` route’s built route chunk is 11 kB with 367 kB first-load JavaScript in the current build output.
- The authenticated production Workspace renders its header, project identity, conversation, controls, and composer without a browser-visible crash.
- Backend execution has bounded deadlines, retries, provider reservations, context budgets, repository reads, validation output, and browser evidence.

## Latency table

| Journey | Before | After | Evidence status |
| --- | --- | --- | --- |
| Page navigation to usable Workspace | Not measured in a controlled repeated sample | Production page and restored task rendered without crash | Do not fabricate p50/p95 |
| Prompt to visible acknowledgement | 0.53 s in E2E-WEB-001 (one sample) | No controlled repeated post-fix sample | One sample, not p50/p95 |
| Prompt to first useful activity | Not recoverable from existing rendered history | Pending production retest | Do not fabricate |
| Direct chat completion | 25.4 s in E2E-CHAT-001 | No latency code change | One sample, not p50/p95 |
| Search completion | ~32.1 s in E2E-WEB-001 | E2E-WEB-002 passed response-shape/source checks; timing was not captured reliably | One timed sample, not p50/p95 |
| Repository read completion | Included in E2E-REPO-002 | No isolated read timestamp | Do not fabricate |
| Small edit completion | Not recoverable for E2E-REPO-001 | About 2m18s in E2E-REPO-002 | One approximate sample, not p50/p95 |
| Preview readiness | Not applicable to the Python fixture | Pending web fixture | Do not fabricate |

## Bottleneck audit

- Frontend: no launch fix is justified solely from static bundle size. Measure before optimizing.
- Backend: repository hydration validates the remote tree and reuses a cache only when the complete path inventory matches, preventing stale state at the cost of a necessary authoritative read.
- Provider work: retry and repair loops are bounded and require new evidence; repeated review failures in the observed run failed closed instead of publishing unreviewed code.
- Build install caching and bounded outputs have automated coverage.
- Repository folders no longer hide sessions after terminal #24; the scroll container, not a fixed client cap, bounds the visible panel.
