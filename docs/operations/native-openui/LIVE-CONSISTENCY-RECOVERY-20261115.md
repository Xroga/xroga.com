# Live consistency recovery, 2026-11-15

## Release status

Not ready for promotion. Production was unchanged. The hosted run verified the
request/render/persist/ledger path, but content review found five material failures.
Passing browser assertions do not establish factual correctness.

Hosted source: `c57efb2346b17ecc082d95a8c21cc841d3988675`, PR #989.
All 11 workflows passed for that source. Changes described below are subsequent
recovery work and need their own exact-source CI and hosted acceptance.

## Genuine hosted execution

Ten fresh authenticated normal Workspace submissions produced 20 settled provider
receipts, one canonical planning dispatch and one answer dispatch per submission.
There were no formatting-only calls, retries or Search calls.

- Total settled model usage: 2,014 micro-USD, or **$0.002014**.
- Observed infrastructure estimate: **$0.08420071155**. This is not a final invoice.
- Cloud Build: `f80df065-422d-4d3e-8de9-2cd85ffc08ab`.
- Source, API/frontend digests, captured answers, screenshots, receipts and cleanup
  readbacks are in the task evidence directory
  `outputs/xroga-black-hole/workspace-universal-acceptance/candidate-c57efb23-live`.
- All ten automated rendering/persistence checks passed. The first two cases ran
  at five viewport widths in both themes. Remaining cases ran at 390px.
- Provider-disabled checks verified missing/invalid identity denials, owner versus
  outsider file and Share access, saved-answer replay and revocation before inference.
- Temporary services, identities, grants, KMS and disposable build artifacts were
  cleaned up. `operator-result.json` records verified cleanup at 14:26:53 UTC.

## Material content failures

| Case | Finding |
| --- | --- |
| parity/11 | Loan prose gives inconsistent totals. The upstream calculator computes $4,331.67 interest and $24,331.67 repayment. |
| parity/13 | Keyboard example mixes two focus strategies and does not move actual focus. |
| suite/how-to | Stain-removal procedure contradicts its heat precaution. |
| suite/compare | Three seats are priced as two one-seat subscriptions, and subscription stacking is assumed. |
| suite/line | March is called the lowest month even though January is lower. |

Immutable answer-hashed failure reviews have been recorded. The other five
automated successes have not been converted into blanket semantic approval.

## Implemented recovery

The server now reuses the renderer's exact upstream pure-function registry for
initial Metric snapshots through OpenUI's evaluator. The generated module is
checked against the frontend source by the existing registry-generation check.
There is no new model or network path. Actions, cyclic references, missing
references and evaluation-budget exhaustion fail closed.

When an explicit labeled currency claim contradicts an initial calculator readout,
the saved response receives the computed readable snapshot and a partial-data
status while retaining the validated interactive program. This checks consistency,
not whether the model chose the correct real-world formula or assumptions.

Monthly extreme-value contradictions and the observed two-tab-stop example now
trigger review. Negative examples and scoped monthly comparisons have regression
coverage. Procedure consistency guidance now reaches prose-only requests as well
as rich requests. That prompt change alone does not prove the two remaining
guidance/pricing failures fixed.

Readable projection no longer turns unresolved table expressions into blank data.
The live rich table remains intact. Initial computed Metric values are retained in
the readable snapshot. This does not yet provide complete expression-backed table
export in every fallback case.

## Verification of changes

- 64 targeted native-answer and new snapshot tests passed.
- Backend and frontend TypeScript checks passed.
- Generated schema/function parity passed. The 55-component/30-function registry
  is unchanged.
- Structured mission policy passed.
- Local replay of captured loan and monthly answers preserves their visuals and
  replaces contradictory numerical prose with verified computed readouts.
- Keyboard replay is honestly marked partial for factual review.
- Checklist labels missing from the model's prose are retained in the readable
  answer, including when no prose was supplied. Existing labels are not duplicated.

These local checks do not replace fresh hosted acceptance or final exact-source CI.

The API Docker check on `993a483139508705908a9d554a6e552547eff28b` exposed a
heterogeneous function-registry TypeScript inference error absent from the local
linked dependency setup. The validated dispatch boundary was corrected without
removing runtime schema checks. Its exact Docker check must pass before any new
hosted window starts. Earlier CI inventory drift was regenerated from source.

## Remaining gates

Resolve and verify the procedure and subscription-pricing failures. Complete the
remaining universal suite, factual review, interactive screenshot review, final
exact-source CI and protected release preparation. Do not infer universal success
from a bounded prompt suite.

Fresh Search remains blocked by disabled isolated staging R2 credential versions.
They were not reenabled and production storage was not reused. A replacement
private bucket-scoped credential is needed for that live test. Saved-source replay
does not constitute a new provider Search test.

Production frontend remains `fb9c19673f83cdc5648a67a20b53028c6777ed6d`, deployment
`dpl_7Qu1GdCHwBCY2PJmk8jLJPHLK3bM`. The serving API/Job and decoder remain the
existing `62c34a8f` pair. No schema, scheduler, credential or production routing
changes were made. A candidate rollout and compatible rollback still need final
verification against the eventual source.

Whole-drive free space decreased from 66,369,650,688 to 65,826,045,952 bytes at the
recorded checkpoint, about 518 MiB. This includes concurrent machine activity and
is not attributed solely to this task. Bounded runner evidence and task cleanup
were retained. No global pruning or unrelated artifact deletion was performed.
