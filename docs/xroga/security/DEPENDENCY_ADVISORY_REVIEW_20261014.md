# Credential-free advisory checkpoint — release remains blocked

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
