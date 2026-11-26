# Xroga Browser Operator: handover, 19 November 2026

**Status: suitable for staging and for independent security review. Not approved for production.** No independent human sign-off exists. Production was not changed.

## Builds
| Item | Value |
| --- | --- |
| Branch | `claude/ops-integrated-20261112` (draft PR #976), head at handover `4ace2ac0d` plus this document |
| Extension | "Xroga Browser Automation (Staging)" 0.2.8, ID `ogebkgkppocnjeojdbkiokcpeaenonop`, source commit `1d106c0f0` |
| Private package | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-1d106c0f0.zip`, SHA-256 `829C730A6CC3B72621504E031A082EBE9C2B51BBB8D501DC79F09CE394966AC1` |
| Staging backend | Cloud Run `xroga-api-universal-staging`, revision `00145-git`, image `xroga-api-release:lim26-1119` (commit `4ace2ac0d`), tag `browser-op-1110`, 0 percent of traffic |
| Staging workspace | `https://xrogaaicom-git-claude-live-run-943-20261110-xrogas-projects.vercel.app` (branch `claude/live-run-943-20261110`) |
| Model | DeepSeek V4.1 Flash 1017 only |
| Tests at build | extension 1256 pass, 4 skipped, typecheck clean; backend typecheck clean, 162 tests pass in the touched areas |

## Implemented and verified live (installed extension, real DeepSeek, staging)
Lead hunt and CSV; Notion read and write with approvals; Google Sheets create, write and read; one chat-bar Full access switch (ON/OFF, per account); repository runs, multi-repo runs, skill inspection, `change_repository`; pinned package installs with licence report (isolated pip, re-run on the final revision: requests 2.32.3, exit 0, 16 s); PDF, Word, Excel and any-file attachments up to 25 MB, ten files; photo upload to a real site; two-account isolation in both directions (Google refused each cross-read with 403).

## Security work
- Self-review: `SECURITY-SELF-REVIEW-20261119.md`. Separate AI review (labelled AI evidence, not a human attestation) found 7 issues; 5 fixed or reduced, 2 recorded as open (see there).
- Fixes: the model cannot waive strong-copyleft licence review; fuller licence-spelling detection; `pip -I` in the network stage; more outbound, money and code-running words keep their approval card; device token checked before the 36 MB body is read; account-wide permission save order and exact prefix match.
- PR #997 CI diagnosis and a re-attestation package for the original reviewer: `docs/xroga/security/reattestation/PR997-CI-DIAGNOSIS-AND-REATTESTATION-20261119.md`.

## Checks on PR #997 (not fixed by design)
| Check | Cause | Status |
| --- | --- | --- |
| unit, integrated-candidate, disposable-policy-database | Frozen review record B1-P2-d068943836963a9c is bound to the hash of `oauthPkceStore.ts`, which #997 edits | Needs re-attestation by the original reviewer. Nothing was regenerated or edited. |
| structured-mission-policy | Commit `d7ce7def4` named by the voice mission is not an ancestor of `main` | Existing on `main`; owner of the voice mission must land or re-base. |
| unit on `main` itself | Stale generated `docs/xroga/current-state.json` | Existing on `main`; regenerate in a separate PR. |

## Genuinely unresolved
- Independent security review not done (egress stage, worker image and isolation, sandbox metering default off, `confirmBusinessAction`, tab ownership not verified by the reviewer).
- PDF parsing has no expansion limit or deadline (needs a worker thread or subprocess).
- Approvals are still decided by tool-name words, not a positive allowlist; the provider's read/write split is name-based.
- Sheets task still over the 60 s / 3-turn target (provider "restricted" tag on write tools and Google read-quota limit 429).
- Not built: image/video generation (no provider chosen), desktop bridge (RFC only), patch write-back to GitHub, start-then-poll for checks over 70 s, npm transitive licence gating.
- Test data left: the second account's "SECOND ACCOUNT PRIVATE" sheet, Notion pages N1 and N2, "Xroga lead test 2026-11-18", the "Xroga fallback test" paragraph. Four speed-test sheets were moved to the Drive trash.

## Needs external accounts or credentials
A named human reviewer; the original reviewer of the frozen records for #997; the voice mission owner; an image/video provider key and budget; Composio and Google accounts of any further test user.

## Owner decisions
Who reviews and signs; whether staging approval is enough or production is wanted; image/video provider and budget; whether to start the desktop bridge after its design review; the PR #922 direction (separate workstream, stale, conflicting).

## Rollback
- Backend: `gcloud run services update-traffic xroga-api-universal-staging --project=project-c40d4821-e647-4fa2-92d --region=us-east4 --update-tags browser-op-1110=xroga-api-universal-staging-00144-wew` (image `lim25-1119`, before the AI-review fixes), or `...-00143-fuh` (before the allowlist change). Production serves nothing from this branch.
- Extension: load an earlier ZIP in `C:\xr-review-builds\` (for example `...-d07eba59b.zip`) and press Reload.
- Permission setting: delete the account-wide row `provider = 'xroga_plugin_permission_policy'` for a user in `user_integrations`.
- Allowlist: remove user `7c67389a-4077-4005-9692-c34b5bfd4c6d` from `XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS` when the second test account is no longer needed.
