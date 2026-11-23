# Workspace chatbar presentation update

The user explicitly requested these changes and release to xroga.com.
Source baseline 460513c24b1376d6a5bd6a5c9a6f329f773fa591 has the same application
sources as the independently verified live ca6ef0ac5 release.

Mobile guidance becomes “Type or speak your language. Xroga does the work.”
at 10.5–11px. Larger views retain the full native-language sentence.
The headline sentence and ending list are retained; final words fade gently,
with measured width transitions and ordinary word spacing in a centered line.
The Chrome logo and Extension label share the workspace header with the
accessible project-edit icon. Workspace and automation headings use clear
sans-serif typography with solid foreground contrast.

Black Hole, Projects, Connect Apps and the plus menu share viewport sizing
below the full composer. Bottom-docked composers temporarily move upward
to make room, and scrollable menus stay within the visible keyboard viewport.
Outer popup shadows are removed. All project/app/approval/usage handlers remain
unchanged; this is not provider-execution or authenticated journey proof.

Verified source: `b7fb663cb1c1ba4e8d973dfaa909ef04d9bef9d8`.
All 1,634 frontend tests, 11 positive/negative policy tests, structured mission
validation and lint passed. Vercel production build/type checks passed.
The actual-component local browser fixture passed 40 cases: four popup types,
five viewports and both idle and bottom-docked composers. No external writes,
real auth sessions or provider requests were used in that isolated fixture.
See `workspace-chatbar-popovers-20261123/fixture-audit.json`.

The actual staged deployment passed all five viewports, including larger
single-row mobile guidance, inline header icons and Extension label, no popup
overflow/shadows, and centered smooth “extensions.” and “software.” endings.
See `workspace-chatbar-popovers-20261123/staged-audit.json`.
Promoted production deployment `dpl_J6MS6YH7tUf3JSTzkiuiAdTwLLpm` to xroga.com
through the authenticated Vercel CLI, using the verified project/team IDs
after the connector omitted its required project ID.
The public release endpoint and browser audit independently confirmed
`b7fb663cb1c1ba4e8d973dfaa909ef04d9bef9d8` in production.
Public checks passed at all five sizes, including both exact headline endings.
The bounded post-release error/fatal log check returned zero records.
See `workspace-chatbar-popovers-20261123/live-audit.json` and
`workspace-chatbar-popovers-20261123/runtime-summary.json`.

Extension visibility in the private header was preserved during the move.
Required browser evidence is retained with matching hashes; task temporary
files are cleaned separately from reusable dependencies and source outputs.

Initial regressions flagged expectations for the old
labels, gradients, blur and above-composer geometry; they are updated to the
requested behavior, retaining keyboard, action and authority coverage.
No auth, tenant, approval, credential, egress, cost, billing or schema changes.
Rollback is the prior verified Vercel deployment
dpl_F468UhXs78D5ostgfRQzxWKZi8gp. Automatic main deployment hold is retained.
