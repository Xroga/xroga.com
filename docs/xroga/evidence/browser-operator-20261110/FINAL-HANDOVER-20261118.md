# Xroga Browser Operator: private build handover, 18 November 2026

Status: **review-ready, not production-certified.** Staging only. Nothing was published to the Chrome Web Store and nothing changed in production. The independent security review is not signed and was not self-certified.

## The build
| Item | Value |
| --- | --- |
| Source branch | `claude/ops-integrated-20261112` (draft PR #976, not merged) |
| Extension code | last extension source change `73a1b32f6`; branch head when built `d499425a5` |
| Private package | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-73a1b32f6.zip` |
| ZIP SHA-256 | `37ac9a12e69cf00c0871cf0d6d2dc1222cb644f9b564e5d37b4012d2ecdce677` |
| Extension | "Xroga Browser Automation (Staging)" 0.2.8, ID `ogebkgkppocnjeojdbkiokcpeaenonop` (fixed by the baked public key) |
| Installed copy | `C:\xr-review-builds\xroga-extension-staging-0ff582593`, manifest identical to the ZIP; press Reload on `chrome://extensions` to load it |
| Compatible backend | Cloud Run `xroga-api-universal-staging` (project `project-c40d4821-e647-4fa2-92d`, us-east4), revision `xroga-api-universal-staging-00141-mas`, image `xroga-api-release:lim24-1118` (commit `73a1b32f6`, including the repo-change deadline fix; earlier `00133-xup` was lim19, commit `d1552e9a2`; later commits on the branch touch only the extension and the sandbox worker), tag `browser-op-1110`, 0 percent of traffic. Its `/health` "release" field is a stale environment value, not the image |
| Sandbox worker | Cloud Run `xroga-sandbox-worker` (offline stage, restricted-network stage and dependency acquisition were added by the sandbox session; see the audit file) |
| Model | DeepSeek V4.1 Flash 1017 through the existing route only |
| Tests at build time | extension typecheck clean, 1249 tests pass, 4 skipped (run in a clean worktree of the branch head); backend typecheck clean after commit `92d2913e1` (the sandbox merge had broken it); backend tests run: local browser (2 files), sandbox (3 files) all pass |
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
- Full access: ONE control, in the chat bar (green "Full access: ON" or plain "OFF"); the duplicate switch and the per-app buttons were removed from the Plugins panel, and turning the account-wide choice clears older per-app choices. Built and tested in code only; its click and effect were not re-run live after this change, and the xroga.com Workspace plugins page was not changed or checked. Sending, publishing, deleting and payments keep their approval.
- Speed: the 4-contact Sheets task took 52.5 to 62.6 s and 3 to 4 turns, so the 60 s and 3-turn target is not met together.
- Two-account isolation, a PDF reader, repos needing CLI tools or Agent Skills or multi-repo plans, patch and artifact delivery in Workspace, media and video work, rich-editor writing cases, upload acceptance on a real site, and the desktop bridge (design only, `security/rfcs/RFC-DESKTOP-BRIDGE.md`) are not built or not verified.
- The test sessions trashed seven "Xroga speed test N" Google Sheets in two Drives (moved to Trash, recoverable about 30 days). Test users and an allowlist change made by the reliability session must be removed by that session; confirm `XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS` is the owner's accounts only.
- Production has the same permission-store bug and has not been changed.

## Rollback
- Extension: load the previous ZIP, `xroga-browser-operator-staging-0.2.8-03bcc736f.zip` (checksum in its `.sha256`), or `...-8a8f67c3d.zip`; Reload on `chrome://extensions`. The ZIPs do not touch other extensions.
- Backend: move the test tag back, `gcloud run services update-traffic xroga-api-universal-staging --project=project-c40d4821-e647-4fa2-92d --region=us-east4 --update-tags browser-op-1110=xroga-api-universal-staging-00125-mur` (image `lim17-1118`). Production serves nothing from this branch.
- Permission setting: delete the account-wide row `provider = 'xroga_plugin_permission_policy'` for a user in `user_integrations` to return to the default (low risk).

## Update 19 November 2026
- PDF, Word and Excel attachments (up to 2 MB) go through the backend document reader in the product build; fixed this pass: PDF tables keep rows and columns, long PDFs are read up to 400 pages or 500,000 characters with a stop note, encrypted and image-only PDFs report a specific reason. Deployed to staging revision `00136-six`; not yet tried through a real file picker in the installed extension. No OCR.
- Agent Skills and multi-repo: the backend and the `run_repository` tool already supported `repositories`, `inspectSkill` and `dependencies`; the playbook now tells the agent about them. Dependency installs are not enabled on staging (the restricted-network setting is off), by design pending the independent security review. A live multi-repo run was not done: the Xroga test Chrome window was closed and the remaining windows are the owner's.
- Live (19 November, a new Chrome window in the owner's profile): two repositories in one sandbox run and an Agent Skill inspection both passed; details and the gap they exposed (the tool text did not show extra repositories' commits; fixed) are in `GAP-REGISTER-20261117.md`.
- change_repository passed live on this build (patch returned, verdict unverified because dotenv's own tests need a fixture, three durable ledger rows); see the register.
- PDF through the real file picker passed live (table rows kept; encrypted and image-only PDFs give specific messages); details in the register.
- Attachments: any file type up to 25 MB, ten per task; photo upload to a real site passed, a 5.6 MB PDF was read; details in the register.
