# Xroga Project Check

A deterministic, read-only repository preflight. It inspects project metadata and configuration without executing repository scripts, reading secret values, uploading source, or enabling telemetry.

It reports build/test/type/lint declarations, dependency locking, deployment configuration, workflows, documentation, agent instructions, and environment-variable *names* declared in example files. It is not a security certification and does not prove that builds or tests pass.

## Use inside this repository

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
  - uses: ./.github/actions/project-check
    with:
      minimum-score: "75"
      fail-on-critical: "true"
```

## External use

After Xroga approves licensing and release policy, consumers must pin a reviewed full commit SHA:

```yaml
- uses: Xroga/xroga.com/.github/actions/project-check@FULL_COMMIT_SHA
```

Do not use mutable `main`. No `v1` tag or marketplace listing is claimed yet.

## Outputs

- `score`
- `band`
- `critical-count`
- `report-path`
- `badge-path`

The JSON report and SVG badge are written to the checked-out repository workspace. Uploading them is an explicit consumer decision.
