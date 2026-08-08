# Real generated-project execution, in the isolated sandbox

Not mocks. Every command below ran inside a disposable Fly microVM created by
`flyMachineSandbox`, against files generated for the run, with the machine destroyed
afterwards and `xroga-sandbox` confirmed empty each time.

This closes the gap M18 names: between *"the adapter emits the right command"* and *"the
generated product actually builds and runs"*.

## Rust — `rust:1-alpine`

The §58 A fixture: a CLI converting CSV to JSON.

```
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
PROOF_ARTIFACT_PRESENT
PROOF_OUTPUT=[{"name":"Ada","city":"London"}]
PROOF_MISSING_EXIT=1
PROOF_BAD_EXIT=1
exit=0
```

`cargo test` ran the unit tests, `cargo build --release` produced a binary, and the binary
was executed against a real CSV. Both error paths were exercised: a missing file and a
ragged row each exit non-zero, which is the §17 CLI acceptance criterion rather than an
assertion that the happy path works.

`cargo fmt --check` reported rustfmt was not installed in the image. It is declared
`optional: true` by the Rust adapter and correctly did not fail the run — the design
decision that a missing linter must not fail a build that compiles and passes its tests,
observed working rather than argued for.

## Python — `python:3.12-alpine`

The §63 mandatory vertical slice: FastAPI with SQLite, CRUD, validation and tests.

```
5 passed in 0.80s
PROOF_ROWS=2
exit=0
```

Dependencies installed from `requirements.txt` under `registry-only`. The five tests cover
create-and-read, a 422 on an empty title, a 404 for a missing task, deletion returning 204
then 404, and a SQL-injection payload stored and returned as literal text.

`PROOF_ROWS=2` is read from the SQLite file after the suite, so persistence is verified by
querying the database rather than by trusting the API's response.

## Go — `golang:1-alpine`

An adapter added in this continuation, chosen because its toolchain is compact.

```
PROOF_VET_OK
PROOF_ARTIFACT_PRESENT
PROOF_OUTPUT=Hello, Ada!
PROOF_EMPTY_EXIT=1
exit=0
```

`go vet`, `go test ./...`, `go build`, then the binary run against real input and against
whitespace-only input to exercise the error path.

## Node — `node:20-alpine` (the sandbox default)

```
PROOF_TEST_EXIT=0
# tests 2
# pass 2
# fail 0
PROOF_OUTPUT=hello-world
PROOF_RUN_EXIT=0
exit=0
```

Re-run after the first attempt piped `npm test` into `grep`, which made the pipeline report
grep's status instead of the suite's. That is exactly how a failing suite can look like a
passing step, so the exit code is now captured directly with `> file 2>&1; echo $?` and the
first result was discarded rather than reported.

## Leak check

`machines_remaining=0` after every run. `xroga-sandbox` holds no machines, no IP addresses
and no volumes between executions, so the app costs nothing while idle.

## What this does not prove

The four ecosystems above. The other four adapters added in this continuation — JVM, .NET,
Dart/Flutter, PHP — emit commands and name images whose toolchains have not been executed
here, so they remain `implementation_available` rather than `sandbox_verified`.
