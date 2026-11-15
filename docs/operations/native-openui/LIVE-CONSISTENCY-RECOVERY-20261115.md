# Live consistency recovery, 2026-11-15

## Release status

Not ready for promotion. Production was unchanged. The hosted run verified the
request/render/persist/ledger path, but final review found seven failed cases.
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
| parity/7 | React comparison overgeneralizes hook restrictions and Date serialization. |
| parity/11 | Loan prose gives inconsistent totals. The upstream calculator computes $4,331.67 interest and $24,331.67 repayment. |
| parity/13 | Keyboard example mixes two focus strategies and does not move actual focus. |
| suite/how-to | Stain-removal procedure contradicts its heat precaution. |
| suite/compare | Three seats are priced as two one-seat subscriptions, and subscription stacking is assumed. |
| suite/line | March is called the lowest month even though January is lower. |
| suite/checklist | The rich view has 25 items, but readable prose omits the launch announcement item. |

All ten immutable answer-hashed reviews have been recorded: three passed and seven
failed. The three passes cover unresolved input conflicts, part-of-whole values,
and negative/zero cash flows. They do not certify other prompts.

The React prompt clarification follows the upstream documented hook exceptions
and serializable types, including Date and Server Functions. See
[React's client-boundary reference](https://react.dev/reference/rsc/use-client).
Its effect on a fresh model answer remains an acceptance gate.

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
the readable snapshot. The subsequent local recovery change also evaluates table
cells through the same pure upstream functions, preserving computed values and
booleans when a complete readable snapshot is needed. Failed expressions remain
unavailable instead of becoming invented blanks or zeroes. This is an initial
snapshot, not an export of later browser edits or proof of every fallback case.

## Verification of changes

- 66 targeted native-answer and snapshot tests passed after the calculated-table
  recovery change. The new cases cover payment values, zero APR, boolean cells,
  rejected actions, cycles, missing references and non-finite scalar input.
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

The hosted run pinned to `5e18d374` is separate from the subsequent local table
recovery change. Its first build timed out, and the corrected build's test harness
stopped before inference because the reviewed case list omitted native-selection
flags. Both attempts were cleaned up with zero model calls. The corrected harness
now validates the complete case contract offline before cloud mutations. Detailed
run records remain outside Git, and no failed attempt counts as live acceptance.

The corrected hosted replay then caught a serious keyboard-accessibility issue:
the loan's horizontally scrollable formula was not focusable. This happened with
the provider disabled, after the recovered values survived Copy and Reopen. The
follow-up fix makes native Code, native Markdown and readable fallback code blocks
named, focusable groups with visible focus. It does not create duplicate region
landmarks. Browser coverage now checks long code in both rendering paths, keyboard
scrolling and axe at five widths in both themes. Hosted revalidation is pending.

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

## Captured-answer interaction follow-up

The provider-disabled loan replay exposed a keyboard-inaccessible scrolling code
block. Native Code, native Markdown and readable fallback code blocks now have
keyboard focus and a visible focus outline. No permission or tenant check changed.
The current-source caller review for formatAiMarkdown was refreshed after checking
that its only persistence-scanner candidate is the unchanged Uint8Array conversion.

Visual inspection then found a duplicate initial table and stale initial metric
values alongside the live calculator after an APR edit. Native deduplication now
uses the same bounded pure initial-value reader as readable recovery. Exact
snapshots are omitted only while the native view renders. Distinct values, cited
tables and readable fallback remain. The recovery message no longer implies that
results are necessarily below the message.

Local Chrome replay used the original captured loan and checklist, with capture
hashes recorded, at 390 and 1440 pixels in both themes. Eight combinations passed,
including APR zero, one table, absence of stale readouts after editing, 25 checklist
items, keyboard controls, zero axe violations and zero external requests. Evidence
is in local job ae7c35f2-7848-4a2e-b033-77cb6c138ced. These are captured model answers,
not fresh hosted inference. The 75 focused tests passed in job
3ebb21cb-9aaf-46a6-af74-03d91246c4ed. Frontend type checking passed in
8f88813b-f427-46e5-b4bc-6728c4911361. Final-source hosted acceptance remains pending.

The three closed 5e18 staging attempts made zero model calls. Their combined
estimated build and runtime cost is $0.26682266927095056, excluding ancillary
charges and invoice reconciliation. The last run's independent cleanup recorded
zero remaining resources, and retained images were deleted after the application
fix required a new build. No production changes were made.

The prior b59882028 authenticated CI finished with 10/11 browser cases passing.
The remaining case found hidden diagram nodes on the private Share page. Existing
artifacts did not retain that secondary page before it closed. The test now saves
its synthetic screenshot and bounded geometry before cleanup while retaining the
original assertion. The cause is not yet confirmed and the check is not weakened.

The d59 authenticated browser workflow passed, including the previously failing
Share diagram. Manual review of its Workspace light-theme screenshot found an
invalid test setup: html was changed to white while body retained theme-black.
The equivalent Share test already updated both and was readable. The Workspace
fixture now follows that same theme contract and asserts color contrast on the
actual answer turns before saving screenshots. No production theme bug is claimed
from the invalid fixture. The pending d59 hosted launcher was stopped before KMS,
build submission or model calls. Final source CI must cover the corrected test.
