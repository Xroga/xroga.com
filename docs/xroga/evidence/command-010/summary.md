# Command 010 preparatory engineering

Status: PARTIALLY_VERIFIED_PREPARATION_ONLY. Phase 4 is not formally admitted and
Batch 1 is not GO. Phase 3 managed-KMS runtime custody/cutover remains blocked.

Base: fb95f76bafc1b544b6655d435cddede260d9cd99, on a separate review branch.
Observed main: 33b49da563528f110c4a139a90cb257e0bcc26df. Observation alone is not
current-main integration verification. Historical Phase 2/3 evidence and frozen
requirements are unchanged.

## Implementation and integration matrix

| Boundary | Implemented preparation | Remaining obligation |
| --- | --- | --- |
| Arbitrary public HTTP | Shared pinned GET/POST, strict URL/DNS/redirect/deadline/byte policy | Complete semantic caller register, SDK and remote-tool paths |
| Attachments and deployment verification | Actual backend fetch paths moved to bounded transport | Caller-specific integration and browser proof |
| Operations HTTP checks | Bounded transport, original retry/status behavior retained | Full current-source integration |
| Browser/image proxy routes | Actual routes reuse the same server-side policy and existing sandbox headers | Build and real browser regression receipts |
| Business action / Composio | Exact authority, live account, egress decision, durable receipt, consume, dispatch | Remaining consequential adapters and remote URL execution |
| External file transfer | Shared owner/content-bound adapter with immediate ownership recheck | Migrate each existing upload caller, real database concurrency proof |
| Security decisions | Existing immutable audit table, issued safe DTO, persistence readback | Disposable database persistence and provenance validation |
| Untrusted content/tool metadata | Deterministic provenance and approval rejection | Review all actual tool consumers, no universal injection claim |

## Original criterion matrix

Exact original texts are copied from the unchanged frozen worklist into
`manifest.json`. These statuses describe preparatory evidence, not admission.

| Criterion | Preparation status | Evidence and gap |
| --- | --- | --- |
| AC01 | PARTIALLY_VERIFIED | AST inventory and scanner tests, semantic closure incomplete |
| AC02 | PARTIALLY_VERIFIED | Migrated actual public HTTP paths, other candidates pending |
| AC03 | PARTIALLY_VERIFIED | Composio write boundary and owned-file adapter, other effects pending |
| AC04 | VERIFIED_LOCAL | Existing businessAction to Composio path exercised by golden-journey fixtures |
| AC05 | VERIFIED_LOCAL | Fake MCP approval and seven provenance classes cannot mint authority |
| AC06 | VERIFIED_LOCAL | Malicious document/web/tool data denied with zero effects |
| AC07 | VERIFIED_LOCAL | IPv4/IPv6/mapped/encoded/private/metadata URL and controlled DNS tests |
| AC08 | VERIFIED_LOCAL | Redirect/rebinding to private target denied before private connection |
| AC09 | PARTIALLY_VERIFIED | Actual owned-file boundary with controlled DB fixtures, all uploads not migrated |
| AC10 | VERIFIED_LOCAL | Secret field/query/value and synthetic file canaries denied |
| AC11 | PARTIALLY_VERIFIED | Safe DTO and actual Supabase HTTP fixture, real DB durability pending |
| AC12 | NOT_VERIFIED | Strict completeness must reject unresolved candidates |

## Verification discipline

The focused source command uses Node 22.21.1:

```sh
node --import tsx --test backend/src/security/egress/*.test.ts backend/src/security/boundedPublicGet.test.ts backend/src/operations/providerAdapters.test.ts backend/src/e2e/xrogaGoldenJourneys.test.ts scripts/security/audit-egress-callers.test.mjs
node scripts/security/audit-egress-callers.mjs --check
node scripts/security/audit-egress-callers.mjs --require-complete
```

The last command is expected to fail until unresolved obligations are genuinely
closed. It is not an optional release gate. Type checks, frontend regressions,
build/lint outcomes and final source identity are recorded separately in the
manifest after commands finish. No previous Phase 3 CI receipt is relabelled as
verification of this changed source.

The final inventory includes backend, all frontend source and workers: 132
candidates, 9 narrowly verified URL boundaries and 123 unresolved traces, including
69 dynamic/SDK candidates. These counts are obligations, not invented exploits.
The audit checks complete caller-file hashes and exact proof-file hashes, and
sorts paths so staging a new source file cannot silently reorder the register.

Test-harness corrections were bounded. The first direct frontend command omitted
its path-alias configuration. The corrected canonical command passed 1,155 tests.
The first direct backend attempt omitted NODE_ENV=test, so production-vault
refusal correctly stopped test credential operations. Its waiting local test
process was stopped. The canonical clean-environment run is recorded separately.
The managed Vercel fixture now mocks the DNS/socket boundary for preview checks,
while preserving provider and publishing assertions. Two explicitly September 22
growth snapshots freeze their nested Date checks to that same historical date.
Production freshness rules and stale-evidence negative tests are unchanged.

The preserved finite Phase 2 register check passed with 73 packets and 371
historical records. No security certification is inferred from that check. The
existing current-state inventory was mechanically regenerated for the changed
source and validated, without rewriting frozen security evidence. A read-only
merge-tree check against observed main found a WorkspaceLauncher.tsx conflict
outside this egress patch, so main integration is not verified.

Final local results: 52 focused security tests passed without skips. All 1,155
frontend tests passed. Backend collected 3,158 tests: 3,145 passed, zero failed
and 13 were skipped in the clean harness. Skip governance passed. An independent
run of the actual local Chromium driver completed all six tests without skips.
The full-suite skip count remains recorded, not silently counted as execution.
Backend/frontend type checks and backend TypeScript build passed. Frontend
production build passed with warnings, and the final focused route/test lint
passed. Existing capability/Cline/Git/downstream dependency checks passed. No
dependency was added. These results are local, not a current-main CI receipt.

## Finite remaining work

1. Resolve the recorded caller obligations by shared boundary, with actual caller
   identity, data sensitivity, ownership, purpose, destination and tests.
2. Wire all consequential outbound data adapters and external uploads, preserving
   authority/budget/vault interfaces. Do not treat reviewed transport code as
   certification of every caller.
3. Run real disposable database receipt/ownership/concurrency tests and source-bound
   branch/integrated verification. Preserve historical proof and add current deltas.
4. Obtain genuine Phase 3 runtime custody and any applicable separately authorized
   cutover evidence. Available Google/OCI access alone cannot satisfy that gate.
5. Only after admission, evaluate all unchanged Command 010 criteria, including
   strict zero-unexplained-bypass closure. No merge/deployment is authorized here.

No cloud resources, IAM grants, provider effects, production credentials, schema,
DNS or spending were changed. Optional scanners were not used to transmit private
code or execute untrusted MCP commands. Rollback is a branch revert before release.
