# Workspace production verification, November 14

The initial Workspace release readback identified frontend `5c1ff07c19e07488d8c4243d7d9329e6f17e10b2`, Vercel deployment `dpl_Hs7fae4ASUHaeFyQU9fuhp3Zf9x7`. Eleven required GitHub workflows had passed for that source. The Cloud Run API identified itself as `75d9b91f1228fe4d1c790ce39090010d3b633925` and reported the database, storage and quota checks healthy.

The production frontend moved to `6336007b43f5c6d73dbaba6f0a5c65669a89eac4` during verification. That source includes Connect Apps search and the Projects composer changes. Its Share page recognizes only the V2 snapshot and renders a native snapshot as plain prose. This accounts for that symptom under the later source. The earlier frontend snapshot had passed local strict validation, and the frontend source is not known for the exact instant that test page loaded. The candidate merges the newer production changes and resolves the shared browser test using the current Connect Apps labels.

## What happened in production

| Check | Result |
| --- | --- |
| Saved native architecture in authenticated Workspace | The answer reopened with a connected diagram, three table rows and the saved takeaway. Copy included the roles and takeaway. |
| Fresh official-source research | Workspace asked for approval of the public Python documentation question before Search. Search returned eight sources, none from the required domain. The API withheld synthesis. The Workspace fallback still showed third-party excerpts and the old pending-approval wording. |
| Search accounting | The canonical ledger settled one Zurelay planner dispatch at $0.000049 (2,655 input and 322 output tokens) and one official DeepSeek Search at $0.000750. Total $0.000799. Both had provider request identities. There was no synthesis or repeat dispatch. |
| Owner-only architecture Share | The API created the link. The owner could open it, but the page showed plain text in place of its diagram and table. The stored row contained a native snapshot. Revocation succeeded and subsequent access returned 404. |
| Storage housekeeping | Readiness reported `storage_reconcile_not_scheduled`. A read-only count found two expired active reservations and zero objects awaiting deletion. No reconciliation was run. |

The private links used synthetic test material and were revoked. This report excludes share URLs, account identifiers and provider request identifiers.

## Candidate changes and verification

- Put the documented DeepSeek `site:` clause in the exact approved query. Fit the search terms and domain operators within the 128-Unicode-character limit. Enforce approved host boundaries again on stored results. When no qualifying material remains, replace the pending prompt with a receipt-backed status and suppress unrelated excerpts. [DeepSeek Search contract](https://api-docs.deepseek.com/guides/search/)
- Settle a successful empty DeepSeek result at $0 while keeping its trace and search count. A nonempty provider result can still be billable when the approved domain filter rejects every page. The production canary above had a nonempty result.
- Validate the structured Share snapshot on the server and pass the decoded answer directly to the same validated native surface used by Workspace. Preserve authoritative prose and disclose the fallback if the API cannot validate the stored visual program. The Share route still uses the existing owner/public access decision and no-store response. The original production failure has not been replayed on a hosted candidate yet.
- The regular authenticated CI test now exercises a diagram, table and code in the owner-only Share page at 390 px and verifies revocation. The existing test also covers calculator interactions, two-account isolation, Copy and saved Reopen. The production merge removed the old Connect Apps Map conversion, so its obsolete static caller entry was dropped. Historical evidence remains.

## Release and rollback

Use the exact candidate in draft [PR #981](https://github.com/Xroga/xroga.com/pull/981). Require the focused provenance, empty-billing and Share tests, the full exact-head CI suite, and a private provider-disabled replay of the captured answer. A subsequent bounded check should send one approved documentation search through the normal composer, compare the query and returned URLs with the approval, verify citation icons and destination, and settle ledger receipts. Reopen and Copy the answer and create, open and revoke one private Share. Record authenticated mobile and desktop results. None of these post-candidate hosted checks has been run.

Reconfirm production aliases, Vercel deployment IDs and API/Job release markers immediately before proposing cutover. The current production composer changes are on Vercel deployment `dpl_Co7KtwHoC9HXPtpcnAGnbwrmMJKH` (`6336007b`). `dpl_Hs7fae4ASUHaeFyQU9fuhp3Zf9x7` is the prior verified native frontend. Cloud Run reports `xroga-api-openui-gen-75d9b91f` at 100% and decoder `xroga-api-openui-dec-75d9b91f` Ready at zero default traffic. The canonical Job is pinned to its existing immutable image. Verify the canonical admission fence and preserve the existing rollback package. The changes need no schema or Share format migration. The completed approval for the 5c1ff07c frontend does not cover this candidate.

Storage reconciliation has its own activation path. Before scheduling it, use a staging runtime and private storage to prove the existing route rejects an invalid OIDC audience or caller, accepts the named identity, clears expired reservations and preserves ready objects. The production activation package should identify a named scheduler and identity, exact API revision and audience, cadence, cost and pause-first rollback. Reuse the existing bounded route with orphan scanning off. Keep the active business and browser schedules untouched. [Storage activation runbook](../../infra/COMBINED-ACTIVATION-RUNBOOK.md)
