# Answer-coverage release checkpoint

Status: BLOCKED ON OWNER REAUTHENTICATION. This is preparation evidence, not new-chat or full product acceptance.

The founder approved the exact be19ed6d package and bounded acceptance in reply to request `call_62fd21de935045aa8443825db4ef1db6`. The production SQL, spending and stop conditions remain unchanged.

## Verified sources and release preparation

- Backend 4c6319e2fc319ad0384ff3e77c07bc473a3652b2: all seven required exact-source gates passed.
- Frontend 3fce045c4ddbda805672dcf6cb3d06fade3d9924: all nine required exact-source gates passed.
- One Google build, dc39285d-eb22-48cc-ac28-7d70eba916bc, succeeded. Runtime was 195.89 seconds. Immutable provenance, source label, baked source and linux/amd64 platform were verified.
- Image digest: sha256:d6b41af5f1ea5c83d0d021d7f9e49d2dd3565bffb3f018385bcdbd60b03426fd. Compressed size: 154,715,590 bytes.
- Candidate xroga-api-response-4c6319-check-1103 is ready at zero default traffic, zero minimum instances and maximum one instance. Its startup reconciliation guard is enabled. Worker image matches the candidate.
- One private `/ready` request returned HTTP 200 with logged latency 0.634553838 seconds. Its exact Cloud Tasks probe was removed. This does not establish response quality or clear the previously recorded storage-housekeeping warning.
- Recovery Job export is retained locally as response-cd5541-job-recovery.json. No literal service environment or credentials were exported.
- Required local logs and job metadata were copied and hash-verified before owned inactive build inputs were removed. About 17 MB was recovered. Source and recovery assets were retained.

## Production and budget

Production remains backend cd5541c6c887a11ba68aaf3cccfb78609f906167, revision xroga-api-response-cd5541-serving-1102, with the matching canonical Job image and RUNNING queue. Frontend remains d86c8c44fae0777fb1e2a503bb316f7f314b196a, deployment G7cvCHDqZJPZm9B4kYMB1LpRMAWe. Both microphone tags remain unchanged. No fence SQL or maintenance window has started.

No new model/search request was submitted. Original combined allowance remains 492,420 micro-USD conservatively available, including the retained historical 1,385 micro-USD GLM hold. Future GLM remains unauthorized. Build and candidate usage are within the approved $0.50 Google ceiling. Final billed cost has not been independently returned by billing, so it is not reported as zero. Image retention remains within the approved $0.10/month ceiling. No new service, VM, IAM binding, credential, DNS or schema was created.

## Exact resume point

Vercel deployment EUEYhB99T8YfxKfgVJGaytmBcPiC identifies exact frontend 3fce045c. Its automatic build was canceled by the existing project ignore step. An approved Preview redeploy was selected with cache enabled and the ignore step unchecked. Vercel requires an owner email code before it can submit the rebuild. The open dialog has no entered code. This is account reauthentication, not another release-scope approval.

After the owner completes Vercel verification, inspect the actual submission outcome before clicking Redeploy again. Verify the resulting Preview's exact source and authenticated visual behavior. Re-read live API/Job/fence state immediately before starting the approved 60-minute maintenance window. Apply the four already-reviewed singleton-fence operations only in their guarded forward/recovery order. Do not reopen admission for a mismatched pair.

Then use the already-built digest, preserve cd5541 and d86 rollback, and perform the single specifically approved corrected SaaS submission in a new authenticated chat after checking the actual empty-history input and current accounting. Stop on a failed or partial answer, missing accounting, unbounded spend or provider failure. Only if it passes may the three distinct remaining prompts proceed within the declining original allowance. Do not rerun passing CI or rebuild the unchanged image.

PRs #909 and #914 remain draft. Newly generated answer coverage, real new-source Copy/Share/reopening, responsive behavior and ordinary-user production visibility remain unverified for these sources.
