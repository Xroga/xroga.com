# Xroga Browser Automation development preview

Use the Chrome toolbar icon on an HTTPS tab. Ask for its page title, headings, or links. Review the target and fields, then select **Read this tab**. The preview displays results on the device, does not persist them, and strips query strings and fragments from reported link destinations. The access grant is scoped to the active tab. Navigation or a document change invalidates the review. Cancel discards a pending review or suppresses a result still in flight.

The preview has no provider credential, browser model request, telemetry, account pairing, hosted browser, or access to browser cookies. Its permissions are `activeTab`, `scripting`, and `sidePanel`. The exact top-level `https://xroga.com/workspace` page can ask whether the extension is installed. The response contains protocol version and installation/pairing booleans only. It cannot read tabs, start a task, or establish an account session. No production Workspace feature is enabled by this package.

This is an unpacked development build. Model-assisted tasks, authenticated Workspace execution, persistent task history, and consequential actions are unavailable. Do not submit this preview as the complete browser automation product.

## Build and verify

Run from this package within the Xroga repository with Node 24.11.0 or later and pnpm 10.34.7:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm type-check
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm zip
```

In Chrome, open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked**. Select this package's `dist` directory. Open an HTTPS tab and click the Xroga icon. Remove the unpacked extension to roll back. There is no server state to migrate or revoke.

For upstream provenance and engineering fixtures, see [NOTICE](NOTICE), [LICENSE](LICENSE), and the upstream [README](README.md). The fixture build contains the full upstream side panel, model adapter, agent, and browser controller. Keep it in a disposable profile and use the local fixture provider. The preview ZIP excludes that code.

## Integration boundary

Xroga already registers `deepseek_v4_1_flash_1017` for Zurelay's `deepseek-v4.1-flash-1017`. The hosted `/api/browser/runs` admission flow and `browserModelDispatch.ts` require a server-owned job and current worker lease. The extension has neither today. Passing a browser-supplied job ID or provider token to that route would not establish authorization.

The next integration needs an authenticated, revocable device pairing and a local execution target in the existing scheduler. The server must bind the user, tenant, device, run and current lease before issuing any model request or accepting evidence. The Chrome extension must retain control of tab scope and revalidate exact account, site and action before a consequential write. Verify these boundaries with two accounts and interrupted or duplicate messages before enabling model-backed tasks. Keep the status-only path independent of any grant.
