# RFC: owner-approved desktop bridge for local files and desktop apps (design only)

Status: design, 18 November 2026. Not built. Needs an independent security review before any code is written or activated.

## Why this exists
The Chrome extension can act inside the user's signed-in Chrome and on files the user selects in Chrome (the attachment button, a file picker the user answers). It does not have, and must never claim, access to the rest of the computer. Tasks such as "edit the project in my Documents folder", "open this in the desktop video editor" or "save the export to my desktop" need an explicit, separately installed bridge that the owner approves. This RFC states what that bridge must be so it can be built safely, and what must not be built.

## What the extension already does without a bridge (verified or tested in code)
- Files the user attaches in the panel: text, CSV, images, and (new, `src/store/office.ts`) `.xlsx` and `.docx` read into text with unit tests including a zip-bomb limit. PDF, old `.xls` and `.doc`, and PowerPoint are refused with a stated reason.
- Uploading an attached file into a site's file input (`src/browser-control/core/tools/upload.ts`, bytes set through a DataTransfer, read-back of the input's file list).
- Downloads and exports through Chrome's downloads API with a size and content check (`confirm_download`, `save_file`).

## Design
1. Component: a native-messaging host, `com.xroga.desktop_bridge`, installed by a signed installer the owner runs. Its manifest lists only the Xroga extension ID in `allowed_origins`. No other extension or web page can talk to it.
2. Grants, not ambient access: the bridge starts with no access. The owner adds a directory (or one file) through an operating-system folder dialog run by the bridge itself, never by the extension or the model. Each grant has an id, a canonical path, a mode (read, or read and write), an expiry, and a label. Revoking a grant, or "revoke all", is one click in the bridge's own window and takes effect immediately.
3. Operations: list, stat, read (chunked, size-capped), write and copy inside a grant. No process execution, no shell, no registry, no clipboard, no screenshots, no keystroke injection and no other-application control in the first version. Desktop-app control is a separate later RFC.
4. Path safety: every path is canonicalized and must stay inside a grant after resolving symlinks, junctions and `..`; reparse points that leave the grant are refused; reads and writes use a handle opened on the canonical path (no check-then-use gap); device names and alternate data streams are refused.
5. Consequential changes: writes outside a scratch folder created for the task, overwriting an existing file, and deleting need an approval card that shows the exact path and a content summary. The model's text never grants permission. Delete is a move to a bridge-owned trash with a retention period, not a permanent delete.
6. Audit: an append-only local log (time, grant id, operation, canonical path, size, a hash of the content, run id) with a hash chain, viewable by the owner and exportable. Content is not logged.
7. Limits: per-operation and per-run byte caps, a rate limit, and a visible indicator that the bridge is active. No network access from the bridge; it never uploads anything. Data goes to the extension only, and from the extension only to a destination the task needs and the owner approved (the same data-egress checks as for connected apps).
8. Identity and update: the installer and updates are signed; the bridge refuses to run unsigned updates; its version is reported to the extension, which refuses to use a version below a minimum.
9. Prompt injection: file contents and file names are data. They never create or widen a grant, and text read from a file cannot trigger a write outside the approved scratch folder without a card.
10. Multi-user and multi-profile: a grant belongs to one operating-system user and is tied to one Xroga account; switching account in the extension suspends the grants until the owner re-approves.

## Must not be built
Silent file access; a bridge that accepts commands from a web page; remote control of the computer; grants chosen by the model; credentials, password-manager, browser-profile or system-settings access; broad "full disk" access.

## What the independent review must cover
Native-messaging origin binding, installer signing and update channel, path canonicalization on Windows (junctions, reparse points, short names, alternate data streams, UNC paths), handle-based access, the approval-card integrity (what is shown equals what runs), the audit log's tamper resistance, revocation, behaviour when the extension is compromised, and the denial-of-service limits.

## Test plan once approved
Unit tests for path canonicalization with hostile paths; a competing-process test that swaps a directory for a junction between check and use; revocation during a transfer; an end-to-end run in a separate Chrome profile with a throwaway directory; a user-visible audit trail check.

## Status
BLOCKED pending independent security review. Nothing here has been implemented, so no desktop capability may be described as supported.
