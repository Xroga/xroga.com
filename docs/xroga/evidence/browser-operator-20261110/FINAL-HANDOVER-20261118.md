# Xroga Browser Operator: private build handover, 18 November 2026

Status: **review-ready, not production-certified.** Staging only. Nothing was published to the Chrome Web Store and nothing changed in production. The independent security review is not signed and was not self-certified.

## The build
| Item | Value |
| --- | --- |
| Source branch | `claude/ops-integrated-20261112` (draft PR #976, not merged) |
| Extension code | last extension source change `8a4a2222a`; branch head when built `b42499fb0` |
| Private package | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-8a4a2222a.zip` |
| ZIP SHA-256 | `4e3cf9a41638972e7fcf2057a96f3a31c30f8d1b2c833a9935f7e377aeca0ab6` |
| Extension | "Xroga Browser Automation (Staging)" 0.2.8, ID `ogebkgkppocnjeojdbkiokcpeaenonop` (fixed by the baked public key) |
| Installed copy | `C:\xr-review-builds\xroga-extension-staging-0ff582593`, manifest identical to the ZIP; press Reload on `chrome://extensions` to load it |
| Compatible backend | Cloud Run `xroga-api-universal-staging` (project `project-c40d4821-e647-4fa2-92d`, us-east4), revision `xroga-api-universal-staging-00128-doy`, image `xroga-api-release:lim18-1118`, tag `browser-op-1110`, 0 percent of traffic. Its `/health` "release" field is a stale environment value, not the image |
| Sandbox worker | Cloud Run `xroga-sandbox-worker` (offline stage, restricted-network stage and dependency acquisition were added by the sandbox session; see the audit file) |
| Model | DeepSeek V4.1 Flash 1017 through the existing route only |
| Tests at build time | extension typecheck clean, 1241 tests pass, 4 skipped (run in a clean worktree of the branch head); backend typecheck clean after commit `92d2913e1` (the sandbox merge had broken it); backend tests run: local browser (2 files), sandbox (3 files) all pass |
| Chrome version | the owner's own Chrome was used for the live runs; its version number was not captured. The automated benchmarks used Chrome for Testing 1234 (playwright) |

## Verified live (installed extension, real DeepSeek, staging backend; each one run unless stated)
- Real B2B lead hunt returning a table with exactly the verified rows and evidence, then exported with "Save as CSV" (the earlier 10-company run was marked as a failure of counting and fixed).
- Named Notion read, then a write with Deny, then Allow and read-back.
- Google Sheets create, fill and read back through the connected app; Sheets read with no approval card after the permission-store fix (37 s).
- Pause, Resume, Stop then follow-up; reopen of a result after 8 hours across a Chrome restart.
- A false "complete the payment" card on a "Book Now" link fixed in code and re-run.
- `run_repository`: a public repo (`mahmoud/boltons`) at its exact commit in the offline sandbox with real output.

## Verified by tests in a separate Chrome (fixture model, not the owner's browser)
- Three workers overlap (0.97x of one worker); five and six workers complete. See the reliability and fast-paths sections of `GAP-REGISTER-20261117.md` for the later overlap, service-worker-kill and Chrome-restart results.

## Fixed this session (root causes)
- Saved plugin permission choices never loaded (a plain preference was treated as a legacy credential), so every app always asked.
- `BROWSER_REQUEST_INVALID` from a 32-tool cap (now 64, with task-relevant selection from the fast-paths work); the server now names the failing field.
- Backend typecheck broken by the sandbox merge.

## Known limits (not done, not verified, or blocked)
- Security review: not signed. Must cover the Composio and sandbox egress, the permission and Full access changes, the controlled dependency stage, and the desktop bridge RFC.
- Full access switch (Plugins panel and chat bar): built and saved on staging; the per-app setting is verified; the account-wide switch's effect was not re-run live. Sending, publishing, deleting and payments keep their approval.
- Speed: the 4-contact Sheets task took 52.5 to 62.6 s and 3 to 4 turns, so the 60 s and 3-turn target is not met together.
- Two-account isolation, a PDF reader, repos needing CLI tools or Agent Skills or multi-repo plans, patch and artifact delivery in Workspace, media and video work, rich-editor writing cases, upload acceptance on a real site, and the desktop bridge (design only, `security/rfcs/RFC-DESKTOP-BRIDGE.md`) are not built or not verified.
- The test sessions trashed seven "Xroga speed test N" Google Sheets in two Drives (moved to Trash, recoverable about 30 days). Test users and an allowlist change made by the reliability session must be removed by that session; confirm `XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS` is the owner's accounts only.
- Production has the same permission-store bug and has not been changed.

## Rollback
- Extension: load the previous ZIP, `xroga-browser-operator-staging-0.2.8-03bcc736f.zip` (checksum in its `.sha256`), or `...-8a8f67c3d.zip`; Reload on `chrome://extensions`. The ZIPs do not touch other extensions.
- Backend: move the test tag back, `gcloud run services update-traffic xroga-api-universal-staging --project=project-c40d4821-e647-4fa2-92d --region=us-east4 --update-tags browser-op-1110=xroga-api-universal-staging-00125-mur` (image `lim17-1118`). Production serves nothing from this branch.
- Permission setting: delete the account-wide row `provider = 'xroga_plugin_permission_policy'` for a user in `user_integrations` to return to the default (low risk).
