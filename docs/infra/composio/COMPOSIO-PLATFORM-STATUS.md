# Composio platform expansion: audit, capability matrix, compatibility report

Branch `claude/composio-platform-expansion`, from `main` at `bc669f8a` (PR #852 merge). Separate from the three Batch 2 draft PRs (#857, #858, #859) and from Codex's Google migration. Nothing here is merged, deployed, enabled in production, or billable. **No call was made to Composio** (no API key was used), so nothing below is PROVIDER VERIFIED.

Evidence vocabulary:

| Label | Meaning |
|---|---|
| IMPLEMENTED | Code exists and is wired |
| LOCALLY VERIFIED | Production code run against a stubbed HTTP layer that reproduces the documented wire format |
| PROVIDER VERIFIED | Run against the real Composio API with an approved test project |
| NOT IMPLEMENTED | Deliberately not built, reason given |

## 1. What existed before this change

`backend/src/services/integrations/composioClient.ts` (about 2,600 lines) is a REST client for **API v3.1** (`https://backend.composio.dev/api/v3.1`), not an SDK wrapper. It already provides: per-user Tool Router sessions (`xroga:<userId>`), session ownership assertion on every use, a read-only session mode (`readOnlyHint` tag), session search with `tool_search` and per-user toolkit and tool namespace filtering, a connection link flow, per-call execution with discovery re-check, exact-account binding and a single-use authority permit for actions, result redaction, catalog and trigger-type listing, custom MCP toolkits, trigger instance upsert, and a signed webhook receiver. It deliberately rejected any session with the workbench, proxy execution or multi-execute enabled.

Audit findings (verified against the official documentation listed in section 6):

| # | Finding | Severity | Resolution |
|---|---|---|---|
| A1 | Sessions were created **without `instant`**. Composio documents that omitting it means "enabled with charges hidden" when the project has Instant turned on. A project-level switch in Composio's dashboard would silently let Xroga sessions run paid calls on Xroga's balance with no Xroga-side limit | High (cost) | Every session now states `instant: false`; every stored session is verified and legacy sessions are repaired by one narrowing PATCH |
| A2 | The workbench (code sandbox) is **on by default** at Composio; Xroga disabled it at creation and rejected sessions that had it on, but a firewall, Instant or multi-account setting was not checked at all | Medium | Policy module checks every field on every use |
| A3 | A tool result blocked by a firewall hook (`result_type: "blocked"`) fell into the generic "not completed" error | Low | Specific `COMPOSIO_FIREWALL_BLOCKED` error with only a sanitized hook name |
| A4 | HTTP 402 (Instant wallet exhausted) was reported as a generic upstream error | Low | Specific `COMPOSIO_INSTANT_BALANCE_EXHAUSTED` |
| A5 | Only one connected account per toolkit was modelled. Composio picks "the most recently connected", and for triggers "the first active connection", so a user with two accounts could have an action or trigger run as the wrong one | Medium (correctness, tenancy-adjacent) | Opt-in multi-account with explicit selection, ownership proof and pinned trigger accounts |
| A6 | A `SHARED` connection (usable by several users through an ACL) reported `has_active_connection: true` in discovery | Medium (tenancy) | Never reported as connected for a user |
| A7 | Webhook verification | OK | Matches the documented scheme exactly (section 4). Test vectors added |

## 2. Capability matrix

Five separate questions for every capability. **A capability is complete only when all five are yes.** None is complete today.

- **Backend:** code exists and is wired into Xroga's own architecture (authentication, tenant context, authority permits, budget ledger).
- **Frontend:** a signed-in user can actually use or see it.
- **Automated:** tests run in CI against a stubbed HTTP layer reproducing the documented wire format (not Composio itself).
- **Real provider:** run against the real Composio API with an approved test project. **Nothing has been.**
- **Production:** safe to enable for real users today.

All new behaviour is **off by default**, controlled by environment variables read at the moment of use (`composioPolicy.ts`).

| Capability | Backend | Frontend | Automated | Real provider | Production ready |
|---|---|---|---|---|---|
| Smart Tool Discovery (session search) | Yes. Existing: search, namespace filtering, discovery re-check before every execution; now `SHARED` connections never count as connected | Yes (existing plugin search and action search) | Yes | No | Existing behaviour is already live; the `SHARED` change is unverified against the real API |
| Sessions and authentication | Yes. Policy verified on every use, legacy sessions repaired, `config_version` concurrency, connection removal off | Existing connect flow | Yes | No | **No**: the new session policy (`instant: false`, stored-config verification) has not run against the real API. First live check: `instant: false` accepted and echoed |
| Multi-account | Yes. List, name, saved default (migration, **not applied**), explicit selection on reads, prepared actions (approval bound to the chosen account, run as exactly it) and trigger creation | **Yes**: Connected accounts panel in the plugin detail view (list, rename, connect another with a name, make default). Renders only when enabled. Chat does not ask "which account?"; with several accounts and no default it stops and says to choose a default | Yes | No | **No**: needs the migration applied, a live check that `multi_account` and `connected_accounts` behave as documented, and the flag. Off by default |
| Firewall | Yes. Exact hooks attached, compared field by field, blocked results become a policy error | **No**: an operator setting, no user-facing surface by design. A blocked action shows "Blocked by session policy" through the existing error path | Yes | No | **No**: needs a paid Composio plan; the hook read-back shape is not documented precisely |
| Workbench | Service function only, authority-permit gated | **No** (no route) | Yes | No | **No**: no route, no ledger (Composio will meter it), not covered by Composio's zero-data-retention. Keep disabled |
| Instant (paid) | Service function only. Explicitly disabled on every session. Ceiling, allowlist, permit, ledger reservation, breaker | **No** (no route) | Yes (in-memory ledger; the durable path is not run against a database) | No | **No**: needs approval, a funded Composio balance, the project setting, and a billing and approval product decision. Keep disabled |
| Triggers and webhooks | Yes. Existing; trigger creation can pin the chosen account; signature scheme re-proved against the documented algorithm | Existing automations UI (no account chooser on trigger creation) | Yes | No | Existing behaviour is live; multi-account pinning is not |
| MCP | Existing custom MCP toolkits. The session `mcp.url` Composio returns is deliberately not used | Existing Custom MCP manager | Existing tests | No | Existing behaviour only |
| Composio-side permissions / approvals, custom tools, preload, fast mode | Not adopted: experimental at Composio; Xroga's authority permits already give exact, single-use approval | n/a | n/a | n/a | n/a |

### Integration review (is each capability inside Xroga's architecture?)

| Capability | Authentication and tenant isolation | Scheduler / execution path | Authorization and approval | Cost control | Verdict |
|---|---|---|---|---|---|
| Discovery, sessions | Verified owner id; session ownership asserted on every use | Existing chat and workflow preparation and execution | Existing | None needed | Integrated |
| Multi-account | Caller's own PRIVATE active accounts only; ids from requests proven against a fresh list; default stored per owner and re-proved | Prepare and dispatch (via the existing prepare, permit and execute path) | Approval is bound to the exact account | None | Integrated for actions, reads and triggers. **Not** integrated: a conversational "which account?" question, and an account chooser on trigger creation |
| Firewall | Session-level | Applies to every session Xroga creates | Not an approval feature | Usage-priced by Composio, opt-in | Integrated, no UI by design |
| Instant | Verified owner id on every ledger call | Runs only through its own gated function, **not** through chat or workflows | Single-use permit bound to tool and arguments | Ceiling, allowlist, ledger reservation, breaker | **Not integrated into any user path**: it has no caller. That is deliberate while it stays disabled |
| Workbench | Verified owner id; dedicated session | Same: no caller | Single-use permit bound to the exact code | None (not billed yet) | **Not integrated into any user path**, deliberately |
| Triggers | Webhook signed and replay-checked; owner from `xroga:<uuid>` metadata | Existing automation processor | Existing | None | Integrated |

**Full Composio integration is not claimed.** It would require: live verification of every item above with an approved test project; the migration applied; a product and billing decision, an approval UI and a spend report before Instant is reachable; the same for Workbench; and a conversational account question in chat.

## 3. SDK and API compatibility report

**Decision: stay on direct REST v3.1. No Composio SDK dependency is added and `package.json` and the lockfile are unchanged.**

| Item | Finding |
|---|---|
| Existing transport | `fetch` against `https://backend.composio.dev/api/v3.1` with `x-api-key`; response size and time bounded; errors mapped to Xroga codes |
| Latest `@composio/core` on npm | 0.27.0 (`latest` tag, checked 2026-10-26) |
| Engines requirement | `node >=22.22.3`. The repository pins `.node-version` to `22.21.1`, so adopting the SDK would require a runtime bump that is outside this change and Codex's migration |
| SDK dependency weight | `openai`, `undici`, `pusher-js`, `@composio/client@2.0.0-rc.19` (a release candidate) among others |
| Why REST is sufficient | Every capability above is a field of the documented v3.1 session API. The SDK is a typed wrapper over the same endpoints |
| API version | v3.1 is current; v3.0 is legacy. Composio's changelog (2026-04-08) says v3.1 returns latest tool versions by default. The changelog lists no breaking change between them. Not verified against the live API |
| SDK releases relevant to these features (changelog) | Instant sessions aligned: TS 0.22.0 (2026-09-29); session policies: TS 0.21.0 (2026-09-24); Instant search prices: TS 0.24.0 (2026-10-14); session tool approvals (2026-10-16); session hooks (Firewall): TS 0.27.0 (2026-10-22). Firewall is not named in any changelog entry; it is documented on its own page |
| Pinning | The API version is pinned in the base URL constant. No SDK version is pinned because none is used |
| Wire shapes used | Session create and PATCH body: `user_id`, `workbench`, `search`, `execute`, `manage_connections`, `instant`, `tags`, `hooks`, `multi_account`, `connected_accounts`, `experimental.restrict_egress_to_composio`; PATCH adds `expected_config_version`. Execute body: `tool_slug`, `arguments`, `account`, `enable_auto_workbench_offload`. Accounts: `GET /connected_accounts?user_ids&toolkit_slugs&statuses`, `PATCH /connected_accounts/{id}` with `alias`. Triggers: `POST /trigger_instances/{slug}/upsert` with `connected_account_id` |

## 4. Webhook verification (audit result)

Composio documents: headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; `HMAC-SHA256` over `{id}.{timestamp}.{rawBody}` with the secret's raw bytes; base64 digest; the signature is the part after the first comma (or the whole header); constant-time comparison; 300 second tolerance in the SDK; V3 envelope `type: "composio.trigger.message"` with `metadata.trigger_id`, `trigger_slug`, `user_id`. `routes/businessAutomationWebhook.ts` implements exactly this, with a stricter timestamp check than the documented manual example. `composioTriggers.test.ts` adds vectors computed from the documented algorithm: correct, prefixed, multi-signature (rotation), wrong secret, changed body, changed id, changed timestamp, replay older and newer than 300 s, malformed signatures. Delivery retries are not documented by Composio, so replay protection stays on Xroga's stored event key.

## 5. Negative security evidence (all LOCALLY VERIFIED)

| Property | Test |
|---|---|
| Normal sessions always carry `instant: false`, workbench off, multi-execute off, no hooks or multi-account | `composioPlatform.test.ts` "states instant:false..." |
| An absent `instant` field is never trusted; a legacy session is repaired with one narrowing PATCH and read back; a repair that does not take fails closed | "repairs a legacy session...", "fails closed when the repair did not take" |
| A session whose access was widened (workbench on) is never "repaired" | "never repairs a session whose access was widened" |
| Another user's session is refused before policy is read | "still refuses another user's session..." |
| Firewall hooks must match field by field; a hook narrowed to a different toolkit is a violation | "requires every firewall hook to be stored exactly" |
| A firewall block reports only a sanitized policy name, never content or credentials | "reports a firewall block as a policy decision..." |
| Instant is refused when disabled, without a ceiling, without an allowlist, for an unlisted tool, without a permit, with a permit for different arguments, and for another user's permit, each **before** any session or reservation | Instant describe block |
| Instant settles to the exact charge; reserves the ceiling in the ledger; a retry cannot reserve twice; the ledger refuses a reservation beyond the user's unlocked entitlement | same |
| A charge above the ceiling, or no charge reported, holds the reservation and trips the breaker; a timeout after the request left keeps the reservation; a 402 and a pre-send failure release it; a firewall-blocked call that was billed is still accounted | same |
| Multi-account: SHARED, foreign-user, disabled, inactive and wrong-toolkit accounts are dropped from the list; a request-supplied account id is accepted only from the caller's own list; with the feature off a supplied id is refused; renaming a foreign account never reaches Composio; names are unique | `composioPlatform.test.ts`, `composioAccountsRoutes.test.ts` |
| Triggers are pinned to the chosen account, and nothing is created for a refused selection | `composioTriggers.test.ts` |
| Workbench is refused when disabled, for empty or oversized code, for a permit issued for different code, and when the session read-back shows scripts could call tools; output is bounded and only known fields are returned | Workbench describe block |

## 6. Official sources consulted (2026-10-26)

- Tool Router session API: https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSession
- Configuring sessions: https://docs.composio.dev/docs/configuring-sessions.md
- Firewall: https://docs.composio.dev/docs/firewall.md
- Instant Tools: https://docs.composio.dev/docs/instant-tools.md
- Remote sandbox: https://docs.composio.dev/docs/sandbox/remote.md and https://docs.composio.dev/toolkits/meta-tools/remote_workbench.md
- Multiple connected accounts: https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts.md
- Connected accounts list: https://docs.composio.dev/reference/api-reference/connected-accounts/getConnectedAccounts
- Search tools meta tool: https://docs.composio.dev/toolkits/meta-tools/search_tools.md
- Triggers: https://docs.composio.dev/docs/triggers.md, https://docs.composio.dev/docs/setting-up-triggers/creating-triggers.md, https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events.md
- Changelog: https://docs.composio.dev/docs/changelog.md
- npm: `@composio/core` 0.27.0

## 7. Pricing and budget implications

- **Instant:** per-call price is published per tool as text (`instant.price.description`), not a machine-readable maximum, and Composio states there is no built-in dollar cap and that balance checks are asynchronous. Xroga therefore enforces its own ceiling: a configured per-call ceiling (absolute maximum 5 USD) is reserved in the existing provider budget ledger (route label `composio:instant`) before the call, which also bounds total spend by the user's unlocked entitlement. A reported charge above the ceiling cannot be settled below what was spent: the reservation is held and Instant is paused for the process until an operator restarts it.
- **Reconciliation gap:** Xroga does not read Composio's execution log, so a held reservation is released by an operator after comparing the log, not automatically.
- **Firewall:** requires a paid Composio plan and is usage-priced; the per-hook rate is not published on the Firewall page. It is opt-in.
- **Workbench:** not billed by Composio today; metering by tier and runtime is announced. No ledger entry is made because there is no price to record. This must be revisited when Composio publishes it.
- **Multi-account and discovery:** no separate charge is documented.
- The change adds **no** new standing cost: with every flag unset, behaviour and spend are unchanged, except that Xroga now explicitly prevents Instant from being used.

## 8. Honest limitations and blockers

- **No live verification.** No Composio project, API key or account was used. Every wire shape is taken from the published documentation and exercised against a stub. A first live run should check, in order: that `POST /tool_router/session` accepts `instant: false`; that the stored `config.instant` echoes `false`; the shape of `config.hooks` in the response (the docs show hooks as request fields but only call the response field `array<any>`; the comparison accepts `applies_to` or `appliesTo`); and the `PATCH` repair path.
- **Egress restriction** (`experimental.restrict_egress_to_composio`) is set at creation and is not echoed in the stored config, so it cannot be verified by reading the session back.
- **`user_id` on connected accounts is deprecated** by Composio and may disappear. Xroga filters by `user_ids` at Composio and treats a present, different `user_id` as foreign, but never depends on it being present.
- **No user-facing Instant or Workbench route.** They are service functions that need an authority permit prepared by a caller. Adding a UI needs product decisions on who may approve spend and code execution, and the prepared-action flow in `businessAction.ts` (about 1,600 lines) was not extended in this change.
- **The Instant breaker is per process**, by design (a restart is a deliberate operator reset). It is not shared across instances.
- **Frontend:** a Connected accounts panel exists in the plugin detail view (list, rename, connect another, make default) and renders only when multi-account is enabled. There is no UI for Instant, Workbench or Firewall, by design, and no account chooser on trigger creation.
- **Pre-existing local test failures:** `githubAuth.revocation` and several credential-vault tests fail on a developer machine without production KMS configuration, identically on `main`; they are environment-dependent and unrelated to this change.
- Requires approval before any live step: a Composio test project and API key, enabling Instant at the project level, a paid plan for Firewall.

## 9. Live tests that are genuinely blocked (none can run without approval)

Each needs an approved Composio test project and API key unless stated.

1. `POST /tool_router/session` accepts `instant: false` and the stored `config.instant` echoes `false` (the legacy-session repair depends on this).
2. `PATCH /tool_router/session/{id}` with `instant: false` and `expected_config_version` is accepted, and a stale version returns 409.
3. Firewall: `hooks` accepted on create and PATCH; the shape of `config.hooks` in the response (the comparison accepts `applies_to` or `appliesTo`); a blocked call returns `result_type: "blocked"` with `block_reason`. Needs a **paid plan**.
4. Multi-account: `multi_account` and `connected_accounts` accepted; `GET /connected_accounts?user_ids&toolkit_slugs&statuses` filters as documented and omits SHARED accounts; `PATCH /connected_accounts/{id}` accepts `alias`; the `account` parameter on execute selects the account; the `alias` field on the connect link is accepted. Needs two real provider accounts.
5. Trigger instance upsert accepts `connected_account_id`.
6. Instant: `account: "instant_account"`, `instant_charge` on the response and HTTP 402 behaviour. Needs the **project Instant setting enabled and a funded balance**, so it spends money; requires explicit approval and a tiny ceiling.
7. Workbench: `COMPOSIO_REMOTE_WORKBENCH` argument names and the 180 s limit; that `enable_tool_execution: false` is honoured; whether egress restriction holds. Runs code in a third-party sandbox.
8. The durable fixed-cost ledger path and the default-account table against a **real PostgreSQL** (needs the migration applied to a disposable database; this change cannot do that locally).
9. End-to-end chat with two real accounts through the Connected accounts panel in a browser.
