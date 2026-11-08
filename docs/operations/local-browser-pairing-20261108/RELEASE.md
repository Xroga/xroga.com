# Xroga local Chrome pairing release

Preparation only. Production currently serves API revision `xroga-api-zurelay-171595-serving-1105`. The Workspace pairing request opens a page, then the local-browser session endpoint returns HTTP 404 because that revision does not mount the local-browser router. The extension cannot complete the signed-in handshake.

| Component | Candidate | Current or rollback |
| --- | --- | --- |
| Cloud Run API and canonical Job | `af9fea61d05720051d748ca0f134bee002d7a65b` | `1715953a6f1c2310e23e3437613a2bdaf70d41ff`, image digest `sha256:5589445fd1c6ed356cb08aa966be0bebb97eb50a6145e766f3e86717e8040def` |
| Vercel Workspace | `bf63f4cfbb8f4c4a4688f53bb3f141c940d53b18` | `ed184815660b6df118bce329f97f0fb44741eb05`, GitHub deployment `7634272908`, Vercel deployment `xrogaai-jy2wdenti-xrogas-projects.vercel.app` |
| Chrome extension | 0.2.2 | Installed 0.2.1 can pair when its extension ID matches the release setting. 0.2.2 adds connection feedback. |

The API patch was based on the live backend and has no model pacing or schema changes. The Workspace patch adds the pairing component to the recorded Vercel source and preserves the existing workspace and voice implementation. Reconfirm the current Vercel alias before release because its source can change independently. If a newer release exists, compare and preserve its source before seeking any changed approval.

## Requested scope

Use project `project-c40d4821-e647-4fa2-92d` in `us-east4`, existing API `xroga-api`, Job and queue `xroga-canonical-production`, registry and existing runtime identity. Use the existing approved provider credential and budget ledger. No new service, secret, IAM, queue, DNS, schema, key or pacing change. Preserve voice tags and routes.

On the API only, set `XROGA_LOCAL_BROWSER_ENABLED=true` and set `XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS` to one verified, existing Xroga account UUID selected for this release. Resolve that UUID from the authenticated account without logging the session token or creating a user. Empty allowlists deny access. On Vercel, set `XROGA_CHROME_EXTENSION_ID=bpdcghljamjjealljgpljpfciikkhfcm`, after rechecking the installed ID in Chrome. The feature expects the exact extension ID, paired tab, unexpired challenge and authorized session.

Requested ceilings are $0.50 one-time Google usage including one source-pinned build and a short private readiness check, $0.10/month image retention, and one read-only acceptance task at no more than $0.036 in existing model balance. No automatic retry or outside website writes. Maximum maintenance is 60 minutes. Start only with exact-source gates and an approved release window.

## Read-only observations

The production database has `browser_runs` with RLS and the cancellation column, and the existing model pacing function. The fence pointed to `1715953a6f1c2310e23e3437613a2bdaf70d41ff` and zero canonical deliveries were undrained when checked. Recheck both immediately before opening a window. The API and Job currently use the same pinned image. A request to the current local-browser session path returns HTTP 404 and an existing protected browser endpoint returns HTTP 401 when called without credentials.

## Release and recovery

1. Check API/Job source and digest, the live Vercel alias, registry retention, available billing ceilings, the enabled account, and the installed extension ID. Confirm a fresh recovery point. Finish exact-source CI and isolated authenticated staging before live cutover. Test both authorized and denied accounts and the real signed-in pairing result. Existing local Chrome, JWT and PostgreSQL evidence does not substitute for this gate.
2. Build the candidate from the exact commit once and verify the baked source SHA and immutable image digest. Prepare a zero-traffic candidate with startup reconciliation disabled. Verify the authenticated private candidate, including an API request without a token returning HTTP 401. Record the same API and Job image, exact runtime config and old targets. Preserve both the old serving revision and the original Job configuration.
3. Apply `01-pause-current.sql` to the existing singleton in production Supabase project `nzenxdfumxrnsmybazmo`. Drain canonical deliveries naturally. Keep admission closed while switching the existing API and Job to the same verified source and digest. Preserve current queue, tags, routes and unrelated environment settings. When the serving pair passes private readiness and the drain check, apply `02-open-pairing.sql`.
4. Promote only the exact Vercel deployment with the checked extension ID. From the installed extension in the same Chrome profile, connect as the approved existing account. Require a visible Workspace connected state, stripped pairing parameters, a successful authorized session response, and rejection outside the allowlist. Complete one read-only synthetic browser task and reconcile its actual provider receipt with the canonical ledger. Recheck existing chat and microphone routing. Stop on unknown accounting, another source promotion, readiness regression, or timeout.
5. Roll back the frontend to its preserved Vercel deployment. If the candidate fence is open, apply `03-pause-pairing.sql`. If admission is already paused, verify it remains closed. Drain new canonical work, then restore the preserved API revision and the original Job. Verify compatible source/digest parity and private readiness. Apply `04-restore-current.sql` only when the old pair is healthy and the fence is paused and drained. Leave the extension gated if staging or acceptance fails. Retain task evidence and ledger history.

## Current verification

- The extension package is built from `0a446cd991853265506fa0678bd480d20b208e08`. Version 0.2.2 ZIP SHA256 is `cfa0b5e3ea87a632a3e7fc24f6fb0f0eba9de8a5de67f1e861a891175aaa7499`. Update the existing unpacked extension directory in place so Chrome keeps the pinned extension ID.
- The installed extension was exercised in real Chrome against a disposable fixture serving the actual Workspace bridge. The tests covered HTTP 404 feedback, successful reconnect, allowed form submission, cancellation and dictation. No hosted model or live website was called.
- The API tests used signed test accounts through the actual authentication middleware and covered pairing, owner denial, document parsing and cancellation. Exact-source strict egress inventories passed locally with 150 reviewed API callers and 155 reviewed frontend callers, zero pending in each. This does not certify production tenant acceptance.
- The four final, source-pinned SQL files passed pause, wrong-source rejection, undrained-delivery rejection, switch and rollback in a scratch PostgreSQL 18 database. The scratch database was removed.
- Exact API candidate [build](https://github.com/Xroga/xroga.com/actions/runs/42471545310), [unit](https://github.com/Xroga/xroga.com/actions/runs/42471548584) and [tenant security](https://github.com/Xroga/xroga.com/actions/runs/42471552018).
- Exact frontend candidate [build](https://github.com/Xroga/xroga.com/actions/runs/42471546494), [unit](https://github.com/Xroga/xroga.com/actions/runs/42471549394) and [tenant security](https://github.com/Xroga/xroga.com/actions/runs/42471553043).

No production change or paid model request has been made. An authenticated staging or guarded candidate check must confirm that the existing runtime identity can open the existing PostgreSQL connection through the protected production configuration. Pairing alone cannot establish database connectivity or model execution. Stop if a new secret, database permission, Preview callback or unapproved environment change would be needed.
