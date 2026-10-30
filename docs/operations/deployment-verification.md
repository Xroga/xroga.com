# Deployment verification

Required sequence: build success → provider ready → liveness → dependency readiness
→ actual changed critical-workflow synthetic → runtime error query → evidence
persistence. A URL, health response or provider READY alone is insufficient.

Run this sequence in a controlled environment or approved zero-production-traffic
candidate before traffic promotion, following
[pre-traffic-shift verification](pre-traffic-shift-verification.md). Preserve
authentication, tenant isolation, startup safeguards and source-compatible workers.
Separate real changed-flow proof from mocked fixtures and untested conditions.

Only after the full pre-release gate and exact owner approval may the controlled
production rollout begin. Check the measured gate at each step and complete the
relevant live acceptance and cleanup afterward. Evidence must reference the real
deployment/revision, immutable image and exact source. Post-merge CI or provider
readiness does not establish production acceptance. This document deploys nothing.
