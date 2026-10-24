# Phase 2: what remains (final)

Superseded by `PHASE-2-ACCEPTANCE-REPORT.md`, which holds the full matrix and the evidence register. This page keeps only the blockers.

**Verdict: `BATCH_1_5_PHASE_2_BLOCKED`.** Four prerequisites from the original handoff remain, each with one next action. All independently executable Phase 2 work is done and tested.

| # | Blocker | Closes | Next action | Needs |
|---|---|---|---|---|
| B-1 | no authorized OCI compute host | sandbox, conformance and network isolation on the target host (handoff browser table) | run `OCI-SANDBOX-VERIFICATION.md` on an instance and return the output files | an existing instance, or approval to create an Always Free A1 |
| B-2 | no native ARM64 host | ARM64 proof | the same procedure on ARM64 (`--label ARM64_HOST_TESTED`; an Apple Silicon Mac running Docker natively is enough for the architecture proof) | any native ARM64 Docker host |
| B-3 | Batch 1 `TenantContext` not in `main` (handoff precondition 3) | tenant mapping | founder reviews and merges Codex's stacked PRs in order, then one integration checkpoint | founder |
| B-4 | read-only cloud facts unavailable (handoff precondition 4, checklist A) | UNKNOWN counts | `! flyctl auth login`, then read-only `fly status`, `fly volumes list`, `fly secrets list` (names); plus Redis provider and persistence, Supabase plan and backup setting, Cloudflare read-only access | the login and five one-line answers |

Corrections to the earlier version of this page:
- the "three unverified criteria" list was **not exhaustive**: it omitted handoff preconditions 3 and 4 (B-3 and B-4);
- the container-network and production-proxy part of the egress criterion is **done** (real containers, the production proxy, two weakened controls proven to show a bypass); only the target-host part remains (B-1);
- the question "does acceptance need real managed-KMS evidence?" is answered by the handoff itself: the reuse row says Batch 1's CredentialVault "once accepted", so live custody belongs to the Batch 1 cutover and does not block Phase 2;
- the `E2E_SUPABASE_*` question is answered by evidence: no such secret or variable exists, so `command3-auth-browser.yml` receives nothing on a pull request and cannot reach any database.

Not Phase 2: the Batch 1 production cutover, INFRA-007 and INFRA-008, the pull request and the merge. The earlier nine-point decision list is in `DECISIONS-FOR-FOUNDER.md` for those later stages and blocks nothing here.
