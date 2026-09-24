# Security policy

Xroga treats repository contents, prompts, uploaded documents, web evidence and generated code as untrusted input. Authentication, tenant isolation, repository authorization, explicit write/deployment authority, sandboxing and secret redaction remain required boundaries.

## Report a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/Xroga/xroga.com/security/advisories/new). Do not open a public issue containing exploit details, credentials, private repository content or personal information.

Include the affected surface, reproduction steps, impact, and the least-sensitive evidence needed to validate the report. Never test against another user’s account, repository, data or deployment without their explicit authorization.

## Supported surface

The hosted production service and the current `main` branch receive security fixes. Historical commits, preview deployments, generated user projects and third-party integrations have separate ownership and support boundaries.

## Public developer artifacts

The Xroga Project Check Action/CLI performs static, read-only inspection. It does not execute repository scripts, upload source, read environment values, or claim security certification. Future public packages must pass their own dependency and supply-chain gate before release.
