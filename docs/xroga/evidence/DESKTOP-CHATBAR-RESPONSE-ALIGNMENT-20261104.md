# Desktop chat composer/assistant column restoration — 2026-11-04

## User reference
The earlier white conversation screenshot shows a 740px centered composer with soft depth, while the current beige desktop screenshot has a reply starting to the far left of the composer. The user's requested fix is alignment and shadow, not a theme or toolbar redesign.

## Scoped change
- `frontend/src/components/terminal/SwarmMessageLog.tsx`: attach a locally scoped legacy transcript class for chromeless non-V2 conversations. Existing user bubbles and rich response gates remain unchanged.
- `frontend/src/components/response-experience-v2/conversation-v2.module.css`: on viewports at least 601px, center the legacy transcript in a max 740px column with 16px inner inset; restore subtle shadow/glow to the existing single-frame composer for active conversations.
- The existing narrow-screen 18px assistant inset remains unchanged.
- Preserve the user's selected theme, toolbars, controls, AI response data, and AI App Builder SEO.

## Release evidence
- Verified production base SHA `21afd8d1e5f3a7efdefd9f3d5ae85fa9704aa90e`.
- One-time source inventory regeneration passed (GitHub Actions run `41855609214`); workflow removed from the final source.
- Only the two UI source files above plus generated repository evidence differ from the production base, before this release note.
- Build, review checks, and live production alias must still be verified before claiming the update is live.
