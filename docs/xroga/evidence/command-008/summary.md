# Command 008 software evidence

All ten original criteria are implemented in the current Phase 3 source. One canonical server-issued authority boundary now covers business actions and Operations adapters. Grants bind actor, owner, project, action, target, account, canonical payload digests, expiry, revocation, replay state and spend limits. The 12 action classes have deterministic policies. Text, booleans, cloned objects and serialized model output cannot create authority.

Focused unit tests cover exact bindings, mutations, replay, expiry, revocation, all policy classes and refusal of fabricated authority. Disposable database tests cover business claim and dispatch locks, cancellation and expiry during waits, terminal receipts, Operations membership and approval rechecks, and durable spend reservation ceilings. Provider execution in these tests is synthetic and is labelled as such. No live provider effect is claimed.

Final source and integrated CI receipts are supplied as independent observations to the strict Phase 3 evaluator. This document is source evidence, not a release or production authorization.
