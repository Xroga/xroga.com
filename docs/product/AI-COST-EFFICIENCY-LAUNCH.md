# AI cost-efficiency launch report

## Audited waste risks

| Risk | Current control | Finding |
| --- | --- | --- |
| Duplicate planning/conversion | Clear requests skip conversion when the production flag enables the universal path | Covered by converter and production-bridge tests; no live duplicate proven |
| Repeated repository scans | Remote tree is authoritative; cached content is reused only for the identical complete remote inventory | Necessary correctness cost; no unsafe shortcut recommended |
| Unnecessary long context | Focused context selection, priority budgeting, whole-file admission/drop reporting, and safe model limits | Controlled; public `1M+` claim was narrowed because it overstated the product boundary |
| Unrequested research | Research policy requires an explicit current-evidence need | Covered by fail-closed research tests |
| Duplicate reviewer invocation | Review is one canonical task per run; repair can trigger a fresh evidence-bound review/validation path | No duplicate call proven in the captured run |
| Retries without new evidence | Retry budgets, circuit breakers, no-progress limits, cancellation, and deadlines | Controlled by automated tests |
| Repeated dependency installs | Ephemeral runtime cache with lifecycle-script refusal and network fail-fast | Covered by validation-runtime tests |
| Full project shown as changed | Full snapshot was reused in the presentation layer | Fixed by deriving artifact metadata from the actual before/after trail; this improves truth and payload size without weakening validation |
| Internal model identity repeated in evidence | Model id was copied into persisted terminal evidence | Removed at generation and redacted on legacy/persisted projection; saves payload and preserves the public Black Hole boundary |

## Safe savings implemented

1. Universal output envelopes now include only changed-file artifact metadata instead of one artifact record per file in the complete project snapshot.
2. The rich completion artifact includes only actual changed paths and line counts while the full snapshot remains available to validation and the atomic writer.
3. Public copy no longer encourages assumptions that every request consumes a one-million-token context.
4. E2E-REPO-002 used one model attempt, four sandbox commands, one review branch and one commit; no repair loop or duplicate GitHub write was observed.

No provider model, validation gate, reviewer, repository authority check, or browser check was removed to save cost.
