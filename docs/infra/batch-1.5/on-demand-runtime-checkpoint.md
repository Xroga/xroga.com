# Batch 1.5 on-demand implementation checkpoint

2026-10-31. Issue 898, PR904 comments 6546592982 and 6546660699.
Branch: `codex/b15-on-demand-runner-20261031`. Base main: `3abc33a0cc108ace6efa0ab282137e10081513cf`.

Status: implementation in progress, NOT ACTIVATED. No new cloud resources,
model calls, production configuration or release performed. No always-on VM.

## Source changes

- Signed, expiring, tenant/run/task/attempt/fence-bound model-free Job entrypoint
  around the existing `runJob.mjs`, without nested Docker. Startup time consumes
  the grant lifetime. No privileged environment credentials are accepted.
- Bounded child-process output, cancellation, timeout, sanitized errors, private
  result file and owned profile cleanup. Linux process-group cleanup added but
  only Windows child-process behavior has been executed locally.
- `JobBrowserWorker` implements the canonical BrowserWorkerPort. It validates
  lease binding, rejects model/action grants, cleans up even after uncertain
  start, requires exact result fence and resource measurements, and refuses
  success or automatic retry when termination cannot be verified.
- Optional explicit continuation stages use the existing canonical scheduler,
  task dependencies, run store and leases. Each stage opens a fresh session.
  Completed stages are not replayed. A later stage's live lease blocks recovery.
  Status remains running until all stages complete. Cancellation prevents the
  next stage. Attempts retain the ten-minute ceiling, with at most twelve stages
  and a two-hour admission lifetime from the original run creation.
- Stages share origin scope. Per-stage network/storage/navigation budgets are
  divided from the request limits. Only model-free, read-only continuations are
  admitted. No cookie/profile state or fabricated action authority is persisted.

## Executed checks

- 12 signature/process tests pass. Actual Node child processes exercised success,
  crash, cancellation, output overflow, malformed output, UTF-8 split frames,
  failed progress callback and refusal of model requests.
- 18 durable/security/internal-route fixture tests pass, including ordered
  stages, completed-stage recovery, next-stage live lease and cancellation.
- Six Job transport lifecycle fixture tests pass, including uncertain start,
  cleanup failure, wrong fence/usage, tenant mismatch and revoked lease.
- Local receipts are in `.local-task-storage/jobs/7a2a5704-f0ab-4908-b0a7-426b0293ca83`,
  `b12d0bb2-19dd-435d-899e-e4e8faab3f26`, and
  `356d55e4-d783-4c28-879c-645743725e23`.
- Full backend typecheck did not pass. The shared dependency junction lacks
  backend declarations, including lock-pinned `@types/express` 5.0.6. Do not
  classify the resulting cascading diagnostics as passing or suppress them.

## Exact next integration work

1. Implement the provider-specific transport behind JobBrowserWorker: immutable
   job template validation, deterministic launch identity, private grant/result
   handoff, live cancellation and provider-reported resource usage. It is not
   currently selected by productionBrowserRuntime.
2. Prove enforced browser network containment and sandbox compatibility before
   permitting external execution. Google documents sandbox outbound denial and
   metadata isolation, but the sandbox feature is Preview. Its documentation is
   not a runtime acceptance result. Do not set broad egress and call it equivalent.
3. Implement the Cloudflare adapter only for its verified supported security
   scope. The prior Playground screenshot remains a provider probe, not Xroga
   activation. Do not repeat it as an end-to-end test.
4. Add secure, consented session-state continuation separately before claiming
   authenticated multi-stage workflows. Current continuations explicitly start
   fresh and cannot claim Google Ads or other consequential account operations.
5. Finish dependency-correct typecheck and exact-source CI, then the bounded
   founder-only real task with private evidence, cancellation and cleanup.

Production remains unchanged. No run ID, new deployment or measured per-task
cloud cost exists for this implementation. Incremental cloud/model use this
checkpoint is zero. Existing shared infrastructure still has its existing costs.

Rollback requires disabling new staged admissions and draining staged runs
before deploying an older single-task reader. Existing API/Job pairing, Drive,
microphone and recovery assets remain untouched.
