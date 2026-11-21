# Cloudflare Browser Run bounded compatibility receipt

Date: 2026-10-31. Scope: Batch 1.5 only. Production, microphone, Drive/R2 and canonical API/Job are unchanged. No model requests or new recurring resources.

## Account and single live probe

- Account `f14d36fd540c59ad410272122edc1a7e` Workers plans page showed Free as Current plan. No upgrade was performed.
- Before the probe, Browser Run Overview showed zero sessions and zero browser hours for October 1 through today, with one existing Quick Action request. These dashboard values are rounded historical usage, not a precise remaining-quota receipt. The published Free allowance is ten browser-minutes daily and three concurrent sessions.
- One Chromium Screenshot Quick Action was submitted in the authenticated Browser Run Playground for `https://example.com`, 10,000 ms page-load timeout, PNG output. The result was collected after a chat interruption without resubmitting. The page displayed an actual rendered PNG. No AI extraction was selected.
- Local evidence: `outputs/b15-cloudflare-20261031/cloudflare-public-probe.png`, SHA-256 `ef5bb397acfe8b96f2cd820e205b2d6d080311ea2c8dca700aa9103e0ca2d264`.
- This is a provider capability probe, not a Xroga run. There is no Xroga run ID, private Drive evidence object or verified browser cancellation/recovery result from this probe. Do not represent it as full activation, a CDP-session test, or a security PASS.
- No Worker script, VM, NAT, IP, queue, signing credential or production configuration was created or changed. No persistent browser session was intentionally acquired. Exact provider execution seconds are not exposed by the observed Playground result.

## Compatibility result

Basic Free-plan rendering: PASS. Full BrowserWorkerPort production acceptance: BLOCKED, not demonstrated.

The existing `backend/src/workers/egressProxy.ts` admits the target through the canonical public-address policy, checks every DNS answer, and pins the actual upstream connection to that admitted address. `containerBrowserWorker.ts` creates a private internal Docker network whose only permitted upstream is this job-scoped proxy. This prevents a browser from bypassing the proxy through another transport.

Cloudflare's documented session guardrails enforce an immutable hostname allowlist for HTTP/HTTPS. They are unavailable for Quick Actions. The reviewed public documentation does not establish Xroga-equivalent destination-IP pinning after DNS resolution or complete non-HTTP egress isolation. This is an unverified security guarantee, not evidence that Cloudflare has an exploitable vulnerability or that a secure adapter is impossible. Application-level Playwright URL interception alone cannot substantiate that guarantee.

The Outbound Workers API can route exact hostnames to a Worker Fetcher. It does not, by itself, prove every browser transport is forced through Xroga's pinned-address policy. A secure adapter must demonstrate that boundary before handling customer sessions, account credentials or consequential workflows. Suppressing page scripts or rendering pre-fetched HTML would narrow functionality and is not offered as completion of the founder's advanced-browser requirement.

Do not enable a URL-filter-only adapter to obtain a screenshot PASS. Do not change the security contract. The next compatibility prerequisite is a documented or demonstrated enforceable remote-browser egress boundary covering DNS rebinding and alternate network transports, followed by one reviewed BrowserWorkerPort adapter and the existing lease/authority/evidence acceptance path. Credentials and production rollout remain subject to existing scoped approvals. No paid-host request is generated from this gap.

## Duration and cost corrections

Cloudflare documents 60 seconds as the default inactivity timeout. Active CDP sessions have no fixed maximum lifetime, though restarts and quotas can terminate them. Therefore, long-running workflow feasibility depends on the shared Free quota, durable checkpoint/recovery integration and verified security, not a supposed one-minute absolute limit.

Incremental recurring infrastructure created: $0. Model spending: $0. The single probe ran on Workers Free without a plan change. No invoice-derived per-task figure or precise browser-seconds measurement is available, so neither is invented. Free quota exhaustion must fail or wait safely, never silently upgrade or invoke a paid fallback. Existing Google/R2/Supabase platform costs are unchanged.

## References reviewed

- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/cdp/playwright/
- https://developers.cloudflare.com/browser-run/features/guardrails/
- https://developers.cloudflare.com/browser-run/features/outbound-workers/
- https://developers.cloudflare.com/browser-run/stagehand/

Existing container implementation and all completed acceptance evidence are preserved. Batch 2 remains stopped. No full CI or completed Drive/storage checks were repeated for this documentation-only correction.
