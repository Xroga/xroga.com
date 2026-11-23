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

Verification is pending. Initial regressions flagged expectations for the old
labels, gradients, blur and above-composer geometry; they are updated to the
requested behavior, retaining keyboard, action and authority coverage.
No auth, tenant, approval, credential, egress, cost, billing or schema changes.
Rollback is the prior verified Vercel deployment
dpl_F468UhXs78D5ostgfRQzxWKZi8gp. Automatic main deployment hold is retained.
