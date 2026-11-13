# RFC: Running a custom MCP tool from the browser agent

Status: DESIGN ONLY. Nothing here is implemented. It changes a trust boundary, so it needs the independent security review that the Composio egress path already waits for (`docs/xroga/security/review-packets/COMPOSIO-EGRESS-7b6e1f49-REVIEW-PACKET.md`) before any code is merged.
Date: 2026-11-13. Author: Claude (design), owner decision: "Yes, design it".
Invariants touched: INV-03 (backend is authority), INV-05 (tenant identity), INV-06 (consequential authority), INV-07 (bounded cost), INV-08 (secrets), INV-10 (no fake completion), INV-12 (small reversible changes). No new orchestrator or control plane (INV-01, INV-02): this extends the existing `plugin_search` / `plugin_read` / `plugin_act` path only.

## 1. What happens today (verified in code and live)

- A user can register a custom MCP server (Plugins, Custom, Add MCP server), review the exact registration, confirm it, connect it over OAuth and sync its tools. Verified live with `https://mcp.monid.ai/v1`: registered, connected, 18 actions synced, no tool run.
- `backend/src/security/egress/toolTrust.ts` returns `UNTRUSTED_CAPABILITY_METADATA` for every tool's metadata, always.
- `backend/src/security/egress/egressPolicy.ts` line 45: any call with that trust returns `REQUIRE_RESTRICTED_SANDBOX` / `UNTRUSTED_TOOL_REQUIRES_SANDBOX`, after the secret, destination and URL checks and before the approval check.
- `composioClient.ts`: a read of a `custom_` toolkit always throws that denial; a change goes through the same gate and gets the same answer. There is no sandbox that could satisfy `REQUIRE_RESTRICTED_SANDBOX`.
- Result: a custom MCP is registerable and unusable. The browser agent correctly says "no tool offered / restricted" and does nothing.

## 2. Why the rule exists (keep this in mind)

A custom server is third-party code the owner pointed us at. Its tool names, descriptions and schemas are text it controls, so they can lie about what a tool does, change after review, or tell the model what to do. Its results are also text it controls. The rule stops three things: a tool described as "read" that writes or spends; a definition that changes after the owner looked at it; and output that steers the agent.

## 3. Options

| Option | What it is | Verdict |
| --- | --- | --- |
| A. Owner-pinned exact tool | The owner reviews one tool's exact definition and pins it. A pinned tool whose live definition still matches is treated as server-registered for egress purposes, with the same per-call exact approval card as any connected app. | Recommended |
| B. Real restricted sandbox | Build an executor that runs the call in isolation and filters output. | Rejected for now: a new execution plane (INV-02), large, and it still cannot judge what a remote server does. |
| C. Keep as is | Registration only. | Safe, but the feature is a dead end, as seen in the live test. |

## 4. Design for option A

### 4.1 The pin (new durable record)

One row per owner, toolkit and tool: `{ userId, toolkit, toolSlug, serverUrl, authMode, definitionDigest, riskClass, maxCallsPerRun, pinnedAt, pinnedBy, revokedAt }`.

- `definitionDigest` is a SHA-256 over the canonical JSON of the tool's name, description, input schema and the server URL and auth mode, as last synced. It is computed by the server, never taken from the client.
- `riskClass` is chosen by the owner on the review page from `read` or `write`. Default `write` (the stricter path: exact approval, no silent read). `destructive` and `financial` are not selectable: those tools can be pinned only as "not runnable".
- Created only through the existing confirmed-action path (`prepareComposioControl` then the review page then Confirm), as a new control operation `PIN_CUSTOM_MCP_TOOL`. It uses the same authority scope, nonce, 15 minute expiry and receipt as `CREATE_CUSTOM_MCP`. It carries no spend authority.
- Tenant: the row key and the toolkit prefix `custom_xroga_<userToken>_` are derived from the verified server identity (INV-05). A pin for another user's toolkit cannot be created or read.

### 4.2 Execution path

1. Discovery (`plugin_search`, `plugin_action_search`) offers a custom tool only if a non-revoked pin exists for it. Unpinned custom tools stay invisible to the agent, as now.
2. At call time the server re-reads the tool's live definition, recomputes `definitionDigest` and compares it with the pin. Any difference, or a revoked pin, denies the call with `CUSTOM_MCP_DEFINITION_CHANGED` and tells the owner to review again. A re-sync that changes a definition revokes its pin immediately.
3. `toolMetadataTrust` stays "untrusted" for metadata. What changes is the egress input: a pinned and matching tool is passed as `toolTrust: 'SERVER_REGISTERED'` together with a new field `pin: { digest, riskClass }`. `egressPolicy` accepts the field only when the server itself attached it from a verified pin row; a caller-supplied value is ignored. Everything else in the gate stays in front of it: secret scan, destination and nested URL checks, data classification, exact authority permit.
4. Every call, read or write, creates the existing exact approval card (arguments shown, server and account named, "may contact a third-party server"). No "always allow" in this phase.
5. The call goes through the existing `composioRequest`, so credentials stay on the server (INV-08).
6. Output is wrapped exactly like other connected-app output (`connected app result` boundary), capped at 12,000 characters, and labelled "from a custom MCP server, untrusted text". It can never add tools, change the pin, grant approval, or be followed as an instruction. The extension's existing rule that tool results are data stays in force.

### 4.3 Cost (INV-07)

A custom server's price is unknown to us. Rules:

- No pin may carry spend authority. If a call would charge (the server says so, or the account has a balance and the tool is marked paid in its own metadata), the card must say "this may cost money and Xroga cannot cap it", and the owner approves that exact call. Phase 1 refuses tools whose metadata says paid unless the owner opted in on the pin with a per-call ceiling the owner types in USD, shown on the card and checked against the server's own price field when present. Without a price field, paid tools stay not runnable.
- `maxCallsPerRun` (default 5) bounds how many calls one run can make through custom tools.

### 4.4 Browser agent changes (extension)

Small and mechanical: pinned tools arrive through the same `plugin_search` result and the same alias path (`appToolAlias`), the same 32-tool cap, the same approval card. The extension needs no new tool and no new permission. Its message for a refused call must name the reason (not pinned, definition changed, revoked, paid tool).

### 4.5 UI (frontend)

Custom MCP list gains, per synced tool: definition (name, description, schema as received), its risk class selector (read, write), a "Pin" button that opens the standard review page, and "Revoke". A changed definition shows "Definition changed since you pinned it".

### 4.6 Kill switch and rollout

- Env flag `XROGA_CUSTOM_MCP_EXECUTION=on`, default off. Off keeps today's behaviour exactly.
- Stage 1: staging only, one allowlisted owner, read-class pins only, in the Monid account with a $0 balance, using a free endpoint.
- Stage 2: write-class pins, after the review signs off.
- Rollback: turn the flag off (calls denied again) and revoke pins. No schema change needs reverting: the pin table is additive and unused when the flag is off.

## 5. What must be tested before merge

Unit and integration (backend): a pin cannot be created for another tenant; a changed definition denies; a revoked pin denies; a client-supplied `pin` or `toolTrust` is ignored; `destructive` cannot be selected; a secret in arguments is still denied; an unsafe URL argument is still denied; a paid tool without a ceiling is denied; `maxCallsPerRun` is enforced; flag off equals today's behaviour (golden test of the current denial).
Extension: a pinned tool is offered under a valid alias; an unpinned one is never offered; the denial reasons reach the agent in plain words.
Live, in order: pin a free read tool on Monid (balance $0), run it through the extension with a human Allow, check the receipt; edit nothing on the server but re-sync after a change and confirm the pin is revoked; deny the card and confirm nothing was sent; try a prompt-injection string in a result and confirm the agent does not act on it.
Mission manifest: `docs/xroga/missions/` entry declaring auth, tenant, approval, credential, egress, cost and schema impact (a new additive table).

## 6. Open questions for the reviewer and the owner

1. Is a SHA-256 over name, description, schema, URL and auth mode the right definition of "same tool", or must the server's own version or ETag also be bound?
2. Should `read` pins exist at all in phase 1, or only `write` (always exact approval)? Reads of private data to an unknown server are still data egress.
3. Which authority signs a pin: the owner role alone, or owner plus AAL2 as the founder-preview rule requires?
4. A per-call USD ceiling typed by the owner is only as good as the server's own price field. Is "paid tools are not runnable" the safer phase-1 rule?
5. Who owns revocation if the registered server's domain changes hands later? (Pin includes the exact URL, so a different URL is a different pin.)

## 7. Not in scope

A general sandbox executor, "always allow" approvals, auto-pinning, destructive or financial custom tools, running a custom tool from any path other than the browser agent's plugin route, and any change to the Composio egress review itself.
