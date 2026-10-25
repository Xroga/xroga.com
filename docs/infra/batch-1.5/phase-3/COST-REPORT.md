# Batch 1.5 Phase 3: cost per verified browser outcome (BROWSER-10)

Formula (amendment §6): `allocated host CPU/RAM/runtime + network/egress + storage/operations + approved Stagehand model tokens`.
Every figure below is labelled **MEASURED** (from a receipt in this repository), **PRICE** (Google Cloud Billing Catalog API, fetched
2026-10-24 for us-central1, on-demand, USD) or **ESTIMATE** (modelled, not measured). Self-hosted Chromium and open-source Stagehand are not free: the host and the model are real costs.

## 1. Prices used (PRICE, Cloud Billing Catalog, service 6F81-5844-456A)
| SKU | Unit price |
|---|---|
| E2 Instance Core, Americas | $0.02181159 / vCPU-hour |
| E2 Instance Ram, Americas | $0.00292353 / GiB-hour |
| T2A Arm Instance Core, Americas | $0.0249 / vCPU-hour |
| T2A Arm Instance Ram, Americas | $0.0034 / GiB-hour |
| Balanced PD Capacity | $0.10 / GiB-month |
| External IP on a standard VM | $0.005 / hour |

| Host (as tested) | Compute | + 20 GiB disk | + external IP | Total per hour | Per 30-day month |
|---|---|---|---|---|---|
| e2-standard-2 (2 vCPU, 8 GiB, amd64) | $0.0670 | $0.0027 | $0.0050 | **$0.0747** | $53.8 |
| t2a-standard-2 (2 vCPU, 8 GiB, arm64) | $0.0770 | $0.0027 | $0.0050 | **$0.0847** | $61.0 |

## 2. Measured runtime per verified outcome (MEASURED, W15 rerun on the release image, commit `1857158c`)
Evidence: `evidence/gce/w15-rerun-AMD64_HOST_TESTED.json`, `evidence/gce/w15-rerun-ARM64_HOST_TESTED.json`.
The plan is a real four-step job: click to page 2, wait for the URL, extract 10 quotes, screenshot to Drive with read-back SHA-256, postconditions judged by the backend.

| Host | Runs | Verified | End-to-end p50 | p95 | Browser time in container p50 | Peak browser container RAM | Peak proxy RAM | Retries | Startup failures |
|---|---|---|---|---|---|---|---|---|---|
| amd64 e2-standard-2 | 11 (8 sequential, 3 concurrent) | 11 | 4.04 s | 9.34 s | 1.28 s | 147 MiB | 14.8 MiB | 0 | 0 |
| arm64 t2a-standard-2 | 11 (8 sequential, 3 concurrent) | 11 | 2.68 s | 5.21 s | 1.00 s | 198 MiB | 14.8 MiB | 0 | 0 |

Sampling note: the sampler polls `docker stats` every ~0.25 s and a browser container lives about one second, so only 4 (amd64) and 3 (arm64) of the 11 browser containers were caught. The peaks are a lower bound on true peak RAM. The first GCE run used a synchronous sampler that blocked the test process and under-sampled; it is kept as evidence but superseded for these metrics.

## 3. Cost per verified outcome
| Component | amd64 | arm64 | Label |
|---|---|---|---|
| Host time, one job at a time (host $/h × p50 end-to-end) | $0.000084 | $0.000063 | MEASURED duration × PRICE |
| Host time, 3 concurrent jobs (2 vCPU host; RAM headroom allows more) | about $0.000028 | about $0.000021 | ESTIMATE |
| R2: one PUT (Class A, $4.50 / million) + one read-back GET (Class B, $0.36 / million) | $0.0000049 | $0.0000049 | PRICE (Cloudflare R2 public list price) |
| R2 storage: about 0.1 MB screenshot at $0.015 / GB-month | $0.0000015 per month retained | same | ESTIMATE (size from W02/W15 artifacts) |
| Egress | requests and page loads are inbound (free); outbound bytes per job are a few KB of HTTP requests | same | ESTIMATE, not metered per job |
| **Deterministic outcome, total at full utilisation** | **about $0.00009** | **about $0.00007** | |
| Stagehand model tokens per AI outcome | about $0.0009 (W03) | same | MEASURED |

Utilisation dominates. An always-on host costs $53.8 (amd64) or $61.0 (arm64) a month whether it runs one job or a million. At 10,000 outcomes a month the host is about $0.005 per outcome. At 100,000 it is about $0.0005. The marginal figures above are the floor.

## 4. Model cost (Stagehand AI steps)
Route: Xroga's canonical model routing (`resolveEndpoint`) and ledger (`providerBudget.ts`). The founder's existing OpenRouter key reaches exactly one model under
the provider policy, `deepseek_v4_flash` (`deepseek/deepseek-v4-flash`). GLM-5.3 Flash is bound to Zhipu by `providerPolicy.ts` and was not routed through
OpenRouter (founder decision 2026-10-25: use DeepSeek V4 Flash, no policy change). Every call is reserved before it is sent and settled with the provider's reported
usage; a call without reported usage is refused. The runner holds a hard run-wide cap of $0.50 and the OpenRouter key has its own $0.60 limit.

Final-source receipts (`evidence/local/final-suite-LOCAL_DOCKER.json`, source `d3b5f9c3`):

| Receipt | Calls | Input tokens | Output tokens | Measured cost (ledger) | Label |
|---|---|---|---|---|---|
| W03 Stagehand extract, observe, act on a real site | 4 | 8,326 | 740 | $0.000882 | MEASURED |
| W12e model extraction from the hostile page | 2 | 965 | 261 | $0.000134 | MEASURED |
| PRODUCT-001 planner (goal to plan) plus the planned run | | | | $0.000254 | MEASURED |
| MODELPROBE structured output plus tool call | 2 | | | $0.000037 | MEASURED |
| **Whole final suite** | | | | **$0.001307** | MEASURED |

Cost per AI-assisted verified outcome: about **$0.0009** in model tokens (W03, the heaviest plan) plus the host and storage floor from §3, so about $0.001 in total.

OpenRouter's own account of the key after every Phase 3 model run (including the two W03 runs that timed out before the fix, the diagnostic run and the two final-image suites on Compute Engine, about $0.0013 of ledger cost each): **$0.0022** used, $0.598 of $0.60 remaining.

## 5. Actual Phase 3 spend so far (cash vs credit)
| Item | Amount | Paid from |
|---|---|---|
| First pair of GCE VMs, up to 4 h each (auto-deleted at the limit) | at most $0.64 at list price | Google Cloud free-trial credit; $0 cash |
| Final-image pair of GCE VMs, about 0.5 h each (created 11:18 and 11:19 UTC, deleted 11:50 UTC 2026-10-25; readback: no instances, disks, addresses, firewall rules or subnets left) | about $0.08 at list price | Google Cloud free-trial credit; $0 cash |
| **Compute Engine total** | **at most $0.72 at list price** | credit |
| Cloudflare Worker testbed (workers.dev, free tier, no bindings) | $0 | free tier |
| Model tokens (OpenRouter, DeepSeek V4 Flash, all Phase 3 runs including both final-image GCE suites) | $0.0022 (provider-reported; $0.598 of the key's $0.60 remains) | the founder's existing OpenRouter balance |
| R2 test bucket (W07: a few Class A/B operations, objects deleted) | under $0.0001; inside the R2 free tier | free tier |

Final figures are restated in `BATCH-1.5-PHASE-3-FINAL-ACCEPTANCE.md` after teardown.
