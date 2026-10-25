# Credential-free advisory checkpoint — release remains blocked

## Current authoritative checkpoint, 2026-10-15

The fresh `dependency-advisories.json` observation at 15:20:18 UTC supersedes all historical totals and rejected candidate instructions below. Workspace aggregate: 47 findings, including 24 high and zero critical. Frontend standalone: 14 findings, including 9 high and zero critical. Backend standalone: 37 findings, including 17 high and zero critical. These overlapping graphs must not be summed. All three audit commands still exit 1. No remaining advisory is waived.

Current source uses simple-git 4.0.2 and parser 2.0.1 with the reviewed exact-hash Cline compatibility installer, not the historical Git3 candidate below. The pinned backend build passes that compatibility check. Agent V2 dependency-lock run 38756490791 failed on attempt 1 with registry ECONNRESET fetching playwright-core, then passed attempt 2 on unchanged source and locks. Later source ee980820660baf411ac7ed6bd73bdf3877c188ab passed dependency-lock run 38759745945. Network retry success does not resolve the outstanding high findings.

Registry inspection found no newer compatible patch for installed node-forge 1.4.0 or braces 3.0.3. The image-size 1.x line ends at 1.2.1. Dify 1.1.1 is already installed, and provider-utils 3.0.41 still declares undici ^5.29.0. Major substitutions require actual consumer/API regression evidence. These facts do not establish that every remaining finding has no fix, and remaining reachability/remediation investigation is engineering work, not a founder-access blocker.

## Historical evidence retained below

The following sections describe earlier candidates and must not be read as current install instructions or current audit totals.

## Latest continuation: actual Cline boundary and rejected incompatible fix

Current exact graphs and every high/critical finding are retained in `dependency-advisories.json`: workspace aggregate 52 (critical1/high30), frontend standalone18 (critical0/high13), backend standalone40 (critical1/high21). All three audit commands return exit1; no exclusions or false passing audit. Paths/versions, advisory URLs, propagated package effects and suggested fixes are recorded, not just totals. Some suggested fixes are incompatible majors/downgrades and are not automatically applied.

Runtime path: `backend/src/ai/softwareAgent/AgentSoftwareExecutor.ts` uses the existing `@cline/sdk@0.0.82` Agent. Core 0.0.82 resolves Git3.36.0, originally parser1.1.1. Published core0.0.93 still pins Git3.36.0. Inspecting all shipped core JavaScript entrypoints found Git imports in index/hub/daemon; the inspected workspace metadata functions call checkIsRepo/getRemotes/revparse/branch, not untrusted inline config or editor mutation. This bounds that inspected path, not every model/tool/environment pathway or arbitrary subprocess execution.

Candidate Git4.0.1/parser2.0.1 cleared critical audit entries but the REAL unchanged SDK import FAILED because v4 removes the default export. Candidate rejected, not shipped or hidden by tests. Keep Git3.36.0; the narrow parser2.0.1 MIT override passes eight actual dependency-resolution, SDK metadata and unsafe-editor/trailer/include denials. Initially three tests expected a v4 Error.name; corrected to assert the actual exported v3 GitPluginError and rejection reason, without weakening the unsafe-action checks. Backend typecheck and all manifest/lock checks pass after the single frozen install.

[GHSA-v5rq-49vh-5v5c](https://github.com/advisories/GHSA-v5rq-49vh-5v5c) parser critical is patched. [GHSA-x6jw-m9v5-85vh](https://github.com/advisories/GHSA-x6jw-m9v5-85vh) Git critical remains reported against installed3.36.0; actual delegated trailer guard is mitigated but the advisory is NOT waived or relabeled fully resolved. Upstream-compatible patched Git/Cline combination or separately reviewed backport remains necessary for full remediation. No forked chat/execution runtime or installed-package tampering. Full integrated regression and isolated CI still required.

Other high groups: Cline LLM → SAP AI/cloud SDK → node-forge/jks-js; Cline MCP SDK; undici/busboy; frontend export → pptxgenjs/image-size; Tailwind/ESLint/nodemon → chokidar/braces/micromatch/fast-glob; brace-expansion/js-yaml/source-map-js/nanoid. Their exact paths and primary advisories are in the JSON. No claim that all are runtime-exploitable or dev-only; remaining semantic exposure/remediation review is internal work, not an owner-credential request.

Actual `npm audit --json --prefix <scope> --workspaces=false` registry checks, no `audit fix --force`, no major framework migration. Initial scope counts: root-only 2 critical; frontend 21 (1 low, 4 moderate, 15 high, 1 critical); backend 44 (5 low, 15 moderate, 21 high, 3 critical). These are vulnerability/package counts, not distinct CVEs or proof of exploitation; root-only excludes workspace advisories and must not be summed with aggregate workspace results.

## Compatible changes prepared and locked

| Package | Old -> new | License (registry metadata) | Reason |
| --- | --- | --- | --- |
| Next + eslint-config-next | 15.5.21 -> 15.5.27 | MIT | Existing Next 15/React 18-compatible patch line; image/Windows RCE and subsequent SSG/ISR fixes, no Next 16 migration |
| sharp (direct/overrides) | 0.35.3 -> 0.35.5 | Apache-2.0 | Native image decoder/librsvg patches; Node >=20.9, canonical 22.21.1 preserved |
| Express | 4.22.2 -> 4.22.3 | MIT | Compatible 4.x parsing patch; no Express 5 migration |
| Morgan | 1.10.0 -> 1.12.1 | MIT | Log-injection patches; new canonical access format also omits query tokens |
| concurrently | 10.0.4 -> 10.0.6 | MIT | Shell-quote transitive patch in existing developer tooling |
| proxy-addr | existing 2.0.7 -> 2.0.8 in locks | MIT | Targeted within-range transitive update; no production proxy-trust configuration change |

Primary evidence: [Next AVIF advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [sharp librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). Registry manifests confirm Next's React 18 peers and all selected runtime engine compatibility. No new runtime dependency family, code kit, policy engine or paid provider.

Pinned npm 10.9.4 regenerated all three lockfiles and the workspace records. The manifest/lock gate passed. An initial system npm 11.16.0 lock generation was stopped and superseded; that output is not accepted toolchain evidence. Frozen installation revealed the existing PostCSS installer assumed unhoisted frontend packages. It now verifies the actual workspace AND Next resolver graphs against the exact approved 8.5.24 pin, failing closed without deleting/copying installed packages. The dedicated resolver unit test passes; CI must establish both standalone and workspace installations/builds.

## Actual remaining audit results after updates

| Scope | Exit | Low | Moderate | High | Critical | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Root-only | 0 | 0 | 0 | 0 | 0 | 0 |
| Frontend standalone | 1 | 1 | 4 | 13 | 0 | 18 |
| Backend standalone | 1 | 5 | 13 | 21 | 2 | 41 |
| Workspace aggregate lock generation audit | reported advisories | 6 | 15 | 30 | 2 | 53 |

Backend critical package entries remain `simple-git` and `@simple-git/argv-parser` in the Cline dependency chain. A targeted within-range parser update did NOT clear the incompatible major-range finding. Do not claim it patched or override a worker SDK's major dependency without caller/engine/regression review. See [unsafe trailer configuration](https://github.com/advisories/GHSA-x6jw-m9v5-85vh), [editor detection](https://github.com/advisories/GHSA-v5rq-49vh-5v5c), [Git include configuration](https://github.com/advisories/GHSA-g4wm-2vf7-vfgr), [long-option guard bypass](https://github.com/advisories/GHSA-858h-whjf-mvg5). No exploit, untrusted repository import or real provider execution was run.

Remaining high/moderate dependency paths include Cline/its transitive tools, build/lint/file-generation packages and server middleware. Their runtime reachability, untrusted-input admission, safe compatible resolutions and upstream constraints require explicit review. Audit recommendations that downgrade document engines or introduce Tailwind 4/Next 16 are NOT automatically accepted. Zero frontend critical findings does not mean zero vulnerability or a passing release gate. All mandatory advisory/tenant/staging gates remain NO-GO; no risk waiver or production release occurred.
