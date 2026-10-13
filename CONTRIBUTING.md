# Contributing to Xroga

Thank you for helping improve Xroga. This repository contains the hosted product as well as public-safe developer tooling.

## Before opening a change

- Use an issue for a reproducible bug, focused enhancement or documentation defect.
- Do not include credentials, private repositories, customer data or production logs.
- Keep changes scoped and preserve unrelated work.
- Do not create promotional issues, artificial engagement, backlink requests or vanity integrations.
- Security reports belong in [private vulnerability reporting](https://github.com/Xroga/xroga.com/security/advisories/new), not public issues.

## Local checks

```bash
npm ci
npm run project:check -- .
npm run test:growth
npm run test:growth:technical
npm run build --workspace=backend
npm run build --workspace=frontend
npm run lint
```

Run the focused tests for the surface you changed. Existing failing tests must not be weakened, skipped or hidden.

## Pull requests

Describe the problem, the smallest coherent change, tests executed, security/privacy impact, and any deployment or owner decision still required. A passing static project check is useful evidence, not proof that the application is production-safe.

Follow `docs/xroga/PR_EVIDENCE_TEMPLATE.md`, declare structured mission impact, and run `node scripts/xroga/mission-check.mjs`. Use the actual pinned toolchain and clean baseline. Do not present BLOCKED_KNOWN_GAP fixtures as passing user journeys. Security-sensitive releases require isolated authenticated/migration/staging verification; missing configuration is not permission to use production fixtures.

## Licensing

No new license is granted merely by this repository being public. Licensing for reusable satellite tools and packages remains an owner decision. Do not copy or publish commercial-core code as a new package without explicit approval.
