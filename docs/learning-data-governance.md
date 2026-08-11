# Learning-data governance

What Xroga may keep from a run, what it may do with it, and what may leave the system.
Covers Command 3 §25 (the five kinds), §26 (fine-tuning consent) and §29C (a failed
benchmark can never become successful learning data).

Implementation: `backend/src/ai/learningData.ts`. Tests: `learningData.test.ts`.

## The habit this rejects

§25 opens by rejecting a habit rather than describing a feature: **do not call every stored
outcome "training data".** The five kinds below carry different permissions and different
consequences. Routing data changes which model gets picked tomorrow. Fine-tuning data may
leave the system entirely and be absorbed by a provider. Treating them as one bucket is how
a customer's private repository ends up in a training corpus because someone reached for
the nearest table.

## The five kinds

Ordered by how far the data can travel:

| Kind | Used for | May leave Xroga |
| --- | --- | --- |
| `evaluation` | Scoring models and capabilities | No |
| `routing` | Choosing a model for a role | No |
| `prompt_improvement` | Revising prompts | No |
| `skill_improvement` | Revising skill procedures | No |
| `fine_tuning` | Provider-side training | **Yes**, under §26 consent only |

`fine_tuning` is last because it is the only one that may leave, and it therefore carries
the strictest requirements.

## The capture gate

`evaluateCapture(conditions)` decides whether an outcome may become a reusable example.
Every field of `CaptureConditions` is a **fact about what happened**, not a judgement about
quality. There is no `lookedCorrect` — that is precisely the assessment the gate exists to
refuse.

Eight conditions, all required:

```
requiredTestsPassed          acceptanceCriteriaPassed     securityChecksPassed
commitSha (non-null)         secretsRemoved               personalIdentifiersRemoved
dataUsePermitted             repositoryOwnershipVerified
```

`commitSha` being absent means the work was never published. An outcome with no commit has
no verifiable artifact behind it, so it cannot be a successful example of anything.

The gate is deliberately unforgiving, and the failure it guards against is subtle: **a run
that produced plausible code, read well, and did not pass its tests is exactly the run most
likely to be captured by a lenient filter — and exactly the one that teaches the wrong
lesson.** So capture requires every condition, and "the model sounded confident" is not
among them.

### Return versus throw

`evaluateCapture` returns a `CaptureDecision` rather than throwing. Failing to capture is
the ordinary case — most runs will not qualify — and throwing on the common path pushes
callers toward swallowing it.

`captureExample` throws `LearningDataError`. A caller reaching that function has already
decided it wants the example stored; returning a quiet `null` at that point invites the
failure to be ignored. The error carries `unmet`, so a caller can fix the cause rather than
guess at it.

## Fine-tuning consent (§26)

Two consents, deliberately not folded together:

- `dataUsePermitted` — "you may analyse this to improve routing"
- `explicitTrainingAuthorization` — "you may send this to a provider for training"

The second is **not implied by the first.** `captureExample` refuses `fine_tuning` capture
outright when no `FineTuningConsent` is supplied, and refuses a private repository without
explicit, informed training authorization from its owner.

Note what is enforced and what is not: the code refuses capture. It does not itself
transmit anything to a provider — there is no fine-tuning submission interface in this
repository. The gate exists ahead of the capability it guards, which is the correct order.

## Benchmarks as learning data (§29C)

`benchmarkIsReusable({ passed, validationRan, commitSha })` requires all three.

This is its own function because the mistake it prevents is one of convenience: a benchmark
row already carries a model, a prompt and an output, so it is the most tempting thing in
the system to feed back. A failed one teaches the wrong lesson. A passing one whose
validation never ran teaches nothing that can be checked.

## Related

- `docs/model-evaluation-system.md` — where benchmark results come from, and why failures
  stay in the denominator.
- `docs/command-3/safe-actions-and-permissions.md` — the wider permission model.
