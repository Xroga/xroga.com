# Xroga Browser Operator: Chrome Web Store readiness (engineering draft)

Status: **DRAFT for owner and legal review.** Nothing here has been submitted. Every claim below was checked against the built package
(`apps/xroga-browser-extension`, production-mode `wxt build`, version 0.2.8) or marked as needing a decision. Not a statement that the store will approve it.

## 1. Single purpose

User-authorized AI browser workflow automation: the user asks in plain language, Xroga operates the browser on their behalf in tabs they allow, shows what it does,
and asks before consequential steps.

## 2. Package facts (verified from the built manifest)

| Item | Value |
| --- | --- |
| Manifest version | 3 (service worker `background.js`, module) |
| Minimum Chrome | 125 |
| Extension-page CSP | `script-src 'self'; object-src 'self'; img-src 'self' data: https://logos.composio.dev; connect-src 'self' blob: https://api.xroga.com; base-uri 'none'; form-action 'none'` |
| Remote executable code | None. No `eval`, `new Function`, `importScripts` or remotely loaded scripts found in the source; CSP allows scripts from the package only |
| Network from extension pages | `https://api.xroga.com` only (plus Composio logo images) |
| Embedded provider secrets | None. The model is reached through the Xroga API with the signed-in account's device credential; no provider key is in the package |
| Workspace pairing | `externally_connectable` is limited to `https://xroga.com/workspace*` |
| Content scripts | None declared (pages are read through the debugger and scripting APIs on demand) |

## 3. Permissions and justifications

All of these are used by shipped source (each API appears in the product code, not only in tests).

| Permission | Why it is needed |
| --- | --- |
| `debugger` | The browser-control layer drives tabs through the Chrome DevTools Protocol: reading the accessibility tree, clicking, typing, uploads. Chrome shows its "started debugging this browser" bar while a task runs; this is expected and should be explained at onboarding |
| `tabs`, `webNavigation` | Open, switch and track the tabs a task owns and detect navigation so actions wait for real page state |
| `scripting` | Small helper functions in the page for state probes (visibility, hit tests) |
| `sidePanel` | The main control surface: task input, live activity, approvals |
| `storage`, `unlimitedStorage` | Conversation history, run checkpoints (so a task survives a browser or service-worker restart) and settings, kept on the device |
| `alarms` | Wake the service worker to settle or resume saved runs |
| `offscreen` | Audio capture for voice input and other work Manifest V3 service workers cannot do |
| `contextMenus` | "Ask Xroga" entries on selected text and links |
| `tabGroups` | Group the tabs a task opened so the user can see them |
| `downloads` | Save files Xroga produces and confirm that a download the task started really finished (`confirm_download`) |
| optional `notifications`, `downloads.open` | Tell the user a long task finished or needs approval; open a saved file. Requested only when used |
| Host access `https://*/*` | Xroga works on whichever site the user asks it to. Narrowing this would make the product unusable. **Review point:** the store may ask why this is not optional or per-site; the justification is the single purpose above, plus per-site "ask before acting" rules already built into the product |

**Open decision for the owner:** move `https://*/*` to optional host permissions requested per site. It narrows the install warning but adds a permission prompt before
the first action on each new site and needs a rework of how the debugger attaches. Not done.

## 4. User data handling (accurate as of this source)

- **Sent to Xroga's API (api.xroga.com) during a task:** the user's request, the page content the agent reads (outline or text, with sensitive fields masked by the
  layer), tool results and the run's model messages. The API forwards model messages to the model provider (DeepSeek through the Zurelay gateway) and records usage for billing.
  Connected-app actions go from the Xroga backend to Composio under the user's own connection.
- **Kept on the device:** conversations, run checkpoints, settings and workflow hints (sanitized guidance learned from verified runs; no typed values, no approvals, owner-scoped).
- **Screenshots:** redacted and kept local by default; the model receives only capture metadata on the current model route.
- **Never done:** selling data, ads, or use for anything outside the single purpose. (Owner and legal must confirm the matching privacy-policy wording; no privacy policy text was written or published here.)
- **Consent:** pairing with an Xroga account and the per-site approval cards are the consent points; a first-run disclosure screen that lists the above should be reviewed before submission.

## 5. Listing material needed (not produced)

Store name and description, 128 px icon (present in the package), 1280x800 screenshots of the installed side panel, a support URL and email, release notes for 0.2.8,
a published privacy-policy URL, and the developer-account two-step verification. These need owner action or owner-provided assets.

## 6. Release and rollback

- **Versioning:** manifest `version` 0.2.8 (store requires a higher version for each upload).
- **Update safety:** adding a permission that shows a new install warning disables the extension until the user accepts it; four such permissions were already made optional for that reason
  (`ui/manifest-permissions.ts`). Keep this rule for every release.
- **Rollback:** the store has no instant rollback; publish the previous package as a new, higher version. Keep the last released zip and its SHA-256 with its source commit.
- **Backend compatibility:** the extension's finish route uses `direct: true` for zero-model reads; a backend without that rule refuses such results (the run then shows "saved locally").
  Release the backend first.

## 7. Not verified

Chrome Web Store policy review (only the store can do it); install through the store's test channel; upgrade from a previous store version; Edge, Brave, Opera (shared Chromium code,
but side panel and debugger behaviour not tested there); Firefox and Safari (not attempted).

## 8. Review build and smoke test

Built from source commit `c1a36b89a` (production-mode `wxt build`, 34 files). Review package: `C:/xr-review-builds/xroga-browser-operator-0.2.8-c1a36b89a.zip`,
SHA-256 `8cf8d47b84ee7bfdad369dcb6cb5997ba1d9aae04066e1445e35dfe3811f50e0` (checksum file beside it). Smoke test in Chrome for Testing: the unpacked package loads, its
Manifest V3 service worker registers and the side panel page opens with the title "Xroga Browser Automation". This is a load test, not a store install, and not a
sign-in or task test of the production build (those ran on the staging build, see the gap assessment).
