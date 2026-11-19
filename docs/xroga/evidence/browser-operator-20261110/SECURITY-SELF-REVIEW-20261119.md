# Browser Operator: security self-review, 19 November 2026

**Status: a self-review by the engineer who built the changes. It is NOT the independent security review and does not sign it off.** It lists what was read, what was found and fixed, and what still needs an independent reviewer.

## Scope read
Permission and Full access (`pluginPermissionPolicy.ts`, `localBrowser.ts` auto-approval, `localBrowserPlugins.ts`), the dependency stage (`sandbox/dependencyAcquisition.ts`, `repoRun.ts`, `/runs/:id/repo-run`), the document reader (`routes/browserDocuments.ts`, `/documents`), and attachments in the extension.

## Findings and fixes
| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | A package licence needing review (copyleft, custom, undeclared) could be waived by the model itself through `acknowledgedLicences` in the tool call. Model text must not grant a review gate (INV-03). In a live run the model acknowledged MPL-2.0 `certifi` on its own. | High | Fixed: the acknowledgement is honoured only for weak copyleft (MPL, LGPL, EPL, CDDL) that the isolated, no-network, nothing-kept run does not distribute. GPL, AGPL, SSPL, commercial, restricted and undeclared licences always wait for a human. Tests added. A human acknowledgement path for those is not built. |
| 2 | Auto-approval of connected-app changes used a fixed word list matched on whole words, so `SENDS`, `SENDING`, `POSTED` and verbs such as grant, permission, collaborator, transfer, dispatch, trigger, webhook, public, subscribe, mention or assign did not keep their approval card. | High | Fixed: inflected forms match; the verbs above now keep the card. Tests added. A default-deny allowlist of safe verbs would be stronger and is recommended. |
| 3 | The account-wide Full access save clears per-app rows with a `LIKE` pattern whose underscores are wildcards. | Low | Not changed: it is scoped to the same user and no other provider names match. Escape the underscores when next touched. |
| 4 | Staging allows dependency installs (`XROGA_SANDBOX_WORKER_RESTRICTED=1`) and the registry-only egress stage. | Info | Staging only, owner allowlist. Needs independent review of the egress stage before production. |

## Held as designed (read, no change)
Backend decides the mode per call; sending, publishing, deleting and payments keep a card in every mode; `read_only` refuses changes; a policy read failure falls back to `always_ask`; the document route needs a device bearer and bounds size and pages.

## Not covered (needs an independent reviewer)
Composio and sandbox egress, the worker image and its isolation, the desktop bridge RFC, tenant isolation with a second account, the supply-chain of the dependency stage, and production readiness.

## Deployed and re-checked
Both fixes are on staging revision `xroga-api-universal-staging-00143-fuh` (image `lim25-1119`, commit `d07eba59b`, tag `browser-op-1110`, 0 percent of traffic). Live in the installed extension: the pinned `requests==2.32.3` run still works, and the weak-copyleft package `certifi` (MPL-2.0) is still acknowledged by the model as intended (8 packages, 1 flagged). The GPL refusal and the extra outbound verbs are covered by unit tests only; a live GPL install was not run.

## Second-account isolation, first live check (19 November 2026)
Setup: a second staging user (`moeed.zio1315@gmail.com`, confirmed) was created on the staging workspace branch alias, added to `XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS` (revision `00144-wew`), and its Chrome profile paired the extension (device authorize and exchange both 200).
- **Read of A's private sheet through the connected-app path from account B:** B has no connected apps, so the agent did not read it; it started a connect flow for B's own Google account instead (a Composio consent screen, left unapproved: granting scopes on that Google account is the owner's decision). No data from A was returned.
- **Database:** B has no `user_integrations` rows; A's two policy rows are unchanged. RLS is enabled on `user_integrations` (10 policies) and `engineering_resource_reservations`.
- **Not yet done:** B with its own connected Sheets or Notion trying A's sheet id, the reverse direction, and B's Full access setting versus A's. These need B's Google (or Notion) connection approved.
- **Observed:** B's panel shows "Full access: unavailable" until a connected app exists; not investigated further.

### Second-account isolation, both directions (19 November 2026, live)
Both accounts had their own Google Sheets connection (different Google logins) and each agent used the connected-app path, not the browser.
- **B reads A's private sheet (`Xroga speed test D2`):** refused by Google with `403 PERMISSION_DENIED` ("The caller does not have permission"); later attempts returned 400 for the same id. No rows returned.
- **A reads B's private sheet (`SECOND ACCOUNT PRIVATE`, cell A1 holds a marker value):** refused with `403 PERMISSION_DENIED`; one attempt also hit a Google `429` read-quota limit shared by the provider's project. The marker was not returned.
- **Full access is per account:** A's panel showed "Full access: ON" while B's showed "unavailable" at the same time; B has no saved permission row.
- **Caveat on what this proves:** the refusals come from Google, because the two connections belong to different Google logins. It proves the two accounts' connections are not shared. It does not by itself prove Xroga's own tenant checks, which still need an independent reviewer (for example a request from B's device naming A's run or connection id).
- **Side observations:** (1) after the failed read, A's agent opened a Google sign-in page for an unrelated OAuth client ("Portfolio"); no sign-in was done and the run was stopped. The agent should not start a sign-in the user did not ask for. (2) The shared Google read-quota (429) is a likely extra cause of slow Sheets runs.

## AI review (separate agent, not a human attestation), 19 November 2026
A fresh AI reviewer that did not write the code read the security-relevant paths at commit `9f6eba77b` read-only and reported 7 verified findings. **This is AI-generated technical evidence, not a human sign-off.** Status of each:

| # | Finding (severity) | Status |
| --- | --- | --- |
| 1 | A tool name with no write word but a reading word (QUERY, CHECK) is a "read" that runs with no card in every mode but always-ask; RUN, EXECUTE, SQL are in no list (High) | Mitigated: names containing EXECUTE, EXEC, SQL, MUTATION, INVOKE, EVAL, SHELL, COMMAND, SCRIPT or RAW are never auto-approved. Residual: the read/change split in `composioClient.ts` is still name-based; a positive read allowlist or the provider's read-only hint is recommended. |
| 2 | The dependency-install stage (registry network access) runs where the repository's files sit, so a `sitecustomize.py` or `pip/` folder could run in it (High) | Fixed for pip: `python3 -I -m pip` (isolated mode ignores the working directory and PYTHON variables). npm already runs in its own directory with scripts ignored. Residual: copying the repository in only after the network stage ends is not done. |
| 3 | "Low risk" auto-approves writes with no listed outbound word, including calendar events with attendees, merges, payouts; the DRAFT exception also covered `PUBLISH_DRAFT` (Medium) | Mitigated: added INVOICE, PAYOUT, PAYMENT, SUBSCRIPTION, ORDER, CHARGE, REFUND, MERGE, DEPLOY, ATTENDEE(S), RECIPIENT(S); a draft stays automatic only when its only outbound words are email, message, text or comment. Residual: still a word list, not an allowlist; a real "low risk" allowlist is recommended. |
| 4 | The 36 MB body parser ran before the device token was verified (Medium) | Fixed: the token is verified first, then the large body is read. |
| 5 | PDF parsing has no expansion limit or deadline; a compressed stream bomb could stall the API (Medium, inferred, not run) | Not fixed. Needs parsing in a worker thread or subprocess with a memory limit and timeout. Open residual risk. |
| 6 | The licence gate missed `GPLv3`, `GPLv2+`, `AGPLv3` and spelled-out forms; `GPLv3 AND MIT` read as permissive; `MPL-2.0 AND GPLv3` was acknowledgeable (Low/Medium) | Fixed in `classifyLicence` and `isWeakCopyleft`, with tests. Residual: for npm, only top-level packages are gated. |
| 7 | The account-wide permission save wrote the new mode before clearing per-app rows; the `LIKE` pattern treated `_` as a wildcard (Low) | Fixed: per-app rows are cleared first and the prefix is matched exactly. |

Checked and reported fine by the reviewer: tenant identity from the device token and auth middleware (never the request body), run ownership and per-run leases, one-time device codes bound to the extension's proof, device revalidation, turn replay protection and spend pre-charge, plugin call checks (only tools this run found, argument names checked, duplicates refused, one-time approvals), the policy-row exemption (exact regex, four allowed values, fail closed), repository URL and tar handling, prompt-injection boundary with a per-session nonce, attachment scoping, and extension message origins.

Could not verify (open): the worker's real egress allowlist and isolation, the ledger reservation inside `dispatchBrowserModel`, `confirmBusinessAction` internals, tab ownership in the extension controller, sandbox metering (off unless `XROGA_ENGINEERING_METERING=1`).
