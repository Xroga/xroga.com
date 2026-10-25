# Permanent local storage cleanup policy

Each task owns the temporary resources it creates and cleans them when their
purpose ends. Preserve original acceptance evidence and recovery assets.
This development policy requires no paid service, personal AI account or active
development assistant. It does not replace Xroga's canonical scheduler.

## Windows laptop commands

Requires Python 3.12+ and standard Windows APIs. Source and configuration live
in `scripts/local/`, with no dependency on a particular user's home directory.
The runner is Windows development tooling. It is not imported by the API,
Docker image, production startup or Linux CI.

```powershell
npm run local:cleanup                         # dry-run, no deletion
npm run local:cleanup -- --apply               # owned inactive resources only
npm run test:local-cleanup
npm run local:run -- --cwd C:/path/to/xroga --timeout 900 --preserve report.json -- C:/path/to/node.exe path/to/trusted-test.mjs
```

Use absolute executable paths. Shell strings and `.cmd` launchers are refused.
For npm tasks, run `node.exe <installed npm-cli.js> run <script>` through the
wrapper. Existing npm scripts remain available for CI and existing tooling.
Developers and assistants must use the wrapper for local bounded commands.
Do not recursively wrap the cleanup tool itself.

Temporary files use task-owned TEMP/TMP/TMPDIR. Download/cache paths can use
XDG_CACHE_HOME. Test reporters should write disposable output under
XROGA_LOCAL_ARTIFACTS. Required reports go in TEMP and must be declared with
`--preserve relative/path`. The runner copies them, verifies SHA-256, and keeps
them outside disposable storage. Missing evidence or suspicious persistent data
blocks deletion. Use `--retain` for investigations or uncertain artifacts.
Do not use the temporary directory as a source checkout or credential store.

Source build outputs required for startup, packaging or recovery are retained.
Generate dispensable intermediate files inside owned TEMP where supported.
For example, point TypeScript's incremental build-info file there. Do not
delete an existing `.next`, `dist`, `node_modules` or worktree as a shortcut.

## Failure, interruption and storage bounds

The runner starts trusted processes atomically inside a Windows Job Object.
Timeout, exception, normal cancellation and wrapper exit terminate its process
tree. Handled failures preserve bounded logs, summary and required reports,
then attempt cleanup. Hard termination cannot run finalization. The next run
checks the saved marker, UUID, owner process and exclusive lease before
recovering abandoned resources. An unavailable Docker engine or missing required
evidence leaves a recorded cleanup obligation rather than deleting blindly.

Defaults in `scripts/local/cleanup-policy.json` are 15-minute jobs, 4 GiB memory,
128 processes, 4 GiB temporary files, 20 GiB minimum disk free, three 10 MiB
log files and fourteen-day generated-log retention. Failed disposable temporary
files have zero retention after evidence preservation. Explicit holds and
preserved artifacts are never automatically expired. Review retained evidence
periodically, without automatic deletion. This is process supervision, not an
untrusted-code security sandbox.

The runner records disk space before and after each job and flags changes of
512 MiB or more. JSON summaries, deletion logs and measurements are under
`.local-task-storage/`. Job arguments and process command lines are not stored.
Child environments omit API credentials unless explicitly named with
`--pass-env NAME`. Test output must still redact secrets.

## Docker ownership

Declare `--docker-resources` for jobs that create containers, networks or images.
Set all three labels on each disposable resource:

```text
io.xroga.cleanup.owner=XROGA_LOCAL_DISPOSABLE_JOB_V1
io.xroga.cleanup.job=<XROGA_CLEANUP_JOB_ID>
io.xroga.cleanup.disposable=true
```

The cleaner verifies local Docker Desktop's `desktop-linux` named-pipe endpoint
before engine calls. Remote contexts, unknown ownership and unavailable
inspection cause refusal. It never starts Docker Desktop.

Containers with persistent volumes or foreign mounts remain protected. Networks
must be empty. Images require exactly the task tag
`xroga-local-disposable-<UUID>:test`, matching labels, no registry digest and no
referencing containers. Image removal uses `--no-prune` without force, preserving
untagged parents and shared layers. Production, recovery and registry images
are excluded. New disposable containers should use bounded logging, for example
`--log-driver local --log-opt max-size=10m --log-opt max-file=3`.

No `system prune`, image prune, volume prune or shared builder prune is allowed.
Never remove persistent volumes or WSL disks. For builds, prefer the existing
source-pinned Cloud Build path, which avoids accumulating local image layers.
If local builds are necessary, establish a separately owned, bounded cache and
exact cleanup mechanism before creation. Do not run a global prune to make the
storage report look better. Existing shared caches require review.

## Linux, cloud and CI lifecycle

Use the existing execution and deployment scripts. Create task-owned temporary
directories, record resource identifiers before use, and put cleanup in
`finally` or EXIT/INT/TERM traps. Preserve source/image bindings and redacted
receipts first. Delete only exact task-owned resources after checking their
identity, active references and required recovery status. Record pending cleanup
after provider delays or forced interruption and verify it on resumption.
Cleanup is not authorization to destroy cloud resources, remove IAM or incur
charges outside the task's approved scope. Existing cloud approvals still apply.

## Existing waste

Audit exact paths and content before deletion, check tracked/ignored state,
uncommitted work, process use, reparse points and recovery dependencies. Deleting
verified ignored webpack binary caches does not authorize deleting their parent
project or accepted test evidence. Unknown archives, trading data, source,
personal files and credential material remain for owner review.

The October 25 laptop cleanup recovered 57.93 GB before this repository change.
That historical recovery must not be claimed again. Subsequent cleanup needs
its own before/after measurements and deletion receipts.

Official Docker behavior: [image removal](https://docs.docker.com/reference/cli/docker/image/rm/).
