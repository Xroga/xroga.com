# Free-tier multilingual dictation, exact access and release scope

Status: AUTHORIZED by explicit founder reply on October 30, 2026. Token and exact secret version 1 created. Three public provider fixtures returned in 3.8-5.5 seconds. Release remains conditional on exact-source CI and authenticated acceptance, and is not yet deployed.

The existing Cloudflare account `f14d36fd540c59ad410272122edc1a7e` shows
**Workers Free, Active** on October 30, 2026. No upgrade is proposed. The model
is only `@cf/openai/whisper-large-v3-turbo`, accessed directly through Workers AI,
without AI Gateway logging, training, file storage or a paid provider fallback.

## Exact permission and credential

- Create account-owned token `xroga-voice-free-whisper-20261030` with only
  **Workers AI Read**, scoped to this one Cloudflare account. The provider calls
  this Read permission but it permits model inference. Cloudflare cannot restrict
  this token to one model. Xroga's server pins the Whisper model and destination.
- Expiry: January 28, 2027, 90 days. Record rotation responsibility in the handoff.
- Create Google Secret Manager secret `xroga-voice-cloudflare-token`, one active
  version, in project `project-c40d4821-e647-4fa2-92d`.
- Grant only `roles/secretmanager.secretAccessor` on that exact secret to existing
  identity `xroga-api-runtime@project-c40d4821-e647-4fa2-92d.iam.gserviceaccount.com`.
- Transfer the token directly from Cloudflare to this Google secret. Never place
  it in chat, Git, screenshots, command arguments, frontend code or plaintext files.
  Existing customer credential custody and the existing platform secret stay intact.

## Data and test boundary

Initially send only public English, Hindi and Urdu fixtures, at most three audio
minutes, to this Cloudflare account. Preserve request IDs, duration, transcript,
latency and comparison results. No customer recording is used in this test.

After security tests, exact-source CI and real provider checks pass, user-initiated
recordings may pass from Xroga's authenticated Google API to Cloudflare for
transcription. The editable transcript returns through the existing composer.
Send stays manual. Xroga does not persist raw audio or send it to paid models.

Cloudflare's standard inference policy commits to no training and no retention
after processing, with its documented legal/security exceptions. Operational
metadata can be retained. This is an explicit change from on-device-only audio.

## Production resources and operations

- Existing Google Cloud Run API `xroga-api`, region `us-east4`.
- Existing canonical Job `xroga-canonical-production` and queue of the same name.
  Keep the source-safe paired release procedure, startup-reconciliation guard,
  authority checks and current feature holds. Do not enable another batch.
- Build through existing CI, pin the resulting immutable image digest, and copy
  only that image to the existing Google registry if required by the Job.
- Add secret reference `CLOUDFLARE_VOICE_API_TOKEN` and non-secret configuration
  `CLOUDFLARE_VOICE_ACCOUNT_ID` plus `CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED=true`.
- Deploy a guarded zero-traffic candidate, validate readiness, then use the
  existing controlled API/Job cutover. No production SQL is required.
- Existing Vercel project `xrogaai.com`, team `xrogas-projects`. After API acceptance,
  set public configuration `NEXT_PUBLIC_VOICE_TRANSCRIPTION_MODE=cloudflare-free`
  and deploy only the verified voice source with the already-live mobile fixes.
- No new VM, Cloud Run service, GPU host, DNS, bucket, scheduler or paid plan.

## Costs and limits

- Model requests stay on Workers Free with its shared 10,000-Neuron daily limit.
  No paid overage or subscription upgrade is authorized. Quota errors must stay
  safe failures, with retained audio and manual Retry, never paid fallback.
- At the published Whisper rate, the whole otherwise-unused free allocation is
  about 214 audio minutes/day. Other Workers AI usage shares this allocation.
- Request a one-time ceiling of **$0.10** for required Google image-copy/readiness
  usage, and an incremental Google operating allowance of **up to $5/month**,
  within the founder's remaining existing funding allocation. Use credits first.
- The secret lists at about $0.06/month outside its free allowance. One roughly
  154 MB image lists at about $0.015/month before free allowance/deduplication.
  The larger variable item is Google outbound PCM/base64 traffic to Cloudflare.
  Costs depend on actual traffic and remaining shared allowances. No top-up or
  purchase of a model balance is included. These are approval limits, not claims
  that billing alerts are hard spending caps.

## Recovery and acceptance

Preserve API/Job image `sha256:49505ef989f3c686ca443d2fa6a7265175e35d7a8440f75c6b0773e2d5862888`,
serving revision `xroga-api-batch1-ca94-serving3`, source `ca94c2f8a813524e47f5f7abc868acb1618a1c45`.
Cloud Run's inherited source label is stale. Use the preserved image receipts and
actual health identity, not that label, as evidence of the serving source.

Preserve local-only voice frontend deployment `EVjZwevDSjMa97bZFqDXw8EwdYaV`, source
`98b87a7017e7d123b0baee33bfbbbeb15177e53f`, as a free-model recovery option.
Also retain the current live mobile frontend `GDQfXoD56rTugBVNyh2xhQMR2PtU`, source
`1e1ec970a5afc9a016ffb5974e6da463185f8007`. Never silently fall back to its historical
paid voice path. Restore a local-only frontend before rolling the API back.

Measure latency and accuracy, including a real microphone check, before claiming
acceptance. Five-to-six seconds is a target, not an established result. Physical
iPhone/Android/Safari testing is separate from desktop viewport tests. If provider
or release checks fail, preserve the healthy release and leave the new mode off.

## Official references

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
- https://developers.cloudflare.com/workers-ai/platform/data-usage/
- https://cloud.google.com/secret-manager/pricing
- https://cloud.google.com/artifact-registry/pricing
