# Xroga Browser Automation

This unpacked Chrome extension runs a bounded page-reading task in the user's active tab. The panel interprets a small set of English requests locally. Chrome grants temporary tab access when the user invokes the toolbar action. The user reviews the site and requested fields before any content is collected.

## Try it in Chrome

1. Open `chrome://extensions` in Chrome 123 or newer and turn on Developer mode.
2. Choose **Load unpacked** and select the `chrome-extension` folder from this checkout.
3. Open an HTTPS page, then click the **Xroga Browser Automation** icon in Chrome's Extensions menu. You can pin it to the toolbar.
4. Enter `Collect the page title, headings and links`, choose **Review task**, then **Read this tab**. The results appear in the panel. Use **Clear** or close the panel to discard the report.

Supported requests collect the title, visible headings, and visible link labels and destinations. They can combine those fields in any order. Link destinations are plain text with queries and fragments removed. Browser pages, common local hostnames and IP literals are outside this prototype's scope. There is no public installer yet.

## Execution and release boundary

The extension uses Manifest V3, `activeTab`, `scripting`, and `sidePanel`. It has no persistent host permissions, injected scripts on page load, remote control channel, or extension network calls. A reviewed task is tied to its tab, exact URL and top-frame document. Report data stays in panel memory. The scan skips form content, editable and hidden controls, and iframes. Visible page text can still contain sensitive information, so users should review the active page before granting access. Stop discards an in-flight result. A reload or navigation requires renewed review.

This milestone does not call a model or run a cloud browser. A future AI planner would still have inference costs. It must use Xroga's existing authenticated planning and accounting, with scoped consent before sending any browser data. The local executor must accept only validated operations. For Meta Ads, start with reading and preparing a draft in a test account. Before adding an automated publish or spend action, enforce the existing canonical approval for the exact account, campaign, budget and action, and verify the result with a real receipt. Keep browser sessions and site credentials in the user's Chrome profile.

Public Chrome Web Store release is a separate gate. Review the store privacy disclosures, permission justifications, final package and independent install proof. Uninstall the extension from `chrome://extensions` to roll back this unpacked version.

## Verification

Run `node --test tests/chrome-extension/task.test.mjs` from the repo root. The browser check uses the repo's Playwright version with its full Chromium browser. Run `npx playwright install chromium --no-shell` if that browser is missing, then `node tests/chrome-extension/browser.mjs`. On Windows, run these through the repository's bounded local runner as described in the [cleanup policy](../docs/xroga/LOCAL_STORAGE_CLEANUP.md).

The development check also passed in desktop Chrome 156.0.8078.81. It verified the real toolbar and side-panel opening, exercised the same panel code on an isolated HTTPS fixture, and checked cancellation, expired document access, cross-origin denial and zero model calls.
