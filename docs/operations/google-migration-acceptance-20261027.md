# Xroga Google migration acceptance, 2026-10-27

`XROGA_ZERO_FLY_MIGRATION_ACCEPTED`

| Outcome | Result |
| --- | --- |
| Google Cloud production migration | PASS |
| Production infrastructure acceptance | PASS |
| Production cutover | COMPLETE |
| Fly runtime retirement | COMPLETE |
| Remaining active Fly dependencies | NONE VERIFIED |
| Permanent deletion of retained Fly assets/account | PENDING final owner authorization |
| Model-dependent generation | KNOWN LIMITATIONS, tracked separately |

PR856 merged at `3c3bc0f54b9e1f38e67641284de4b16073016fdb`. PR864 merged at `5ada5db7526efb1e0a4e426dbf4feab3d538597f`. The latter's tree `1562214154b7f58c51d8d4bbd188d5d7540e4a31` matches the tested head and integrated candidate. The immutable image was built from `b11841ead316913cb46316fa7c16e76c6519b392`. Subsequent head changes were generated inventory records. These distinct source identities are preserved.

Production serves 100% through `xroga-api-google-b11841ea-r1`, with compatible recovery revision `xroga-api-google-b11841ea-recovery-r1`. Both were actually promoted and passed health/readiness at baked source `b11841ea`. Their digest is `sha256:3374633058c62d7a205f4fe95d28a4b312de1eab21068555fde7c0f73ea9dc43`. Independent forward and recovery names are retained in Google's `cloud-run-source-deploy` repository. The source build and copy-only recovery job succeeded. No unchanged image was rebuilt for final acceptance.

| Former Fly dependency | Current replacement and verification |
| --- | --- |
| API and streaming ingress | Cloud Run `xroga-api`, `us-east4`, native runtime identity, health/readiness 200 after Fly shutdown |
| Production image registry | Google Artifact Registry, immutable forward and independent recovery references |
| Interactive execution and browser hosting | Two bounded private Compute slots in `us-central1-a`, verified base `xroga-exec-base-20261026`, no VM service account |
| Saved runtime ownership | Supabase runtime receipt saved before boot, exact owned cleanup and destroyed tombstone verified |
| Preview | Google HTTPS load balancer, wildcard `preview.xroga.com`, real HTTP 200 and WebSocket echo through private worker port 3000 |
| Background transport | Cloud Tasks and Cloud Run Job `xroga-canonical-production`, original canonical scheduler retained |
| Durable ownership and retries | Real native claims, duplicate denial, durable completion, cancellation and retry denial verified |
| Process-loss recovery | Accepted same-run recovery under a new generation and matching checkpoint hash reused, not rerun |
| Credential custody | Native `xroga-api-runtime`, existing production KMS key, managed wrap/unwrap readiness and startup passed |
| Platform secrets | Protected production bundle version 2, existing Whop secret version 1, no foreign identity configuration admitted |
| Private storage | Approved private R2 bucket, bucket-scoped object credential, approved metadata-read capability, owner hash and cross-project/fabricated-context denials passed |
| Database and schema | Existing Supabase preserved, only restore-validated canonical-delivery expansion applied, service-only RPCs and RLS preserved |
| Frontend origin | Vercel Ready deployment `13C195qgr3vsaYs3GPB52tGnjJP4` at `3c3bc0f5`, API origin `https://api.xroga.com`, normal signed-in project data loaded after Fly retirement |
| DNS and TLS | API and Preview route to Google `8.232.138.199`, active certificate, frontend remains on Vercel |
| Billing callbacks | Existing Whop webhook uses `https://api.xroga.com/api/billing/webhook/whop`, signing secret and events preserved, unsigned denial verified |
| Deployment safeguards | Both Fly GitHub workflows disabled and source-inert, local Fly deploy/auth scripts refuse execution, Google automatic build trigger held |
| Backup and recovery | Protected encrypted Google backup, actual isolated PostgreSQL restore, independent compatible Google recovery image, no Fly required |

Production fixture `xroga-canonical-production-6trfc` passed native KMS, private storage and authority denial, durable claim, saved ownership, actual worker execution, HTTPS and WebSocket checks. Its final operator assertion expected 404 after revocation. The existing gateway correctly returns 410. The fixture exited failed and this result is retained, not relabelled as a passing execution. Cleanup removed its VM, boot disk and synthetic private file.

Narrow continuation `xroga-canonical-production-xzkhx` used the same immutable image and succeeded. It verified the actual revoked Preview returns 410, cancelled the interrupted synthetic run, denied its retry, completed a separate deterministic run through issued native claim authority, verified durable results and submitted bounded Cloud Tasks with duplicate rejection. It allocated no VM and made no model request. Both operator executions restored the canonical Job template exactly.

The queue resumed at 11:44:29 UTC. Both completed/cancelled delivery requests reached `xroga-api-google-b11841ea-r1` at 11:44:39 UTC and returned 204. The queue is running and empty. Existing Scheduler requests also returned 204 on that revision. The successful result remains persisted as complete with `result_success=true`. The interrupted fixture remains cancelled. The delivery table's `running` state is its claimed transport state, not evidence that these terminal runs are executing.

Both Fly machines `7845746ce20008` and `e820730b296098` are stopped, with autostart false and restart policy `no`. `xroga-sandbox` has no machines. The `xroga-fly-production` federation pool and old `xroga-api-kms-20261024` identity are disabled. Native Google identity remains enabled. Google health/readiness and the public frontend remained available afterward. A local browser DNS failure was recovered by clearing the laptop DNS cache, followed by a fresh signed-in browser check. No DNS server or security setting was changed.

Cold assets retained for the founder's final deletion decision are the `xroga-api` app and its two stopped machines, its Fly image and secret metadata, shared IPv4 `66.241.124.19`, IPv6 `2a09:8280:1::135:79a2:0`, and empty `xroga-sandbox` app. There are no Fly volumes in the verified inventory. Account closure and permanent recovery-asset deletion were not performed. Historical Fly adapters and dated audit records remain in Git, with no active production selection or automatic deployment path.

The original required CI remains passing. Final head and integrated full baselines ran under `40492789633`, authenticated browser/database verification under `40492789836`, plus Docker, golden, mission and tenant checks. No passing CI was restarted for these operational receipts. The unchanged native release gate passed against the final actual service readback. That gate's preflight result is combined with live receipts, rather than represented as complete acceptance on its own.

The protected current recovery point is `gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/`. Actual isolated restore verified 158 table fingerprints and 40 credential objects. Restore containers and temporary plaintext handling were cleaned up. Credential revisions, tombstones and required key versions remain preserved. The active recovery image supports managed custody and is independent of Fly.

No model request, cash purchase, top-up, new recurring resource or new IAM grant was made during this final closure. Existing approved infrastructure remains, with an estimated $65-$70 monthly baseline before workers and other usage. The latest saved billing observation at 07:40 UTC showed $298.85 promotional credit, expiry 2027-01-22, $1.74 gross month usage and $0 reported net usage. Later consumption is subject to billing reporting lag. Alerts aren't a hard cap, and the founder's $30 cash allocation remains the spending boundary.

Known limitations remain explicit. GLM balance, OpenRouter empty output and reservation failures were preserved without more model spending. Optional timed private-file links lack `FILE_DELIVERY_SIGNING_KEY` in both preserved configurations and are not claimed verified. Ordinary owner private storage is verified. Model-generated software completion is not inferred from deterministic infrastructure tests. No model/router redesign or Phase4 work was performed.

There is no remaining infrastructure cutover blocker. Permanent deletion of cold Fly assets requires the founder's final authorization. Phase3 acceptance remains preserved, and Batch1.5 work is untouched.

Detailed source identities, test checks, receipt hashes, CI runs and recovery references are in `FINAL-ZERO-FLY-ACCEPTANCE-20261027.json` and the committed `docs/xroga/evidence/zero-fly/FINAL-PRODUCTION-ACCEPTANCE-20261027.json`.
