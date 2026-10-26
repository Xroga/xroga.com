# Native runtime dependency handoff

The actual native Docker flags reproduced a Python migration defect before the
repair. `pip install` succeeded as UID 65532, but the next offline container
raised `ModuleNotFoundError`. HOME was `/tmp`, a separate disposable tmpfs for
each command. The negative and positive JSON receipts bind the runtime source
by its LF-normalized SHA-256. Their output excerpts are bounded to 400 characters
per stream. Original complete receipts remain in the operator Cloud Shell.

The repair keeps HOME, Python user installs and Cargo cache inside the existing
bounded workspace. Fixed paths follow caller environment values. A fixed shell
wrapper creates the home with umask 077, preserves the image PATH and passes
the original command as arguments through `exec "$@"`. Command arguments are
never interpolated into shell source. Non-root execution, the read-only root,
resource limits, disabled network for verification and existing egress controls
remain in place. Existing explicit-path file transfer does not export this
dependency home automatically.

The positive real Docker run passed Python installation followed by a separate
offline import, and Rust offline fetch followed by a separate offline test.
Rust used a minimal dependency-free crate. This does not prove downloading
arbitrary registry dependencies. Both runs used digest-pinned official images,
synthetic files and no cloud resources, secrets or production data.

All owned containers, newly pulled images and temporary workspaces were removed
in both runs. No broad pruning or persistent-volume deletion was used. The
synthetic host directory was writable by the container UID for this test. This
is not evidence for the separate production workspace ownership policy.

The seven focused control tests pass locally, including an argv-injection
canary and fixed-path precedence. The workspace suite requires Linux descriptor
and symlink semantics. A Windows attempt was unsupported and is not counted as
a product failure or a passing test. The Linux rerun is recorded separately.

This correction changes shipped runtime source and therefore requires a new
source-pinned image. The previous successful integration evidence at
`87175d23c92e5bfa8d9167ea7361f9dae9f80311` remains valid for that exact tree.
Neither these tests nor the prior CI prove live Google Preview, background-job
dispatch or a completed production traffic switch.
