# Command 2 baseline — 2026-10-10

Starting branch: `feat/xroga-rich-response-cards` (clean, tracking origin); new review branch: `feat/xroga-os-command-2`. Command 1 lives on ancestor `feat/xroga-os-command-1-preview` / PR #791, and Command 1.5 on PR #792. Neither is merged to `main` at this baseline. The older `docs/xroga-ui-ux-step-2.md` is unrelated to this three-command OS prototype.

Existing preview routes: `/os-preview`, `/os-preview/journey`, `/os-preview/rich-results`, `/os-preview/[section]`, `/os-preview/founder`, `/os-preview/access-denied`. Command 1's journey has three deterministic fixtures and a local run, but no shared project-wide state. Its section pages were mostly honest Coming Soon screens. Existing Xroga `/workspace`, terminal SSE, rich result renderer, project store, backend execution, auth, billing and admin are outside Command 2 edits.

Founder boundary at baseline: the founder page is dynamic/no-store/noindex and server-checks `auth.getUser`, confirmed `hello@xroga.com`, server `owner` role and AAL2. Middleware protects the route. Diagnostics adapters are disconnected because broader existing admin APIs admit both `admin` and `owner`; this remains a gap for live founder-only diagnostics. Command 2 does not broaden access or connect them.

Deployment baseline: Vercel Git preview pipeline on PR branches. Command 1 PR #791 had a red `authenticated-browser` check at baseline, so no production promotion is presumed. The prior rich-card preview URL was verified for that prior commit only, not for Command 2.
