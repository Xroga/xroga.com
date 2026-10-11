# Founder Scenario & Error Lab matrix

All rows are `SIMULATED SCENARIO` fixtures, not real events. The public-message pane always states what happened, what local demo state was saved, what remains, a safe next action and a `DEMO-*` reference. The founder pane adds fixture environment, source class, replay step, safe correlation ID, severity, fictional tenant scope, redacted cause, retry disposition, hypothesis-vs-evidence and no live investigation links. Every row replays steps `queued → running → review/recovery → final`, resets to `queued`, and is covered by `frontend/src/lib/osFounderLab.test.ts` (`labStatusAt`, uniqueness, safe copy, evidence invariant). This is **unit coverage**, not founder-authenticated browser coverage.

| Scenario ID | Final public status / next step | Restricted fixture finding | Replay/reset test |
| --- | --- | --- | --- |
| `happy-path` | Verified demo; inspect receipt | All sample criteria passed | unit |
| `loading` | Running; wait/cancel | No final result | unit |
| `empty-result` | Partial; revise scope | No matching candidates | unit |
| `invalid-fields` | Blocked; complete fields | Required fields absent | unit |
| `user-cancelled` | Cancelled; replay | User stopped example | unit |
| `input-needed` | Needs approval; clarify | Missing user input | unit |
| `approval-pending` | Needs approval; review scope | Approval not recorded | unit |
| `approval-denied` | Blocked; narrow scope | Permission denied | unit |
| `connection-revoked` | Blocked; review connection | Access withdrawn | unit |
| `provider-timeout` | Repairing; bounded retry | Fictional timeout | unit |
| `rate-limit` | Partial; wait/retry | Fictional rate limit | unit |
| `model-unavailable` | Blocked; approved alternative | Model unavailable | unit |
| `provider-outage` | Failed; await recovery | Provider unavailable | unit |
| `reconnect` | Verified demo; inspect receipt | Replayed checks pass | unit |
| `selector-failure` | Repairing; bounded fallback | Target changed | unit |
| `dom-mismatch` | Blocked; human review | Observations disagree | unit |
| `inaccessible-action` | Blocked; accessible path | No safe action target | unit |
| `workflow-invalid` | Blocked; repair graph | Missing connection | unit |
| `workflow-cycle` | Blocked; remove cycle | Unbounded loop | unit |
| `idempotent-retry` | Verified demo; inspect output | One action key / one output | unit |
| `missing-capability` | Blocked; review permission | Capability absent | unit |
| `budget-exhausted` | Blocked; reduce scope | AI allowance exhausted | unit |
| `overrun-prevented` | Partial; amend budget | Example limit protected | unit |
| `storage-quota` | Blocked; review storage | Storage meter independent of AI allowance | unit |
| `code-test-failure` | Repairing; inspect patch | Assertion failed | unit |
| `patch-conflict` | Blocked; review overlap | Patch conflict | unit |
| `stale-git-base` | Blocked; refresh diff | Base revision changed | unit |
| `dependency-incompatible` | Blocked; choose compatible option | Stack mismatch | unit |
| `missing-license` | Blocked; establish rights | License provenance missing | unit |
| `prohibited-license` | Blocked; reject candidate | Unapproved source license | unit |
| `uncertified-asset` | Needs approval; request review | Certification evidence absent | unit |
| `false-success` | **Blocked**, despite attempted Verified | Required evidence absent; guard overrides claim | unit: explicit guard |
| `partial` | Partial; inspect remainder | Some deliverables unfinished | unit |
| `failed-outcome` | Failed; revise plan | Acceptance unmet | unit |
| `recovery-exhausted` | Failed; human review | Bounded retries spent | unit |
| `stale-version` | Blocked; open latest | Saved candidate out of date | unit |
| `unsafe-input` | Blocked; use approved input | Untrusted instructions denied | unit |
| `secret-candidate` | Blocked; remove sensitive content | Leak candidate denied; no secret value stored | unit |
| `cross-tenant` | Blocked; stay in scope | Tenant read denied; no tenant data present | unit |
| `diagnostics-unavailable` | Blocked; keep disconnected | Founder feed unavailable | unit |
| `permission-denied` | Blocked; use authorized account | All grants required; no bypass | unit |

The fixed finding selector writes only one of four predetermined, non-sensitive labels to `xroga-founder-lab-fixture-notes-v1` in the authenticated founder browser. There is no free-text diagnostic intake, real API call, cross-user storage or production fault injection. No E2E test can assert the lab UI under a true founder account until a dedicated isolated owner+AAL2 test identity is approved; this is a documented coverage blocker, never a client-side test bypass.
