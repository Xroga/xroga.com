# Preparatory egress policy

This is isolated Command 010 preparatory engineering, not Phase 4 admission,
Phase 3 KMS acceptance, production deployment or release authorization.
The original contract and frozen worklist remain unchanged.

## Canonical integration

`backend/src/security/egress/egressPolicy.ts` accepts an issued TenantContext,
the existing exact AuthorityDispatchBinding and AuthorityPermit, an actual
dispatch payload, destination, recipient and purpose. These are server adapter
inputs, never authority inferred from a model, tool annotation or request JSON.
The payload digest must match the approved target digest. Existing authority
enforcement still consumes and revalidates the permit after evidence storage.

The deterministic classifier recognizes all six frozen data classes. Its
credential field/value/query patterns are a conservative floor, not universal
DLP. Missing classification defaults to USER_PRIVATE. Detected secrets always
raise classification to CREDENTIAL_SECRET and are denied. Adapter credentials
are attached only inside existing provider transports and never become policy
payloads. Size, depth and node-count limits fail closed.

ALLOW is not an execution permit. Non-public reads and every consequential
action still require existing authority. Missing exact authority yields
REQUIRE_APPROVAL. Untrusted tool metadata yields REQUIRE_RESTRICTED_SANDBOX.
REQUIRE_REDACTION is reserved in the decision type, not an implemented redaction
pipeline. No automatic approval, sandbox or redaction fallback is introduced.

## URL boundary

The existing `boundedPublicGet.ts` is the single implementation re-exported by
backend and frontend adapters. It denies unsafe schemes, credentials, non-443
ports, local/private/link-local/metadata/special addresses, ambiguous IPv4 forms,
mixed public/private DNS answers and malformed input. Each redirect is separately
admitted. The connection uses a copied pinned DNS address, original TLS hostname
verification and no shared connection pool. GET has one bounded overall deadline,
redirect count and streamed byte limit. Compressed responses are denied.

The new credential-free POST shares admission and pinning. It is single-attempt,
does not follow redirects, caps uploads at 128,000 bytes and receipts at 8,192
bytes, and awaits live ownership/authority verification after DNS admission.
It returns only status and response digest. An uncertain result must not trigger
blind retry. Existing provider-authenticated transports are not replaced by this
credential-free helper.

The Composio action boundary gates the actual approved payload after live account
readback and before the existing permit consumption and provider dispatch.
`businessAction.ts` reaches this shared adapter. Metadata from custom MCP tools
does not become a server-reviewed tool. Public URL literals inside arguments are
syntactically checked, but the remote provider's DNS resolution is not controlled
by this transport. Such remote execution remains a review obligation.

`executeOwnedFileEgress` reuses actual ownedFile/readPrivateFile checks, verifies
the exact project/file/recipient/content digest and rechecks the row immediately
before permit consumption and sending. It supports inspected UTF-8 text/JSON
only. Binary/archive documents fail closed until a format inspector is verified.
This adapter is not yet a replacement for every existing upload caller.

Server-owned internal dependencies remain separate. The ComfyUI dependency uses
the configured environment origin, not a URL supplied by prompt content.
Its local fixture test is not certification of every internal dependency.

## Durable decisions

`securityDecision.ts` reuses the existing server-only immutable
`production_audit_log`, with issued receipt identity, actor ownership and exact
returned persistence fields checked. Only fixed reason codes, policy version,
classification, hashes and correlation/evidence IDs are stored. Raw payloads,
credentials, URLs and provider bodies are excluded. Storage error or a two-second
deadline stops effects. No new schema or competing event store is added.

Supabase HTTP-fixture tests exercise the actual client and receipt DTO. They do
not prove a live database transaction or deployment. Real disposable database
verification and current-source tenant/provenance reconciliation remain pending.

## Inventory and rollout limits

`scripts/security/audit-egress-callers.mjs` produces AST candidates, including
HTTP clients, provider SDKs, browser/MCP transports and subprocess sinks. Generated
strings and server response sends are excluded. Candidate inclusion is not a
claim of reachability or a demonstrated vulnerability. SDK internals, reflection
and deployed generated code need semantic tracing. A fixed host is not proof of
ownership or safe data use.

Reviewed URL boundaries are narrowly labelled. They are not full tenant/action
certificates. `unresolvedHighRiskBypasses` is the conservative count of unresolved
dynamic/SDK candidates, not the number of confirmed exploits. The strict
`--require-complete` invocation must fail while any obligation is unexplained.

Rollback is to abandon this review branch or revert its focused commits before
deployment. No schema, credential, provider, DNS or live-data rollback is needed
because none was changed. No production enablement is authorized by this work.
