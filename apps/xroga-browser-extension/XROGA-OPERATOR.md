# Xroga Browser Operator

The default extension build uses the Nanobrowser agent and browser controller. Start a task in the Chrome side panel or from Browser Operator in the paired Workspace tab. Both paths use the same task execution and progress in Chrome. Browser actions execute on the device. Keep the paired Workspace tab open during a task.

## Development integration

Build with Node 24.11.0 or later and pnpm 10.34.7. Run `corepack pnpm install --frozen-lockfile`, `corepack pnpm type-check`, `corepack pnpm lint`, `corepack pnpm test`, and `corepack pnpm zip` in this package. The unpacked directory is `dist`. Use Chrome's Load unpacked option on the extensions page.

For an approved release environment, set `XROGA_CHROME_EXTENSION_ID` on the Workspace frontend to the exact extension ID. Set `XROGA_LOCAL_BROWSER_ENABLED=true` on its compatible backend after the release gates pass. Pairing defaults to `https://xroga.com/workspace`. An isolated build can use `WXT_XROGA_WORKSPACE_ORIGIN` to pin one exact Xroga Vercel Preview origin in the manifest and sender check. The selected Workspace must use the corresponding API. Pairing requires a logged-in account, a one-use browser challenge, the tab opened by the extension, and the exact extension ID. The extension worker does not receive the account JWT or the provider key. Use separate Chrome profiles for different Xroga accounts.

The operator uses the existing browser run table, execution leases, and model ledger. Short tasks get up to 48 turns and 40 minutes. A long prompt or attachments gets up to 100 turns and 90 minutes. The server may lower the turn ceiling with `XROGA_LOCAL_BROWSER_MAX_TURNS`. The browser pauses after a stage of up to 32 turns. Continue or resume in the side panel to keep the same server run ID, elapsed time, and spend. The original $0.036 task ceiling and $0.003 per-turn reservation ceiling still apply. An unsettled request retains the full per-turn allowance. Account budgets and pacing apply to every request.

Both interfaces accept up to five files at 2 MB each. Text and CSV or TSV files stay in Chrome storage. PDF, DOCX, and XLSX files are sent to the authenticated Xroga parser, which returns bounded text with page or cell references. The agent receives only relevant text and can page through longer files with `read_attachment`. Scanned and encrypted documents need a text export. Images are currently excluded from this path.

Page observations are bounded and checked before sending to the existing DeepSeek model route. Screenshots are kept out of model turns until the exact route passes vision and privacy acceptance. Chrome's DOM and accessibility controls remain available. Classified writes ask before execution. Credentials, payment authentication and similar challenges remain under user control. Browser action receipts describe what this Chrome device reported. They do not independently certify an external transaction.

## Release checks

Use the isolated Chrome test to reproduce the two entry points with a deterministic model fixture and real browser actions. Run `node tests/chrome-extension/operator.mjs <playwright-package-path> <chrome-executable> [temporary-profile-parent]` from the repository root after building the extension. On Windows, pass a short, writable parent path for the disposable Chrome profile.

Before activation, verify authenticated staging with two users, a real Zurelay run settled by the hosted ledger, browser restart and re-pair, and each target site's approval and verification flow. Advertising and email publication require authorized test accounts and scoped consent. The development ZIP is for unpacked testing.

Rollback by disabling the backend flag and removing the Workspace extension ID. Disconnect or uninstall the Chrome extension to stop local tasks. The run and accounting records remain in the existing stores.
