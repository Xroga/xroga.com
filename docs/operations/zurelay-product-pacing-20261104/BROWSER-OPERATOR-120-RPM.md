# Browser operator pacing and staging

The current database gate waits 21 seconds between requests and allows one in-flight request per credential. The prepared capacity SQL replaces the gate in place and keeps its RPC signatures. Existing credential rows retain their original settings after the SQL is applied. An admitted legacy lease, its expiry, any provider cooldown, and every billing reservation remain valid. The new version caps concurrent requests for the whole key and separately per user.

After verifying the saved limit on the exact Zurelay key, the initial 120 RPM pilot is a 600 ms interval (at most 100 scheduled starts per minute), eight concurrent requests per key, and two per user. This leaves headroom for provider timing and shared traffic. Enabling these values changes production behavior and requires the normal source-pinned release approval.

Use the existing authorized SQL operator to update only the chosen key fingerprint after draining old traffic. Use the fingerprint derived in `backend/src/ai/providerPacing.ts` from the exact credential. Keep both the credential and fingerprint out of logs. This update must match one row. Use the transaction to inspect the affected row count before commit.

```sql
UPDATE public.xroga_model_request_capacity
SET dispatch_interval_ms = 600, max_in_flight = 8, max_per_user = 2
WHERE key_fingerprint = $1;
```

Rollback uses the same bound row and values `21000, 1, 1`. The rollback drains already admitted requests without clearing their leases, cooldowns or reservations. Keep the new functions in place while the lease map drains. The earlier full teardown script is not the rollback for this change.

Before publishing the extension or switching production traffic, pair an exact Preview build with the isolated Xroga API. Verify both entry points, two user accounts, restart recovery, a sourced file task, and provider receipts matched to ledger settlement. Compare queue time, provider latency, successful tool calls, time to verified completion, 429s, and spend by task at controlled concurrency. Measure under sustained real usage before proposing 1,000 RPM. The small direct-provider Chrome probe provides tool and latency evidence; it does not measure the hosted queue or prove ledger settlement.

## Development acceptance

| Check | Observed result | Local runner job |
| --- | --- | --- |
| Real Chrome 156 with Zurelay DeepSeek `deepseek-v4.1-flash-1017` | Side-panel navigation and Workspace-bridge CSV task returned the expected product and price. The first form attempt paused in chat. | `63e53ad5-2256-42b4-bec7-60e60807cae0` |
| Focused form recheck with the real provider | Chrome showed the approval card before any submission. The synthetic form submitted only after Allow, and the agent read the receipt. | `58167968-3178-4a0d-b760-2ca55e580322` |
| Real provider and dynamic catalog, 602-row workbook | The first attempt exhausted the former 16K context. With bounded attachment previews and a 32K context, the agent used `read_attachment`, read the final row, navigated to Orion and verified seven units at $82 for $574. | `89a38a1d-2f57-4036-82e2-6518c5d8b2db`, `4157727d-a0d9-4898-a7cc-d995c48f8ece` |
| Real Chrome with deterministic responses | Both entry points, approval, evidence and cancellation while a model turn was pending. | `5d15619d-02be-4c63-bcba-f39c4cd62557` |
| Disposable PostgreSQL 18 | Legacy pacing, 600 ms spacing, overlapping leases, per-user capacity, replay denial, cooldown and restricted RPC access. | `e952834d-8e4e-423f-88d4-cb348eb81e49` |
| Backend focused tests | 18 passed, including authenticated route enforcement with signed test identities, same-run resume after turn 12, tenant denial, original ledger reservation identity and document extraction. | `60c3d2a4-0fe4-4dae-ab81-ed327c94ef68` |
| Full extension suite | 817 passed and four skipped. | `25c9bc2f-eed4-4156-9b82-73d44df53028` |

The probes recorded 16 provider receipts, including the failed checkpoints. Usage-based cost calculated from those receipts was $0.001575. Sequential request latency was 2.39 to 4.30 seconds, with a median of 3.39 seconds. These receipts come from a bounded direct Zurelay call in the test runner. The Workspace bridge used a fixture and the run did not write the hosted Xroga ledger. It provides no throughput claim for the real key, no verification of a dashboard change to 120 RPM, and no basis for recommending 1,000 RPM.

The repository-wide mission command still fails on the unrelated voice mission base SHA `d7ce7def4ab94a72587907cb4f60690d7f288838`, which is outside this branch's ancestry. Keep the check in place.
