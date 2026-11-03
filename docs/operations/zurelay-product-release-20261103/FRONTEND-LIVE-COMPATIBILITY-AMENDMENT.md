# Frontend-only source amendment, pending owner decision

The approved backend remains `76c158aaeecf82f524659454b7b3726b4d255679`, immutable digest `sha256:83291696c4d1e87244965789f0d1707563b40090d7a04cacf87058f658f1a3f8`. Both guarded release and compatible recovery candidates passed private readiness. No maintenance or production SQL has started.

During final preparation, another production release advanced the frontend from `a1be6441` through `c3798a8a` to `8745e3104f9e5f4423f6d80c1cd897ce995103c4`. Promoting the originally approved frontend `2f80a744a406eb2ab7e86538bc382cc3000ef730` would revert that release's password-recovery security fix and updated composer safe-area spacing.

Proposed frontend replacement: `f5f70ae3b47fb583dfdbf08ae0f9831028dc6238`, existing draft PR #916. It preserves exactly five current production files, with no new feature or provider change. The existing token verification now remains required before the password reset form can appear. It preserves the newer composer offset and transcript boundary. Full source comparison is recorded in [the source review](https://github.com/Xroga/xroga.com/blob/f5f70ae3b47fb583dfdbf08ae0f9831028dc6238/docs/operations/zurelay-two-model-20261103/LIVE-RELEASE-DRIFT-REVIEW.json).

Offline verification passed on Node 22.21.1: frontend type checking, 7 focused recovery/composer tests, 6 source-lifetime/proof tests and 109 response/coverage/persistence tests. The unchanged strict egress inventory has 150 reviewed, zero pending and zero unresolved high-risk bypasses. These results are not live product acceptance. Exact-source CI and authenticated Preview verification are mandatory before promotion.

This changes only the frontend source identity and its source-bound promotion gate. It does not change the approved backend, API/Job pair, four SQL files, secrets, IAM, provider key, model restrictions or spending allowance. No additional backend build is needed. The existing single $0.50 Google ceiling, $0.10/month image ceiling, $0.10 combined acceptance ceiling, six chats/eleven requests/one retrieval, conservative historical holds and 60-minute maximum maintenance remain unchanged. It creates no new window and authorizes no retry.

Retain current production frontend `8745e310` as the frontend rollback target. Preserve its deployment and all recovery images. If production advances again, stop and review the exact new delta before promotion. Never overwrite another release blindly.

The existing operator `FRONTEND` constant and owner receipt remain pinned to `2f80a744` until this exact amendment is approved. No approval is inferred from this document, passing tests or the earlier package.
