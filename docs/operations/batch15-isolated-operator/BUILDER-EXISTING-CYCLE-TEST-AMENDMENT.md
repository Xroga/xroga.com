# Single Builder test using the existing account ceiling

Status: proposed, not approved or executed. Replaces only the $0.10 model-test ceiling if explicitly approved.

The existing production test account has a free billing cycle with an entitlement of 1,650,000 micro-USD ($1.65), expiring November 23, 2026. A read-only check on October 31 confirmed that its remaining allowance exceeds $0.10. No entitlement, reservation, reconciliation hold or customer record was changed. Account figures other than the ceiling are intentionally omitted here.

The existing per-action reservation RPC is restricted to `run_model_benchmark`, requires current Operations authority and a separate approver. It cannot legitimately be substituted into a Builder request. A new run-budget implementation is unnecessary for this one test if the owner accepts the existing stricter account-wide lifetime ceiling instead.

## Exact requested change

Authorize one synthetic Builder generation-and-save attempt with a maximum of $1.65 model usage from the existing balance, no top-up. This is a conservative ceiling, not expected cost. Existing settled charges and held reservations reduce available capacity further. Existing owner-cycle reservation and settlement controls remain mandatory. This does not increase the account entitlement or change pacing.

- Existing production API `https://api.xroga.com`, source `ac8168f940d6e56079bbeb5e717ef33001b8b171`, matched canonical Job `xroga-canonical-production`.
- Existing signed-in production test account and one owner-scoped synthetic Builder project, never another customer's project.
- Prompt requests a small static page with a heading and a working local counter, no external integrations, deployment, network fetching or secret access.
- Use the existing authenticated Builder and canonical execution routes, not a direct provider request or benchmark masquerading as Builder.
- Before dispatch, recheck the active cycle is unchanged, entitlement is at most $1.65, its expiry is beyond the entire bounded session, and the runtime still uses the reviewed owner ledger. If those checks fail, do not dispatch.
- One submission only, observe for at most 20 minutes and request cancellation on timeout through the existing owner-scoped route. No second submission or manual model retry. Missing usage stops acceptance and preserves the uncertain hold.
- Verify stored source and hash, terminal status, reservation/usage evidence and cancellation state. Generated files without valid accounting are not a PASS. Preserve the synthetic project as labelled evidence unless its exact cleanup is subsequently approved.
- No production SQL, IAM, new resource, funding purchase, frontend promotion, microphone change or broad feature activation. Existing approved private-worker and cloud-usage ceilings remain unchanged.

If declined, retain the $0.10 limit and keep the model test blocked. Do not silently spend above it or repurpose benchmark authority.
