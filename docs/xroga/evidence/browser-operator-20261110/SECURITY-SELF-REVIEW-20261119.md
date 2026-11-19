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
