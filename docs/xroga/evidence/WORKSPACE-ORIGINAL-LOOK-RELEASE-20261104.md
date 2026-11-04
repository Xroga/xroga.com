# Restore original workspace conversation presentation — 2026-11-04

## User-visible contract
- The signed-in workspace must retain the original compact chat presentation, not silently opt into the new whole-conversation typographic and composer styling.
- Preserve workspace toolbar controls (Project edits, Share, Team, appearance, fullscreen), user messages, theme preferences, AI response features, and the previously released mobile assistant inset.
- Preserve the live AI App Builder SEO changes.

## Change and evidence
- Exact verified production base: `115b98133048a75fae79013e3b35ac1548c2df9c`.
- Single source change: `frontend/src/components/terminal/SwarmMessageLog.tsx` requires `NEXT_PUBLIC_XROGA_WHOLE_CONVERSATION_V2=enabled` before selecting experimental whole-conversation layout; the rich `ResponseExperienceGate` remains independent.
- The opt-in environment variable is absent from this project's environment-variable names as inspected on 2026-11-04.
- Existing code's guest preview does not receive the authenticated whole-conversation layout; signed-in mode now follows the same legacy message-shell path unless explicitly opted in.
- `docs/xroga` source-bound inventory and security evidence regenerated via the successful one-time workflow `41818609582`.
- This record does not claim an authenticated browser session was visually verified or that deployment is live before Vercel production alias validation.

## Release checks
Validate frontend build, baseline/tests, the exact live domain's new production commit, and preservation of the AI App Builder metadata. The white/Beige selection remains an explicit user appearance choice.
