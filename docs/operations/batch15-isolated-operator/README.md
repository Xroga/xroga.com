# Isolated activation operator checkpoint

This branch contains operator tooling and receipts, not an application release.
Do not merge this historical operator branch into main. Application fixes are
reviewed separately in PR #899, pinned by SOURCE.json and immutable images.
Batch 1 and the microphone remain on their existing production release.

The founder approved the original package at fa9e90d6, staging-only KMS amendment
at b9362e42, and private-egress amendment at 15609b32. Approval records are saved
beside these scripts. The total stays $2, models $0, one two-hour window, cleanup
at 90 minutes. No production SQL or production activation is included.

## Execution gates and commands

Use the local authenticated Google SDK, never Cloud Shell. The Python scripts
obtain owner OAuth in memory and refuse other projects, unapproved resources,
failed CI and duplicate build submission. Do not print a token or secret bundle.

1. `stage_controller.py ci --source <full SOURCE.json applicationSource>`
   must independently observe seven passing exact-source checks in PR #899.
2. `stage_controller.py build --source <same full SHA>` submits the single
   approved build. An existing build-journal blocks replay even on lost response.
3. `stage_controller.py status` reads the same build and saves the three
   immutable image references only after SUCCESS and exact names/digests match.
4. Review image source labels/byte sizes and final public operator changes.
   `runtime_controller.py preflight` performs read-only resource checks.
5. `runtime_controller.py begin` starts the one window and independent local
   cleanup watchdog, temporarily enables only stage secret version 2, validates
   its synthetic DB/test-bucket destinations without logging values, and creates
   only the approved identities, HMAC and conditional roles. A missing test
   credential stops and cleans up, never borrows production credentials.
6. `runtime_controller.py host` creates the approved temporary NAT/address and
   private VM. Native DELETE at two hours is the compute backstop. No public IP
   or SSH is attached to the VM. No API/model/DB credential reaches this host.
7. `runtime_controller.py host-status` reads sanitized bootstrap evidence.
   Original host security probes and the unchanged 32-criterion evaluator must
   accept this actual host before transport is enabled. Compiled coordinator
   starts only after that proof. HOST_REJECTED never becomes a passing label.
8. `runtime_controller.py transport` adds only the approved private backend,
   firewall, health check and two /v1/jobs paths. Current URL-map fingerprint and
   voice/default routing are preserved. No DNS changes.
9. `runtime_controller.py stage-api` creates only the private test API and queue,
   pins its discovered native URL and grants stage identity invocation only.
10. `runtime_controller.py verify` submits one no-retry, 20-minute Job. Its real
    two-user fixture checks readiness, private Drive single/multipart uploads,
    storage quota, ownership, denied action grants/model budget, actual browser
    delivery, durable evidence, duplicate refusal, cancellation, revocation and
    actual executor SIGKILL with a new independent process and real lease expiry.
    This is process-loss proof, not VM-destruction proof. Never label an unrun
    fixture or a successful Job submission as acceptance.
11. Read the native execution result and sanitized receipt, then immediately run
    `runtime_controller.py cleanup`. The watchdog independently starts cleanup
    at 90 minutes if necessary. It pauses only the test queue, cancels only test
    executions, stops test API/VM, runs exact-session fixture cleanup, removes
    routing/resources/bindings/identities and restores version 2 to DISABLED.

Required receipts include build/source/image readback, actual host acceptance,
native Job result, fixture observations, cleanup verification and unchanged
Batch 1/voice production readback. A failing or missing item is FAIL/BLOCKED.
Native billing can post later, so the $2 figure is an approved ceiling, not a
claim of a settled invoice. New images may remain for at most 72 hours within
that ceiling. Before deletion, check production/recovery references. Preserve
digests and receipts, never globally prune shared layers or recovery images.

## Failure handling

Never retry a resource creation with an unknown response. Inspect its saved
intent and exact native resource/operation first. No new window or larger VM is
implicitly approved. A technical failure can be diagnosed and corrected within
the same remaining window and resource scope. Never extend an expired grant,
disable the browser sandbox, add a public invoker, use customer data or call a
model to make a fixture pass.

The local watchdog can't run if the laptop is powered off. Expiring IAM and
native VM deletion remain backstops, but NAT/IP/routing removal still needs an
actual cleanup receipt. Don't claim those resources disappeared automatically.
If cleanup reports an error, preserve that obligation and finish it before any
new test or production work.

Production activation remains outside this isolated package. After accepted
proof, prepare the exact retained-host cost, immutable API/Job images, release
fence database changes and source-safe cutover for its required specific owner
decision. Batch 2 provider/model acceptance also requires an explicit model cap
and disposable provider scope. No Batch 2 activation precedes Batch 1.5 live
acceptance.
