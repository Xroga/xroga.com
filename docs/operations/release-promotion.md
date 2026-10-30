# Release promotion

Promotion is denied unless the release build succeeded, every required check includes passing evidence, and each required approval role is present. The evaluator does not itself call Vercel, Fly, GitHub, or Supabase. Provider mutation requires a separate explicit authorized action.

Operators must complete [pre-traffic-shift verification](pre-traffic-shift-verification.md)
before requesting traffic-promotion approval. Source, tests, security, runtime,
compatibility and cost review must pass, with compatible rollback ready. Known
blocking defects or missing mandatory evidence deny promotion. A generic evaluator
PASS is not a claim that every operational check has actually been executed.

After exact owner approval, use only a compatible bounded rollout with measured
advance/stop thresholds and the preserved canonical API/Job pairing. A failed
rollout requires recovery, diagnosis and affected pre-release verification before
another attempt. Record and verify temporary tag/minimum-instance cleanup.
