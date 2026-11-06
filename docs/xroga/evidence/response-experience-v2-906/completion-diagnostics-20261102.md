# Completion diagnostics and mobile integration

Status: source corrections, live response acceptance remains BLOCKED.

The 9950a882 unit and integrated-candidate jobs both failed at frontend-unit-tests. The sole reported failure required the old `codeBuildActive || semanticBuildPlanned` source expression. It now checks semantic planner authority and retains checks that real build failures cannot become generic chat fallbacks. Backend unit tests, backend/frontend builds, type checks and frontend lint passed in that failed run. This does not certify the new source.

The historical failed SaaS request cannot be attributed to reasoning exhaustion, a filter, a provider quota or transport truncation from retained evidence. Its adapter discarded the request identifier, finish reason and usage before throwing. Existing accounting holds stay untouched. No provider diagnostic, model request or paid search was submitted in this correction task.

Both admitted SDK completion paths now attach bounded content-free empty-response receipts. Receipts retain a validated provider request identifier, observed finish reason, counts of answer/reasoning characters, tool calls, refusal presence and actual usage when supplied. No estimated count substitutes for missing diagnostic usage. Stream interruption logs retain the same metadata and abort state. Logs contain no prompts, answer/reasoning text, tool arguments or credentials. Empty output remains an error and publishes nothing. The previous nonstream error's unsupported assertion that reasoning proves token exhaustion is removed. The model registry, wire body, destinations, budgets and admission/publication gates are unchanged.

Graphs use container-width observation to select a vertical mobile layout, retaining explicit edges and visible connection descriptions. Desktop branch geometry is retained. No inference occurs during resize. Mobile layout tests are offline tests, not signed-in visual acceptance.

Focused tests passed: f883e756-9ec7-4655-9883-cea57766b00d, 18 tests including actual admitted SDK paths with synthetic provider frames, graph topology and semantic error labeling. Frontend type check a3e88077-d430-4b41-82bf-fd07fda83e28 passed. Backend type check df0cb14a-3ad5-4a3d-b60e-290125d81d54 passed after correcting a test helper's option type. Local runtime was installed Node 24.18.0, not the canonical CI Node 22.21.1.

Readiness source declares storage_housekeeping optional and reports storage_reconcile_not_scheduled when Drive is enabled without cloud reconcile mode. This is a real operational warning, not failed API/database connectivity and not permission to set a flag without a functioning schedule. A schedule/configuration change requires separate operational verification. No storage or production configuration was modified.

Production stays on the previously approved fd3b API/Job pair and retained 1d487ce9 recovery pair. New-source deployment and any new generation must pass source gates and standing production approval requirements. New SaaS/workshop/research/code, saved/reopened equivalence, mobile visual acceptance and full Share live acceptance remain unverified. No completion claim is made.
