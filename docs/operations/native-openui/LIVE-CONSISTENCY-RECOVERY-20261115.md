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

Manual review of the 02b theme screenshot rejected the DOM-only correction too:
the React-owned shell still used its previous saved theme. The acceptance test now
uses the actual Change theme menu before resizing through all five widths, as the
live-model harness already does. This checks the complete product state transition.
Neither the d59 nor 02b light-theme fixture screenshot is accepted as visual proof.
No hosted cloud build or inference started for either test-only source update.

Further source inspection confirmed that terminalSkinAuto can be disabled, making
a light page with a dark chat surface a supported user choice. Native answer
colors previously followed the global page rather than that independently chosen
surface. This is a product compatibility defect beyond the invalid test setup.
Native ink, secondary text, canvas, panels and borders now inherit the existing
Workspace surface tokens. Status colors and syntax highlighting select the local
skin's light/dark palette. Standalone Share and evaluator themes stay independent.
The browser regression checks all ten actual skin definitions against black and
white page themes, including calculated foreground/background contrast.

The complete local browser suite passed in job
400800e3-1f60-4b51-be1f-2960cdc8814a, including all 20 mixed-skin combinations.
Both mixed-theme mobile screenshots were visually reviewed. Frontend type
checking passed in e0542dc4-c93b-4464-b0a3-b026a1d012b3. Source inventory, mission,
runtime and audit-integrity checks passed in ef08ba0e-c638-42f0-9549-048153d50e34.
These checks are local verification, not fresh hosted-model acceptance.

The 44008c2f CI ledger check caught an operator ordering mistake: the preceding
test-evidence paragraph was appended after source-manifest generation. Its hash
was therefore stale. Regenerate the manifests after this final report edit,
validate them, and commit only the corrected evidence. No application change or
weakened source check is needed.

The 44008c2f authenticated run then caught a real light-theme contrast failure
in a SourceCitation label inside a muted Caption. The screenshot showed the
correct light Workspace and readable main answer, but the chip inherited muted
text on its tinted background. Citation chips now use the local primary ink.
The mixed-skin regression includes caption citations and checks their actual
computed color plus axe contrast. This preserves the compact inline design.

## Live 34953d81 findings and deterministic recovery

The hosted seven-case run returned fourteen settled canonical receipts totaling
1,618 microUSD. Five cases passed automated checks. The React comparison failed
native rendering and the loan failed numerical consistency. This is not a release
pass. The harness incorrectly continued after the first collected failure.
Its external acceptance runner and proxy now stop on a failed case or abort file,
and the orchestration checks the completed receipt's acceptance result.

The comparison's empty Markdown corner header produced an invalid legacy table.
The persisted native program was present, but validating the derived legacy
blocks prevented NativeWorkspaceAnswer from selecting it. A failing regression
reproduced this. Native answers now persist prose directly, and saved native
documents can discard invalid legacy projections while still validating their
envelope, source limits and native program separately. Legacy answers keep their
existing conversion.

The calculator's recovery copied contradictory text out of its own OpenUI Text
nodes. Recovery now removes matching conflicting currency explanations from the
program before deriving saved prose, retaining pure calculations and controls.
The regression covers contradictions in prose and in the visual alone. Empty
recovered paragraphs do not occupy layout space. Markdown comparison tables now
use ordinary cells for blank corners and named keyboard-focusable groups rather
than duplicate landmarks.

Local verification: 67 backend tests passed in
46210467-7e6a-4628-ae75-4ef83d9f52e8. Frontend document and integration tests passed
in a1ef5a79-95da-4972-91c9-0eb0d4d15def. Type checking passed in
2755b971-e222-4bf0-a517-baf99daa0a66. Captured-answer Chrome replay passed eight
combinations at 390/1440 pixels and light/dark themes in
8d3fe377-766a-41a2-93e5-88930c25691b, including persistence decoding, zero-interest
interaction and accessibility. These are local replay results, not new hosted
inference or a full Workspace acceptance claim. Two differently worded comparison
tables remain visible to avoid dropping distinct details. That composition still
needs improvement. Further source changes require final checks.

Cloud cleanup was independently verified at 2026-11-15T19:27:09Z, including
services, service accounts, temporary secret grants and retained image tags.
The test key is scheduled for destruction. Captured receipts remain for audit.
Build/runtime usage is estimated at $0.085834964 for this window, not an invoice.
Production traffic, canonical Job, SQL and browser automation were unchanged.

The 85f91c8b API build caught a missing required prose argument in the recovery
validator call. Pass an explicit empty prose string because the contradictory
draft must not be used to validate the corrected visual. No staging build was
started from that failed candidate. Backend type checking is required alongside
the frontend check before advancing the corrected source.

## Semantic review and the duplicated-answer contract

Review of the remaining captured text found that automated browser passes were
insufficient. The plan comparison recommended Team for more than one seat despite
its own $20 versus $25 row at two seats. The line-chart prose claimed increases
every month while its values dropped from 24 to 22. The checklist had 25 controls
but 26 prose bullets and redundant headings. Source-hashed failure reviews were
recorded for cases 1, 2, 5, 6 and 7. Cases 3 and 4 are not claimed as a semantic
release pass. No further cloud build started from 85f91c8b or 20cd31c9.

The rich-answer prompt required two independent complete answers, Markdown and
OpenUI. Replace that with a brief readable summary and one complete native OpenUI
answer. Existing deterministic projection now always includes the validated
program's explanation, tables, code and citations in the saved readable answer.
Ordinary short answers remain plain text. Invalid visuals retain the summary and
existing recoverable content. No second model, formatting call or renderer was
introduced. This change still needs fresh model acceptance, not just unit tests.

The existing monthly data guard now checks unscoped claims that the series rises
or falls every month against every consecutive observation. It preserves overall
growth claims and recovers the accurate chart on a conflict. The staging harness
now requires an answer-hash-bound semantic review after every automated pass and
before another prompt. A failed automated or semantic check stops dispatch.

## Share diagram lifecycle recovery

Authenticated CI on c5fff0af captured a Share diagram whose nodes had valid
geometry but retained `visibility: hidden`. Its relationship text remained
readable. The preceding application-identical run had passed, so this was treated
as an intermittent rendering defect rather than dismissed as CI noise.

The read-only diagram supplied newly created controlled node objects on parent
renders, without retaining React Flow's measured node state. The installed
upstream `adoptUserNodes` implementation clears dimensions for replacement user
nodes. A focused Chrome test reproduced the hidden nodes after a parent update
when unchanged elements did not receive another measurement notification.

Use React Flow's [uncontrolled graph state](https://reactflow.dev/learn/advanced-use/uncontrolled-flow)
with default nodes and edges. Reinitialize on actual graph or responsive-layout
changes. No CSS override forces unmeasured nodes visible. The focused regression
also checks updated labels and nonempty edges across mobile and desktop widths.
It is included in authenticated CI. Failed reproduction job:
`acf2ce94-c3c6-4244-ae7f-552e4eac0dd6`. Passing correction job:
`ceda75ea-d279-4ac0-8d18-07620e1a7d33`.

The earlier 9863eb57 CI failure was a stale published-text assertion after the
readable-copy change. The 1624e2a5 failure was its stale source-bound proof hash.
Both were corrected without weakening tenant, single-dispatch, ledger settlement
or historical-evidence checks. No paid staging window started from those sources
or c5fff0af. Production remains unchanged pending exact-source acceptance.

## Hosted continuation on d2fa9fbe, November 16

All eleven exact-source workflows passed. The private provider-disabled browser
gate passed transport denials, owner/outsider isolation, captured interactive
answers, Share revocation, persistence, recovery and cancellation. The calculator
oracle was corrected to validate all rendered tables without requiring a second
standalone table that the prompt did not request. Sixteen local viewport/theme
scenarios passed before that hosted correction.

The first fresh React comparison failed the complete-answer gate. Two canonical
DeepSeek dispatches settled at 479 micro-USD, with a 14,172 ms answer latency.
The remaining three prompts were withheld. Diagnostic evidence identified one
`Table` schema error, `excess-args`, at statement four. Its privacy-safe token
shape showed columns, rows and one additional string. Existing recovery removed
the requested comparison table, leaving readable prose and a diagram. This is
a failed rich-answer acceptance, not a production-ready result.

Normalize exactly this three-argument shape into the existing Table and Caption
inside Col. Preserve the first two arguments and caption text unchanged, then
run the full schema, evidence, factual and data validation. Unknown extra objects,
fourth arguments, invalid rows and unverified sources remain rejected. No registry
expansion, second model or inference retry is introduced. Regression tests cover
literal and referenced captions, readable copy and Share round-trip. The original
rejected table text was not retained, so this regression reproduces the observed
structural failure rather than claiming a byte-identical raw-model replay.

Hosted evidence is retained outside Git under
`outputs/xroga-black-hole/workspace-universal-acceptance/candidate-d2fa9fbe-replay-correction`.
Its runtime services, identities and secret grants were removed after failure.
The bounded image retention record remains separate from runtime cleanup. This
recovery change still requires exact-source CI and fresh hosted acceptance.
