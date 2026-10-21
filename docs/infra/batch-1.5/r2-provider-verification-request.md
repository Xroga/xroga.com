# One consolidated request: real Cloudflare R2 verification

**Everything code-side is done.** `backend/src/storage/r2.provider.integration.test.ts` implements the 12-step matrix against the real endpoint and has **never run**. It needs exactly this, once:

## Founder approval (one decision)
Approve creating **one isolated private R2 bucket for testing** and **one bucket-scoped API token**, after confirming in the Cloudflare dashboard that the account is inside its monthly R2 allowance (the suite writes ≈ 40 MiB and about 60 operations, then deletes it all by exact key).

| Item | Requirement |
|---|---|
| Bucket | name contains `test`, `staging` or `sandbox` (e.g. `xroga-drive-test`); **no** public access, **no** r2.dev subdomain, **no** custom domain |
| CORS (bucket) | allow origin `<the origin you choose>` only; methods `GET, PUT, HEAD`; headers `content-type, x-amz-checksum-sha256`; expose `ETag`; max-age ≤ 3600 |
| Token | R2 *Object Read & Write*, scoped to that bucket only; TTL ≤ 7 days; never the account-wide token |
| Where the secrets go | the sandbox's secure environment — **not chat**: `XROGA_DRIVE_R2_ACCOUNT_ID`, `XROGA_DRIVE_R2_ACCESS_KEY_ID`, `XROGA_DRIVE_R2_SECRET_ACCESS_KEY`, `XROGA_DRIVE_R2_BUCKET`, `XROGA_DRIVE_R2_TEST_ORIGIN`, and `XROGA_DRIVE_R2_TEST_CONFIRM=isolated-private-bucket-zero-incremental-cost` (typing this is your recorded confirmation) |
| Cost | $0 expected; if the account is already over its allowance, stop and tell me |

Then: `npm run test:storage-provider --workspace=backend` — it refuses to start without every variable above and the bucket-name guard, writes a redacted report (`r2-provider-report.json`: statuses, `x-amz-request-id`/`cf-ray`, observed enforcement of signed constraints) and deletes only what it created.

It answers the open questions I could not settle from documentation: does R2 enforce a signed `content-length` / `x-amz-checksum-sha256` on presigned PUTs (docs silent), do presigned `UploadPart` URLs and `ListParts` behave as S3, and does CORS behave as configured. Expected effect on gates: **B and D can move from BLOCKED to PASS**; nothing else needs R2.

Optional read-only inventory (separate, lower priority): a read-only Cloudflare token to list existing buckets, public/CORS state and usage — would turn the `UNKNOWN`s in `data-location-inventory.md` into facts.
