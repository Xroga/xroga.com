# Xroga Browser Automation installation

Install Xroga Browser Automation from its verified Chrome Web Store listing once the pilot opens. Open the Xroga side panel on an HTTPS website and select Connect Xroga Workspace. Sign in with your existing Xroga account in the tab that opens. When the side panel says Signed in to Xroga, you can close that tab.

Enter a task in the side panel. Chrome runs the browser actions locally and the Xroga API meters model turns to your account. Review approval prompts before continuing with consequential actions. Use the side panel's Sign out button to revoke this Chrome installation's access. To switch accounts, sign out there first, select the other account in Workspace, then reconnect.

For an operator-provided test ZIP, extract it, open chrome://extensions, enable Developer mode and select Load unpacked. Choose the extracted folder containing manifest.json. Check the displayed extension ID against the operator's approved test ID before connecting. Use the same folder for updates and select Reload in Chrome. The QA signing identity is separate from the store listing.

## Release configuration

- Verify the Chrome Web Store item ID and obtain its public manifest key from the item dashboard. Set WXT_XROGA_EXTENSION_PUBLIC_KEY and WXT_XROGA_EXPECTED_EXTENSION_ID together for keyed test packages. The build checks the key against the expected ID.
- Pin that ID in both the Workspace XROGA_CHROME_EXTENSION_ID and API XROGA_LOCAL_BROWSER_DEVICE_EXTENSION_ID. Configure the exact API origin for a Preview build with WXT_XROGA_BROWSER_API_ORIGIN and retain the existing server-side eligible-user list.
- Apply the additive device-session migration to a disposable staging database and verify the backend's PostgreSQL role. Then test the pinned Chrome package, matching Workspace build and scoped API together. Keep production disabled until authenticated and provider-backed acceptance passes.
- The first connection uses the existing Workspace session. The extension exchanges a one-use proof-bound code for a device credential. The credential can renew five-minute browser-only access for at most 30 days. Device secrets are stored only in trusted extension storage, and the database stores their digests. The extension uses the same canonical run and ledger endpoints after the Workspace tab closes.
- Roll back standalone access by removing XROGA_LOCAL_BROWSER_DEVICE_EXTENSION_ID. This denies new exchanges and existing device requests and interrupts revalidation on active model turns. Keep the additive table for audit and allow the previous release to keep its existing Workspace pairing path.
