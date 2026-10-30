# Mandatory Google Cloud Shell usage policy

Founder directive received October 31, 2026. Applies to Claude Code, Codex and
all future Xroga engineering, testing, releases and infrastructure operations.

Cloud Shell is a specialized operational tool. Use it only for a demonstrated
technical need when another suitable authorized method cannot do the job as
effectively, securely and reliably. Convenience alone is insufficient.

The founder reports a current default allowance of 50 hours per week for the
authorized account. Treat it as shared, finite operational capacity. Confirm
the account's actual remaining quota and reset information when using Cloud
Shell. This record does not establish a live quota reading or guarantee that
the provider's limits will remain unchanged.

## Choose the execution environment first

| Task | Preferred environment |
| --- | --- |
| Source editing | Existing local repository |
| Git operations | Local Git or authorized GitHub integration |
| Code review and PR/CI inspection | GitHub integration or CLI |
| Type checks, lint and ordinary tests | Local machine or existing CI |
| Browser/UI tests | Local Playwright or existing CI |
| Documentation and configuration analysis | Local tools |
| Vercel deployment inspection | Authorized Vercel integration or CLI |
| Cloudflare Workers AI testing | Authorized Cloudflare integration |
| Google resource inspection | Authorized API, local gcloud or Console |
| Cloud Run deployment | Existing approved deployment workflow |
| Cloud-specific administration | Cloud Shell only when genuinely required |

These are preferences. Check authentication, tool availability, permissions,
free quotas, actual costs and security conditions before selecting a method.
Do not introduce a new paid development service to avoid Cloud Shell quota.
Follow [cloud cost containment](cloud-usage-policy.md) and the permanent local
storage cleanup instructions in [AGENTS.md](../../AGENTS.md).

## Admission check

Before starting a session, answer these questions in the existing mission,
release or operation record. Do not create another orchestration system.

1. What exact task requires Cloud Shell?
2. Can the existing local environment do it?
3. Can GitHub or existing CI handle it?
4. Can an authorized Google API or local gcloud handle it?
5. Can the Console complete it without launching Cloud Shell?
6. Is the operation read-only or a production mutation?
7. Which underlying services can incur charges, and what approval covers them?
8. What duration is expected, and what quota remains?
9. Is an existing critical production operation active that must not be interrupted?
10. Can related necessary commands safely share one short session?

Use an equivalent secure, reliable alternative when available. Missing quota
information must be recorded as unknown, not fabricated. Reserve capacity for
incidents, recovery, necessary configuration and release troubleshooting that
cannot safely run elsewhere. Diagnose unexpected usage growth and move ordinary
development to suitable alternatives. Never evade restrictions with unauthorized
accounts or artificial keepalive activity.

## Separate command location from resource consumption

Local gcloud commands do not consume Cloud Shell session hours. They can still
start billable builds, services, Jobs, VMs, storage, networking and other cloud
operations. Record command location, invoked APIs and affected resources
separately. Promotional credits, net cash spending and session hours are
different resources. Apply existing cost approvals wherever commands execute.

Use existing approved identities with least privilege. Never export production
credentials or weaken protected-data handling merely to run a command locally.
An authenticated laptop is not automatically suitable for protected restoration.
Existing no-swap, secret handling, isolation, integrity and cleanup requirements
remain mandatory for sensitive backup/recovery work.

## Focused session lifecycle

- Prepare commands and review scripts outside Cloud Shell first.
- Verify the active account's authorization and exact project before execution.
- Check shared operation ownership and avoid duplicate agent sessions.
- Group related operations only when safe and keep unrelated development local.
- Check remaining allowance during necessary use and record significant changes.
- Avoid idle browsing, repeated reconnects and long-running background processes.
- Never use Cloud Shell as a permanent application server or durable worker.
- Verify results, preserve required evidence and end the session when finished.
- Verify session termination separately from command completion. Do not claim
  that closing a browser tab proves the backing environment has stopped.

Do not keep Cloud Shell alive artificially. Account for provider inactivity,
session-duration and noninteractive-use restrictions. Durable production work
belongs in an existing approved durable execution path, with bounded ownership,
recovery and cleanup.

## Batch and release operations

Complete repository inspection, source/dependency/security review and local/CI
tests before cloud deployment. Reuse accepted source-bound evidence when
semantics have not changed. Prepare exact approved commands or the existing
release workflow, rollback and cleanup first. Execute only the required
cloud-specific operations, verify runtime state, then end any necessary session.

Do not discover preventable code defects through repeated deployments and
rollbacks. Temporary revisions, tags, workers and minimum instances must retain
their approved lifecycle and cleanup bounds. The
[pre-traffic-shift gates](pre-traffic-shift-verification.md) remain unchanged.

## Sensitive backup and recovery

Never interrupt active critical production or recovery just to save session
hours. First check whether an existing approved durable job or other authorized
environment can meet the operation's security and reliability requirements.
Verify permissions, snapshot integrity, exact source and recovery evidence.
Avoid fragile Cloud Shell background jobs for essential long-duration work.
Security and data integrity take priority over minor quota savings.

Do not create a paid recovery system, Cloud Workstation, VPS, development
machine or subscription without evaluating existing alternatives and obtaining
applicable approval for new material or recurring spending.

## Shared usage and evidence

Claude and Codex must inspect the existing operation record before using shared
infrastructure. Reuse verified inventories, audit reports, deployment receipts
and health evidence. Designate one operator for shared mutations. Never disrupt
another operator's production mutation or recovery workflow.

Record necessary session use in the existing operation record:

| Field | Required entry |
| --- | --- |
| Owner and operation | Agent/operator, existing mission or release reference |
| Technical need | Exact task and why suitable alternatives were insufficient |
| Scope | Account/project, resources, read-only or mutation, existing approval |
| Quota | Observed remaining allowance/reset, or explicitly unknown |
| Cost | Underlying services, approved usage ceiling and expected consumption |
| Duration | Planned and actual start/end, without inventing provider-metered hours |
| Result | Sanitized evidence links, failures and next safe resume point |
| Closure | Cleanup result and session termination verified or pending |

Keep credentials, customer data, audio and private backup contents out of the
record. No paid monitoring service or new control plane is required. Preserve
important evidence and recovery assets under the existing cleanup policy.

This policy grants no new production, IAM, credential, spending or activation
authority. It does not revoke an existing specific approved operation or lift a
batch hold. Continue already-authorized work without repeated approval requests.
Use Cloud Shell when necessary, verify the result and release the session.
