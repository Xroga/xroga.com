# Xroga Browser Operator

Open the Xroga side panel in the Chrome profile you use for Xroga.com. The panel connects through your existing sign-in in a background Workspace tab and keeps your current page in view. If it asks you to sign in, use the same Chrome profile. Keep the connection tab open during a task.

Type a task in the side panel or start it from Browser Operator in the paired Workspace. The side panel uses its current HTTPS tab when allowed. A task without an eligible page starts on the search home page. A blue Xroga cursor shows where Chrome is about to click or type when page action indicators are enabled.

In Xroga Settings, save reusable workflows and custom instructions under Workflows. You can import a Markdown or text file, review the prompt, and save it for use from the composer with `/`. Tab groups and saving files are built in. Enable task notifications in Permissions if you want them.

Click the microphone to record. Chrome asks for access the first time. When you stop, the paired Workspace sends compatible PCM segments to Xroga's existing free transcription endpoint and inserts the completed text as an editable draft. Review the draft and send it yourself. The browser engine attribution and third-party licenses are in About and the packaged NOTICE.

## Development integration

Build with Node 24.11.0 or later and pnpm 10.34.7. Run `corepack pnpm install --frozen-lockfile`, `corepack pnpm type-check`, `corepack pnpm lint`, `corepack pnpm test`, and `corepack pnpm zip` in this package. The unpacked directory is `dist`. Use Chrome's Load unpacked option on the extensions page.

For an approved release environment, set `XROGA_CHROME_EXTENSION_ID` on the Workspace frontend to the exact extension ID. Set `XROGA_LOCAL_BROWSER_ENABLED=true` on its compatible backend after the release gates pass. Pairing defaults to `https://xroga.com/workspace`. An isolated build can use `WXT_XROGA_WORKSPACE_ORIGIN` to pin one exact Xroga Vercel Preview origin in the manifest and sender check. The selected Workspace must use the corresponding API. Pairing requires a logged-in account, a one-use browser challenge, the tab opened by the extension, and the exact extension ID. The extension worker does not receive the account JWT or the provider key. Use separate Chrome profiles for different Xroga accounts.

The operator uses the existing browser run table, execution leases, and model ledger. Short tasks get up to 48 turns and 40 minutes. A long prompt or attachments gets up to 100 turns and 90 minutes. The server may lower the turn ceiling with `XROGA_LOCAL_BROWSER_MAX_TURNS`. An interrupted model request pauses the task. Resume in the side panel to continue with the same server run ID, elapsed time, and spend. The $0.036 task ceiling and $0.003 per-turn ceiling still apply. An unsettled request retains the full per-turn allowance. Account budgets and pacing apply to every request.

Both interfaces accept up to five files at 2 MB each. Text and CSV or TSV files stay in Chrome storage. PDF, DOCX, and XLSX files are sent to the authenticated Xroga parser, which returns bounded text with page or cell references. The agent receives only relevant text and can page through longer files with `read_attachment`. Scanned and encrypted documents need a text export. Images are currently excluded from this path.

Page observations are bounded and checked before sending to the existing DeepSeek model route. Redacted screenshots can appear in local activity as evidence. The model uses text observations and receives no screenshot pixels. Classified writes ask before execution. Credentials, payment authentication and similar challenges remain under user control. Browser action receipts describe what this Chrome device reported. They do not independently certify an external transaction.

## Release checks

Use the isolated Chrome test to reproduce the two entry points with a deterministic model fixture and real browser actions. Run `node tests/chrome-extension/operator.mjs <playwright-package-path> <chrome-executable> [temporary-profile-parent]` from the repository root after building the extension. On Windows, pass a short, writable parent path for the disposable Chrome profile.

Before activation, verify authenticated staging with two users, a real Zurelay run settled by the hosted ledger, browser restart and re-pair, and each target site's approval and verification flow. Advertising and email publication require authorized test accounts and scoped consent. The development ZIP is for unpacked testing.

### Issue #939 acceptance checkpoint

Application source `89ef62ce` extends the existing Nanobrowser engine and canonical Workspace bridge. Pause leaves the original server run available. Chrome saves the final result before syncing it. If an action might already have gone through, recovery can inspect the site, but cannot repeat or dispatch another write in that run. Reopening or syncing does not reset the server's turn, time or spending limits. The follow-up blocks sending, editing, restarting or retrying in the same conversation while a checkpoint is unresolved, and keeps the unsent draft intact.

| Check | Status and evidence |
| --- | --- |
| Side panel and Workspace bridge | PASS in an isolated real Chrome 151 profile. Background pairing, approved form submission, public catalog research, document-driven tasks, cursor cues, local screenshot evidence and cancellation ran against fixtures. Workspace transport and the model were deterministic fixtures. |
| Recovery and account boundary | PASS in Chrome. Paused after the third model turn was admitted, then resumed the same server run. After losing the final acknowledgement and stopping the service worker, the original owner re-paired and synced the saved result. Another fixture account was rejected. Exactly one catalog click was recorded across recovery, and the result sync made no new model request. This was a service-worker restart, not a full browser or device restart. |
| Hosted API, DeepSeek and ledger | BLOCKED for release. The local route test covers owner binding, fencing, cancellation and storage. The current source has no new authenticated hosted run, no provider request or billing receipt, and no proof of the effective provider RPM. The isolated test cost $0 in model usage. |
| Authorized external workflows | BLOCKED for release. No disposable Cloud Run deployment, Meta Ads draft or client-discovery result was accepted on a real site for this checkpoint. Use named test accounts and explicit approval for provisioning, publication, spend or outreach. |
| Production compatibility | A local candidate, `e3d10e445ace3854e0912c1a4ec0b351ec26f558`, changes only `WorkspaceBrowserOperator.tsx` on the `da483f92` Workspace rollback source. It has not been deployed or passed exact-source release gates. The earlier `565bde32` stage would reintroduce a reverted sidebar release and must not be promoted. |

For the hosted gate, stage only the operator patch on the verified serving Workspace source and its matching API. Keep the installed extension ID stable, use separate authorized Chrome profiles, and verify both ownership and access denial before spending model credits. Run one bounded read-only task with the exact DeepSeek model, record the canonical run ID and ledger settlement, and verify pause, re-pair, cancellation and restart in that same run. Then test the authorized external workflows individually. No staged frontend should reverse an unrelated production rollback.

Rollback by disabling the backend flag and removing the Workspace extension ID. Disconnect or uninstall the Chrome extension to stop local tasks. The run and accounting records remain in the existing stores.
