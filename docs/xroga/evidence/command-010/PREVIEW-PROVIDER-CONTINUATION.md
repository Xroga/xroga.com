# Preview provider identity continuation

Baseline 474cb66f2c6a642faa8c8378f178eea44b9b128e. Preparatory security engineering only. No Phase 3 production acceptance, Phase 4 admission, cloud deployment or customer change is implied.

Two new tests failed before correction: a missing providerId and an unknown providerId both returned the same private upstream hostname. Existing owner/project/session/expiry checks did not bind that hostname to a currently configured provider. A syntactically valid app name in persisted state could also select a different app.

The shared preview helper now uses configuredProjectRuntimeProviders, the existing manager's provider composition function. It selects only the session's exact registered provider and delegates address construction to that provider. An optional preview-target interface makes unsupported providers fail closed. The Fly adapter checks its own configured app, exact provider ID, canonical machine label, port and control-plane self-target prohibition. A missing configured token means the provider is absent. No token is returned, copied into a session or sent to a preview.

Both actual HTTP and WebSocket consumers share this helper, as does new preview-grant creation. Existing grants, declared port, owner/project/session, current state, signature, expiry/revocation and stream lifetime assertions remain. No hardcoded success hostname, alternate provider registry or second preview runtime was introduced. Old sessions missing a genuine provider ID now fail closed. Recovery must use the legitimate runtime lifecycle, never infer authority from a saved hostname.

Actual local checks:

- Resolver, pure access and real loopback HTTP/WebSocket suites: 26 passed, zero failed/skipped/cancelled. Missing/unknown provider and another app produce zero HTTP/WS upstream hits. Positive same-provider behavior, bidirectional/binary WS, revoked messages, idle revocation, header separation, redirect refusal and payload bounds remain asserted.
- Preview grant receipt, project runtime, provider restore and provider destruction suites: 31 passed, zero failed/skipped/cancelled.
- All four existing disposable-database preview fixtures now explicitly configure a synthetic provider and persist its genuine provider ID. No assertion was removed. Those changed real-database fixtures still need a new disposable DB execution. Synthetic token configuration does not claim a real Fly call.

The change does not certify cloud machine ownership from live provider attestation, every preview byte/payload policy, all upstream provenance or the other egress callers. The 6 preview transport candidates retain their unresolved whole-caller dispositions until their complete obligations are reviewed. Egress counts remain 134 total, 14 reviewed, 120 pending and 65 high-risk pending.

## CI preflight correction

474cb66f CI stopped before expensive baseline tests because the new planner test was not staged when inventory generation used git ls-files. Stage source before generating the canonical inventory. No scanner exception is needed.

The same CI found a stale native Buffer conversion review after phase1.ts gained the issued-context argument. The toolUiLink enclosing function was proved byte-identical against d68bbd72. Refresh its complete-file hash only, retaining its call ID and accepted historical record. Fly create/writeFiles/readFile conversion functions were likewise proved byte-identical against 474cb66f, with only their shifted source-position IDs refreshed after the added preview method. Those three conversions remain NOT_PERSISTENCE, not certified provider calls.

Original Fly conversion hash 3d00cb93082c119cedc9884f7945b0ce6cc360120432931eb04a1b6f4f421b1e maps to a1fe5bf2ab884ad9c0b1b9784418644af5585cd8012b3e7c623757d6f0692d41. IDs 8c2d8f9c4601ee2f4d97, 74ddacc15175556234db and 96441ee181360879c0db map respectively to 22f13665d50eefc35d52, 7d5759807b07e44830bb and ab91c7c3506f3c3dc16d. phase1 hash 3f6a017db3e3a620f9559ae4f9b0c1c4048f0906e4d4fb632762a0435442ac3d maps to 7ad7b1f7dde453a4065e15ba260998fe5841c6992724d03ee299b71c8380c0f5, same ebede146c851a085d2b8 conversion.

All six mapped budget functions were previously compared unchanged. Their seven current manual review records now carry the reviewed enclosing file's updated hash. All dispositions, current caller IDs and original structured lineages stay unchanged, including every REVIEWED_GAP. No historical receipt, original criterion or accepted source was overwritten. The current empty admission template is projected only after asserting all frozen Phase 1 outputs unchanged. Source regeneration grants no acceptance.

## Runtime inventory correction after 3540d3c2

The actual PR virtual merge 8d1457582e0f3ee03c8fdce94ea3f74b40a67773 passed 3189 backend and 1155 frontend tests, zero failures/skips, plus types, builds and frontend lint. Its first baseline stopped at runtime-config-integrity before later mandatory checks and the repeated run. This is not a complete baseline pass.

Three changed disposable fixtures saved and restored their three synthetic provider environment settings through dynamic process.env[key] loops. The unchanged runtime scanner correctly refused those unresolved expressions. Each fixture now reads and restores the same three explicit variable names, including deleting each initially absent value. No scanner exclusion, approved dynamic binding, provider assertion or DB assertion was added or removed. Eight existing positive and negative runtime configuration tests pass. A fresh current-source disposable execution and complete integration baseline remain required.
