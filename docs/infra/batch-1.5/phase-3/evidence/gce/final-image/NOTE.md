# Final-image Compute Engine run (2026-10-25)

Two temporary VMs in us-central1-a (e2-standard-2 amd64, t2a-standard-2 arm64), `--max-run-duration 1h`, no service account, SSH from the founder's single address only.
Source on the VMs: `744067de` (clean tree), with the release images built on each host. Deleted after about 30 minutes; readback showed no instances, disks, addresses,
firewall rules, subnets or networks left from this run.

| Folder | Content |
|---|---|
| `<arch>/phase3-host-<ARCH>_FINAL_IMAGE-*` | image build records, AI-mode DevTools attack battery (PASS), workflow suite (receipts, log, SHA256SUMS) |
| `<arch>/host-evidence-*` | W11/W14 host battery on the final image, judged by the unchanged evaluator: HOST_ACCEPTED 32/32 on both |
| `<arch>/w09-rerun-*.json` | W09a/W09b rerun at `37069f73` (see below) |

Two things happened that the receipts show and that are not hidden:
1. The suite's host-battery step used a label the collector does not accept (`*_FINAL_IMAGE`), so `phase3-host-*/host-battery.log` ends with `unknown label` and `exit=2`.
   The battery was run again with the accepted labels (`AMD64_HOST_TESTED`, `ARM64_HOST_TESTED`); those results are the `host-evidence-*` folders.
2. On arm64, W09a failed once: the job finished in 877 ms, before the test's 1.2 s injected crash, so no crash happened and it completed on attempt 1. This was a timing flaw
   in the test, not in the product. `37069f73` adds a 3 s pause step so the crash always lands mid-job. W09a and W09b then passed on both VMs and locally.
   amd64 passed W09a in the original run.

PRODUCT-009 is NOT_TESTED in these runs on purpose: the Composio key was not copied to the VMs. It passed on the local Docker host (`../../local/product-009-LOCAL_DOCKER.json`).
Only `OPENROUTER_API_KEY` and the R2 token file were copied to the VMs and shredded before deletion.
