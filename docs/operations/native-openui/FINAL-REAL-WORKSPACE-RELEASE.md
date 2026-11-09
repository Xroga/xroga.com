# Hosted Workspace release handoff

PR [#951](https://github.com/Xroga/xroga.com/pull/951) starts from `6979ac85a48e7a4f53c343ba7e5b9cead6044289` on main `e4f02ac610c7719ec19ae4bbf28a835ca16eb9f2`. The starting source passed all ten workflows. [Ordinary authenticated browser evidence](https://github.com/Xroga/xroga.com/actions/runs/42667950094) covers controlled responses on desktop and mobile with real isolated Supabase accounts. It includes Copy, private Share, Reopen, attachment handoff, citations, calculator controls, Stop and two-account isolation.

## Resource bindings

| Resource | Reviewed binding | Readiness |
| --- | --- | --- |
| GCP | `project-c40d4821-e647-4fa2-92d` / `us-east4` | Existing |
| Private staging API | `xroga-api-universal-staging`; existing staging runtime identity | Existing. Default traffic is 100% to `xroga-api-universal-staging-00001-tdc`. |
| Private Workspace frontend | `xroga-workspace-openui-staging`; dedicated matching service account | Proposed. No service, identity or grant has been created. |
| Frontend URL | `https://xroga-workspace-openui-staging-574998934848.us-east4.run.app` through the authorized operator proxy at `http://localhost:3217/workspace` | Proposed. Next.js runs on Cloud Run. The local proxy authenticates the connection to the hosted service. |
| Auth, data and ledger | `dqxnatoessviphudbhei`; issuer `https://dqxnatoessviphudbhei.supabase.co/auth/v1` | Existing isolated realm. Browser gets the publishable key for this realm only. |
| Provider | Existing Zurelay secret `xroga_models_zurelay:1`; `deepseek-v4.1-flash-1017` | Prior timed access ended. Reuse only from the staging API in the authorized paid phase. |
| Production rollback | Frontend `23a1a48a2ee0018ed0c828f6347df9d0bef9c369`; API/Job `92ec31a3369a0d8ca42d23d62f79d8f522b5fb9e`; API revision `xroga-api-chrome-pair-92ec31-serving-1108` | Historical readback. Recheck both images, traffic and release identity at cutover. |

The protected frontend has only an API invoker grant. It forwards the original user JWT separately from the Google identity token, checks the API release before forwarding, and refuses redirects, foreign origins, unapproved paths, missing or expired tokens, and production issuer tokens. Xroga's API verifies the signature and owns user, tenant and storage decisions. The frontend identity has no access to provider credentials or the Supabase service role. Browser CSP permits the same-origin bridge and isolated Supabase Auth connections. The version 2 manifest pins source, API image digest, ingress and storage/ledger realm. The existing Fly/Vercel validation path remains available. [Google service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)

## Exact staging sequence

1. Confirm the exact PR head, green source and integration checks, API rollback revision and sanitized effective IAM. Verify neither public IAM principal has invoker access. Use the existing Artifact Registry and Cloud Build bucket. Record the checked-out archive hash, provider secret version metadata, API source and original service/Job state.
2. Submit one archive-only build with `infra/google/cloudbuild.workspace-staging.yaml`. It produces two images and the validated manifest from the API push digest. Confirm Cloud Build source provenance, both resulting immutable digests, both revision labels, and manifest source before deploying anything.
3. Create one staging frontend service account with no project-level roles. Bind API invoker on the isolated API only, with a time limit. Deploy one private staging frontend with one max instance, zero minimum instances, request billing, no startup boost, and no public access. The test operator gets frontend invoker only. Use the existing API runtime identity for the API candidate. Preserve other tags and keep the baseline at 100%. Deploy an exact-source tagged API candidate with the provider secret absent, native generation enabled and founder evaluator unset. Inspect the staging credential bootstrap and deny all unrelated provider connections, webhooks, payments and schedulers. Read back both images, service identities, tenant realm and API readiness.
4. Use the protected operator proxy and ordinary Auth sessions. Verify direct unauthenticated IAM denial, front and API release markers, no prod origin requests, auth redirects and CSP, private Share/attachment owner and second-account denial, signed-in browser session check, cancel behavior and canonical ledger visibility. Use synthetic data and zero model calls. Verify extension allowlists before testing an actual extension pairing against the staging origin. This gate cannot pass by testing only the session endpoint.
5. Verify one isolated test account has a canonical active non-paid cycle with a combined residual spend ceiling of 10,000 micro-USD or less. Preserve an exact rollback snapshot for any scoped staging cap adjustment. Confirm the eligible planner and answer can use only the authorized model, with no retrieval and no automatic repair or retry. Stop if the six-dispatch limit cannot be enforced. Then bind the existing Zurelay secret by reference on the exact API image in a new private zero-traffic revision. Move only the acceptance tag from the zero-inference candidate. Revalidate readiness and source. The frontend identity never receives provider access.
6. Run three serial regular-composer turns: Supabase architecture, Jan–Jun revenue, and one synthetic attachment-backed response. Stop at the first material failure or unexpected charge. Record sanitized raw answer/program, desktop and mobile screenshot pair, per-dispatch provider receipt, canonical reservation and ledger delta, latency, and output publication time. No retry, extra lookup or second formatting request.
7. Remove the temporary tag, timed API invoker and secret bindings, and temporary frontend/test identity as allowed by the approved scope. Confirm the previous default revision, all original tags and the production API/Job/Workspace sources. Preserve sanitized receipts and immutable recovery artifacts within the authorized retention window.

## Cost and acceptance

| Gate | Status |
| --- | --- |
| Starting source CI and signed-in controlled-response testing | PASS on `6979ac85` |
| Hosted topology and transport focused tests | See current-source verification below |
| Matched hosted account, private files/shares, browser extension, ledger and rollback | NOT RUN |
| Prior founder evaluator | Four genuine settled requests, $0.000639 total. Two cases required factual corrections. No remaining slots. |
| Regular Workspace live DeepSeek acceptance and new receipts | NOT RUN |
| Production canary and promotion | NOT RUN |

The proposed paid window is one Cloud Build with a 20-minute timeout, one temporary private frontend and no more than two private zero-traffic API revisions using the same image. At the listed $0.006/minute build rate the build ceiling is $0.12. With one 1 vCPU / 1 GiB instance per active service and a 15-minute hosted test window, the two services would consume approximately $0.048 in compute at the listed request-based rate before registry, logging and network usage. Proceed only after the remaining overhead and cleanup fit the proposed $0.20 combined infrastructure ceiling. The separate model cap is $0.01 with at most six total authorized model dispatches. These are proposed ceilings. Live spending and deployment are still pending. [Cloud Build pricing](https://cloud.google.com/build/pricing) · [Cloud Run pricing](https://cloud.google.com/run/pricing)

The [capability inventory](coverage.json) records the integrated OpenUI renderer, Open Intelligent UI visuals and compatible CopilotKit interaction patterns. Arbitrary model-controlled network, HTML, maps or media without approved sources remain out of scope. The prior acceptance materials and [rollout plan](WORKSPACE_ACCEPTANCE.md) retain the screenshots and receipts separately from genuine hosted results. Production needs its own source-paired release approval after live staging acceptance. Rollback disables `XROGA_NATIVE_OPENUI_WORKSPACE` and restores the verified frontend/API/Job artifacts while retaining historical decoding.

## Current verification

The staged implementation is introduced in `6e3da0149b902292fd5a8da86aa16cf5f0512c46`. The PR head including this report is the source to use for both images after the exact-head checks complete. The report-only commit keeps the existing Vercel Preview skip logic applicable to this push.

- Fifteen focused topology, transport and existing isolation tests passed locally, as did frontend TypeScript, runtime inventory, egress inventory and mission policy. The tenant inventory integrity check still reports its independently tracked evidence gaps. The GitHub frontend workflow includes a staging Docker build and a credential-free request check for the release marker, CSP and 401 denial.
- On the preceding candidate, the authenticated security harness lacked the staging bridge module and the local API port test expected an inline Share URL. The corrected harness loads the real bridge. The URL test checks the same API base, encoded Share path and guarded transport. These are test-only changes. Eleven authenticated route and bridge assertions, the local API port test and 49 baseline negative tests passed locally. The complete integrated baseline and browser checks must pass again on the resulting head.
- The isolated Supabase project reported healthy. A metadata and count-only read found five confirmed staging users, three canonical reservation/settlement/release RPCs restricted to service role, and zero active non-paid cycles capped at $0.01. The staging operator must scope and read back one appropriate test cycle before attaching the provider secret. No rows were changed.
- Cloud Run still reports the known production API revision receiving 100% of traffic. The staging baseline also retains 100% of default traffic. The Zurelay secret version is enabled. Neither service was changed, and no new inference or build has been submitted.
