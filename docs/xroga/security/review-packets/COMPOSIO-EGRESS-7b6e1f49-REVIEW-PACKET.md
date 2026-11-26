# Human review packet: egress caller 7b6e1f490ce974fc3971 (Composio client)

Status: **AWAITING INDEPENDENT HUMAN REVIEW.** This packet is evidence for a reviewer. It is not a review, and nothing in
`docs/xroga/security/egress-caller-reviews.json` has been edited to make the gate pass.

## 1. What fails and why (reproduced)

`node scripts/security/audit-egress-callers.mjs --require-complete` on PR #965 head fails with
`Egress review evidence drift:7b6e1f490ce974fc3971`.

Checked one condition at a time (line endings normalised to LF, as CI on Linux sees them):

| Condition in the review entry | Result |
| --- | --- |
| Evidence file COMPOSIO-BOUNDARY-20261028.json: marker present, sha256 | matches |
| composioControl.security.test.ts: marker present, sha256 | matches |
| composioProvenance.security.test.ts: marker present, sha256 | matches |
| `composioClient.ts` source sha256 vs the reviewed `68fa5450c3a8...` | **DIFFERS** |

The reviewed source is the file at commit `bc225b8e9`. Since then this PR changed it in commits `49b7c4d55`, `beb7eee29`,
`12bd3e6f8`, `20f2e3032` (see `git diff bc225b8e9 HEAD -- backend/src/services/integrations/composioClient.ts`, +67 -25).
So the cause is a **genuine source change after review**, not stale evidence files, a missing marker or an unreviewed new
endpoint. (On a Windows checkout with CRLF the evidence hashes also differ; that is a local artefact and not the CI cause.)

## 2. What changed, line by line (all in `backend/src/services/integrations/composioClient.ts`)

1. **Failure diagnostics (`composioRequest`, non-OK branch).** Writes one server log line: HTTP status, the request path with
   identifiers of 16+ characters replaced by `:id`, the provider's error slug (restricted to `[A-Za-z0-9_.-]{1,60}`) and the
   provider error code (20 chars max). With `XROGA_COMPOSIO_ERROR_DETAIL=1` (off by default, set on staging only) it also logs the
   provider message and suggested fix, 300 chars each. No arguments, results, user text or credentials are logged.
2. **Provider reason on 4xx.** For a 4xx response the thrown `ComposioClientError` carries `providerMessage` (provider's own text,
   whitespace-collapsed, 300 chars max). **Reviewer question:** it is untrusted text; confirm how the route relays it
   (it is shown to the model as a tool error so the model can correct arguments) and that it can never be treated as an instruction
   or logged with user data.
3. **Discovery re-check retried up to 3 times (`executeDiscoveredComposioTool`).** The same `searchComposioTools` call (same session,
   same query, same mode, same origin) is repeated if the approved tool is not in the result. The tool must still be found in this
   session's own discovery and pass `canUserAccessComposioToolkit`. No new destination, and the authorization decision is unchanged.
4. **Execute with account first, one retry without it.** The approved `account` is always sent first. Only if Composio answers HTTP 400
   with a message containing "multi-account selection is not enabled" is the same request repeated once without `account`, and a
   process-wide flag (`accountSelectionUnsupported`) remembers it. **Reviewer question:** the retry relies on the live account check
   that runs before the execute (connected account id must equal the approved one, else 409 `COMPOSIO_ACTION_ACCOUNT_CHANGED`).
   The flag describes the Composio *project* (a platform fact), not a tenant, but it is module-global: confirm that is acceptable.

## 3. Outbound data and authority (unchanged unless stated)

| Item | Value |
| --- | --- |
| Destination | The existing fixed Composio API origin used by `composioRequest`; no new host, path family or method |
| Endpoint touched by new behaviour | `POST /tool_router/session/{sessionId}/execute` (second attempt without `account`) and the existing session search path (up to two extra identical searches) |
| Data sent | Same body as before: `tool_slug`, `arguments`, optional `account`, `enable_auto_workbench_offload:false`. The retry sends the same body minus `account` |
| Data that can newly leave Xroga | None. New logging stays in Xroga's own server logs (Cloud Run) |
| Tenant scoping | Unchanged: `userId`, issued actor/session and live account check run before the execute |
| Credentials | Unchanged: the Composio key is attached inside `composioRequest`; not in logs, arguments or errors. The new log line never prints headers |
| Approval | Unchanged: the per-change approval card and one-use claim are upstream of this function |
| Duplicate-write risk | A retry-without-account happens only after Composio **refused** the first call with a 400 before running anything; a 5xx/timeout is not retried |

## 4. Validation already run

- Backend tests for the Composio client and execute path (including the account-refusal retry and `resetComposioAccountSelectionMemory`)
  pass; the golden rule "approved account is sent first" is covered by `deterministic-golden`.
- Staging replay on the real Composio API: the refusal text was observed ("'account' parameter is not supported for this project.
  Multi-account selection is not enabled."), which is what the retry matches.

## 5. What a reviewer must do to close the gate

1. Read the diff in section 1 and answer the two reviewer questions (items 2 and 4).
2. If accepted, regenerate the entry **by the repository's own procedure** so `callSha256` and `sourceFileSha256` reflect the new source
   and the disposition/trust text records the reviewer and the new behaviours. A second person, not the author of the change, must sign.
3. Rerun `node scripts/security/audit-egress-callers.mjs --require-complete` and the node tests listed in
   `.github/workflows/xroga-tenant-security.yml`.
