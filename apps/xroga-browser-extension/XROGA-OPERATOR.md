# Xroga Browser Operator

The default extension build uses the Nanobrowser agent and browser controller. Start a task in the Chrome side panel or from Browser Operator in the paired Workspace tab. Both paths use the same task execution and progress in Chrome. Browser actions execute on the device. Keep the paired Workspace tab open during a task.

## Development integration

Build with Node 24.11.0 or later and pnpm 10.34.7. Run `corepack pnpm install --frozen-lockfile`, `corepack pnpm type-check`, `corepack pnpm lint`, `corepack pnpm test`, and `corepack pnpm zip` in this package. The unpacked directory is `dist`. Use Chrome's Load unpacked option on the extensions page.

For an approved release environment, set `XROGA_CHROME_EXTENSION_ID` on the Workspace frontend to the exact extension ID. Set `XROGA_LOCAL_BROWSER_ENABLED=true` on its compatible backend only after the release gates pass. The pairing path is the top-level `https://xroga.com/workspace`. It requires a logged-in account, a one-use browser challenge, the tab that the extension opened for pairing, and the exact extension ID configured by the website. The browser service worker does not receive the account JWT or a provider key. Use a separate Chrome profile for a different Xroga account.

The browser operator uses the existing browser run table, execution leases and model dispatch ledger. Each provider turn is bounded and fenced before dispatch. The current code allows up to 12 turns in ten minutes, with a reservation ceiling of $0.003 per turn and $0.036 per run. Global budget and pacing rules still apply. A failed or ambiguous provider turn is not replayed. Reconnect and explicitly resume interrupted local work. The earlier run remains in the account's records with its original charges and can expire as interrupted.

Page observations are bounded and checked before sending to the existing DeepSeek model route. Screenshots are kept out of model turns until the exact route passes vision and privacy acceptance. Chrome's DOM and accessibility controls remain available. Classified writes ask before execution. Credentials, payment authentication and similar challenges remain under user control. Browser action receipts describe what this Chrome device reported. They do not independently certify an external transaction.

## Release checks

Use the isolated Chrome test to reproduce the two entry points with a deterministic model fixture and real browser actions. Run `node tests/chrome-extension/operator.mjs <playwright-package-path> <chrome-executable> [temporary-profile-parent]` from the repository root after building the extension. On Windows, pass a short, writable parent path for the disposable Chrome profile.

Before activation, verify authenticated staging with two users, one approved measured Zurelay tool-calling run, real cancellation and interruption, and the target site's approval and postcondition flow. Advertising and email publication require authorized test accounts and separate scoped consent. The development ZIP is for unpacked testing.

Rollback by disabling the backend flag and removing the Workspace extension ID. Disconnect or uninstall the Chrome extension to stop local tasks. The run and accounting records remain in the existing stores.
